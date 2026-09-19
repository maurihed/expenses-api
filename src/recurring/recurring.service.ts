import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountType, balanceDelta, TxType } from '../domain/balance';
import { computeInterest, InterestTier } from '../domain/interest';
import { nextOccurrence, RecurringFrequency } from '../domain/recurring';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRecurringRuleDto, RecurringScopeValue, RecurringTypeValue } from './dto/create-recurring-rule.dto';
import { UpdateRecurringRuleDto } from './dto/update-recurring-rule.dto';

interface InterestTierInput {
  upTo: number | null;
  annualRate: number;
}

interface NormalizedInput {
  name: string;
  type: RecurringTypeValue;
  accountId: string;
  categoryId?: string | null;
  scope?: RecurringScopeValue | null;
  personId?: string | null;
  amount?: number | null;
  frequency?: RecurringFrequency | null;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string;
  endDate?: string | null;
  interestTiers?: unknown;
}

@Injectable()
export class RecurringService {
  private readonly logger = new Logger(RecurringService.name);

  constructor(private prisma: PrismaService) {}

  private parseDate(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private previousDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - 1));
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private parseTiers(value: Prisma.JsonValue | null): InterestTier[] {
    return Array.isArray(value) ? (value as unknown as InterestTier[]) : [];
  }

  /**
   * Materializes a single occurrence. Returns the amount recorded and the
   * created transaction id (null when no transaction was needed, e.g. an
   * INTEREST occurrence whose computed interest is 0).
   */
  private async materialize(
    db: Prisma.TransactionClient,
    rule: {
      id: string;
      name: string;
      type: string;
      accountId: string;
      categoryId: string | null;
      scope: any;
      personId: string | null;
      amount: Prisma.Decimal | null;
      interestTiers: Prisma.JsonValue | null;
    },
    account: { id: string; type: string; balance: Prisma.Decimal },
    date: Date,
  ): Promise<{ amount: number; transactionId: string | null }> {
    let amount: number;
    let txType: TxType;

    if (rule.type === 'INTEREST') {
      amount = computeInterest(Number(account.balance), this.parseTiers(rule.interestTiers));
      if (amount <= 0) {
        return { amount: 0, transactionId: null };
      }
      txType = 'INCOME';
    } else if (rule.type === 'INCOME') {
      amount = Number(rule.amount);
      txType = 'INCOME';
    } else {
      amount = Number(rule.amount);
      txType = 'EXPENSE';
    }

    const delta = balanceDelta({
      type: txType,
      accountType: account.type as AccountType,
      role: 'SOURCE',
      amount,
    });

    await db.account.update({
      where: { id: account.id },
      data: { balance: { increment: delta } },
    });

    const transaction = await db.transaction.create({
      data: {
        accountId: rule.accountId,
        amount,
        type: txType,
        categoryId: rule.categoryId,
        date,
        description: rule.name,
        scope: rule.scope,
        personId: rule.personId,
      },
    });

    return { amount, transactionId: transaction.id };
  }

  /**
   * Idempotently materializes every active rule occurrence due on or before
   * `asOf` (normalized to a UTC calendar day). Each rule runs inside its own
   * `$transaction` so a partial failure cannot leave balances, transactions
   * and occurrences out of sync. Re-running is safe: the unique
   * `(ruleId, date)` constraint on `RecurringOccurrence` is checked before
   * writing, and existing occurrences are counted as `skipped`.
   *
   * Failures are isolated per rule: a throwing rule is logged and counted in
   * `failed`, then the sweep continues with the remaining rules so one bad
   * rule cannot starve the rest.
   */
  async runDue(asOf: Date): Promise<{ created: number; skipped: number; failed: number }> {
    const asOfDay = this.startOfUtcDay(asOf);
    const rules = await this.prisma.recurringRule.findMany({
      where: { active: true, nextRunDate: { lte: asOfDay } },
      orderBy: { createdAt: 'asc' },
    });

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const rule of rules) {
      try {
        const result = await this.prisma.$transaction(async (db) => {
          let ruleCreated = 0;
          let ruleSkipped = 0;
          let nextRunDate = rule.nextRunDate;

          while (
            nextRunDate.getTime() <= asOfDay.getTime() &&
            (rule.endDate === null || nextRunDate.getTime() <= rule.endDate.getTime())
          ) {
            const occurrenceDate = nextRunDate;
            const existing = await db.recurringOccurrence.findUnique({
              where: { ruleId_date: { ruleId: rule.id, date: occurrenceDate } },
            });

            if (existing) {
              ruleSkipped += 1;
            } else {
              const account = await db.account.findUniqueOrThrow({
                where: { id: rule.accountId },
              });
              const { amount, transactionId } = await this.materialize(
                db,
                rule,
                account,
                occurrenceDate,
              );
              await db.recurringOccurrence.create({
                data: { ruleId: rule.id, date: occurrenceDate, amount, transactionId },
              });
              ruleCreated += 1;
            }

            nextRunDate = nextOccurrence(
              rule.frequency.toLowerCase() as RecurringFrequency,
              occurrenceDate,
              rule.dayOfMonth,
              rule.dayOfWeek,
            );
            await db.recurringRule.update({
              where: { id: rule.id },
              data: { nextRunDate, lastRunDate: occurrenceDate },
            });
          }

          return { created: ruleCreated, skipped: ruleSkipped };
        });

        created += result.created;
        skipped += result.skipped;
      } catch (error) {
        failed += 1;
        this.logger.error(
          `Recurring rule ${rule.id} (${rule.name}) failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return { created, skipped, failed };
  }

  private parseInterestTiers(value: unknown): InterestTierInput[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException('interestTiers must be a non-empty array');
    }
    const tiers = value.map((raw): InterestTierInput => {
      if (typeof raw !== 'object' || raw === null) {
        throw new BadRequestException('each interest tier must be an object');
      }
      const upTo = (raw as Record<string, unknown>).upTo;
      const annualRate = (raw as Record<string, unknown>).annualRate;
      if (upTo !== null && (typeof upTo !== 'number' || !Number.isFinite(upTo))) {
        throw new BadRequestException('interest tier upTo must be a number or null');
      }
      if (typeof annualRate !== 'number' || !Number.isFinite(annualRate) || annualRate < 0) {
        throw new BadRequestException('interest tier annualRate must be a number >= 0');
      }
      return { upTo: upTo as number | null, annualRate };
    });
    const last = tiers[tiers.length - 1];
    const nullCount = tiers.filter((tier) => tier.upTo === null).length;
    if (last.upTo !== null || nullCount !== 1) {
      throw new BadRequestException(
        'interestTiers must end with exactly one tier whose upTo is null',
      );
    }
    return tiers;
  }

  private async buildData(
    input: NormalizedInput,
    { allowArchivedAccount = false }: { allowArchivedAccount?: boolean } = {},
  ): Promise<any> {
    const type = input.type;
    const frequency = (input.frequency ?? 'monthly') as RecurringFrequency;

    if (type === 'interest' && frequency !== 'monthly') {
      throw new BadRequestException('interest rules must use monthly frequency');
    }

    let amount: number | null = null;
    let interestTiers: any = Prisma.DbNull;

    if (type === 'interest') {
      if (input.amount !== undefined && input.amount !== null) {
        throw new BadRequestException('amount is not allowed for interest rules');
      }
      interestTiers = this.parseInterestTiers(input.interestTiers);
    } else {
      if (input.amount === undefined || input.amount === null || !(input.amount > 0)) {
        throw new BadRequestException('amount is required and must be greater than 0');
      }
      amount = input.amount;
    }

    const account = await this.prisma.account.findUnique({ where: { id: input.accountId } });
    if (!account) throw new NotFoundException(`Account ${input.accountId} not found`);
    if (account.archived && !allowArchivedAccount) {
      throw new BadRequestException(`Account ${input.accountId} is archived`);
    }

    let categoryId: string | null = null;
    if (input.categoryId !== undefined && input.categoryId !== null) {
      const category = await this.prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new NotFoundException(`Category ${input.categoryId} not found`);
      categoryId = category.id;
    }

    const scope = (input.scope ?? 'joint') as RecurringScopeValue;
    let personId: string | null = null;
    if (scope === 'personal') {
      if (!input.personId) {
        throw new BadRequestException('personId is required when scope is personal');
      }
      const person = await this.prisma.person.findUnique({ where: { id: input.personId } });
      if (!person) throw new NotFoundException(`Person ${input.personId} not found`);
      personId = input.personId;
    }

    const startDate = this.parseDate(input.startDate);
    let endDate: Date | null = null;
    if (input.endDate !== undefined && input.endDate !== null) {
      endDate = this.parseDate(input.endDate);
      if (endDate.getTime() < startDate.getTime()) {
        throw new BadRequestException('endDate must be on or after startDate');
      }
    }

    let dayOfMonth: number | null = null;
    let dayOfWeek: number | null = null;
    if (frequency === 'monthly') {
      dayOfMonth = input.dayOfMonth ?? startDate.getUTCDate();
    } else {
      dayOfWeek = input.dayOfWeek ?? startDate.getUTCDay();
    }

    // nextRunDate = first occurrence on/after startDate. nextOccurrence is
    // strictly-after `from`, so we start from the previous day: when startDate
    // already matches the rule pattern it is returned as-is.
    const nextRunDate = nextOccurrence(
      frequency,
      this.previousDay(startDate),
      dayOfMonth,
      dayOfWeek,
    );

    return {
      name: input.name,
      type: type.toUpperCase(),
      accountId: input.accountId,
      categoryId,
      scope: scope.toUpperCase(),
      personId,
      amount,
      frequency: frequency.toUpperCase(),
      dayOfMonth,
      dayOfWeek,
      startDate,
      endDate,
      nextRunDate,
      interestTiers,
    };
  }

  private toJson(rule: any) {
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type.toLowerCase(),
      accountId: rule.accountId,
      categoryId: rule.categoryId ?? null,
      scope: rule.scope.toLowerCase(),
      personId: rule.personId ?? null,
      amount: rule.amount == null ? null : Number(rule.amount),
      frequency: rule.frequency.toLowerCase(),
      dayOfMonth: rule.dayOfMonth ?? null,
      dayOfWeek: rule.dayOfWeek ?? null,
      startDate: rule.startDate.toISOString().slice(0, 10),
      endDate: rule.endDate ? rule.endDate.toISOString().slice(0, 10) : null,
      nextRunDate: rule.nextRunDate.toISOString().slice(0, 10),
      lastRunDate: rule.lastRunDate ? rule.lastRunDate.toISOString().slice(0, 10) : null,
      interestTiers: rule.interestTiers ?? null,
      active: rule.active,
    };
  }

  async findAll(includeInactive = false) {
    const rows = await this.prisma.recurringRule.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((rule) => this.toJson(rule));
  }

  async create(dto: CreateRecurringRuleDto) {
    const data = await this.buildData({
      name: dto.name,
      type: dto.type,
      accountId: dto.accountId,
      categoryId: dto.categoryId,
      scope: dto.scope,
      personId: dto.personId,
      amount: dto.amount,
      frequency: dto.frequency,
      dayOfMonth: dto.dayOfMonth,
      dayOfWeek: dto.dayOfWeek,
      startDate: dto.startDate,
      endDate: dto.endDate,
      interestTiers: dto.interestTiers,
    });
    const rule = await this.prisma.recurringRule.create({ data });
    return this.toJson(rule);
  }

  async update(id: string, dto: UpdateRecurringRuleDto) {
    const current = await this.prisma.recurringRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Recurring rule ${id} not found`);

    const accountChanged =
      dto.accountId !== undefined && dto.accountId !== current.accountId;

    const data = await this.buildData(
      {
        name: dto.name ?? current.name,
        type: (dto.type ?? current.type.toLowerCase()) as RecurringTypeValue,
        accountId: dto.accountId ?? current.accountId,
        categoryId: dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
        scope: (dto.scope ?? current.scope.toLowerCase()) as RecurringScopeValue,
        personId: dto.personId !== undefined ? dto.personId : current.personId,
        amount: dto.amount !== undefined ? dto.amount : current.amount == null ? null : Number(current.amount),
        frequency: dto.frequency ?? (current.frequency.toLowerCase() as RecurringFrequency),
        dayOfMonth: dto.dayOfMonth !== undefined ? dto.dayOfMonth : current.dayOfMonth,
        dayOfWeek: dto.dayOfWeek !== undefined ? dto.dayOfWeek : current.dayOfWeek,
        startDate: dto.startDate ?? current.startDate.toISOString().slice(0, 10),
        endDate: dto.endDate !== undefined ? dto.endDate : current.endDate
          ? current.endDate.toISOString().slice(0, 10)
          : null,
        interestTiers:
          dto.interestTiers !== undefined ? dto.interestTiers : current.interestTiers ?? undefined,
      },
      { allowArchivedAccount: !accountChanged },
    );

    const datesChanged =
      dto.startDate !== undefined ||
      dto.frequency !== undefined ||
      dto.dayOfMonth !== undefined ||
      dto.dayOfWeek !== undefined;
    if (!datesChanged) data.nextRunDate = current.nextRunDate;

    const rule = await this.prisma.recurringRule.update({ where: { id }, data });
    return this.toJson(rule);
  }

  async deactivate(id: string) {
    const current = await this.prisma.recurringRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Recurring rule ${id} not found`);
    const rule = await this.prisma.recurringRule.update({
      where: { id },
      data: { active: false },
    });
    return this.toJson(rule);
  }
}
