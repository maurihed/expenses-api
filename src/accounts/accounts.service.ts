import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeOpeningBalance } from '../domain/balance';
import {
  creditPeriodRange,
  initialDebtDue,
  isAfterCreditPeriod,
  isInCreditPeriod,
} from '../domain/credit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { HoldingsService, PortfolioSummary } from './holdings.service';

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private holdings: HoldingsService,
  ) {}

  private todayUtc(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private toJson(a: any, summary?: PortfolioSummary) {
    const base = {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance: Number(a.balance),
      creditLimit: a.creditLimit == null ? null : Number(a.creditLimit),
      statementClosingDay: a.statementClosingDay ?? null,
      paymentDueDay: a.paymentDueDay ?? null,
      initialDebt: a.initialDebt == null ? null : Number(a.initialDebt),
      archived: a.archived,
    };
    if (!summary) return base;
    return {
      ...base,
      cashBalance: summary.cashBalance,
      positionsValue: summary.positionsValue,
      totalValue: summary.totalValue,
      changePercent: summary.changePercent,
      stale: summary.stale,
    };
  }

  async findAll(includeArchived = false) {
    const rows = await this.prisma.account.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: 'asc' },
    });
    const summaries = await this.holdings.summariesForAccounts(rows);
    return rows.map((a) => this.toJson(a, summaries.get(a.id)));
  }

  async findOne(id: string) {
    const a = await this.prisma.account.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Account ${id} not found`);
    return this.toJson(a);
  }

  async create(dto: CreateAccountDto) {
    const isCredit = dto.type === 'CREDIT';
    const initialDebt = isCredit && dto.initialDebt != null ? dto.initialDebt : null;
    // Para tarjetas, la deuda inicial ES el saldo de arranque (una sola captura).
    const balance = initialDebt ?? dto.balance ?? 0;
    const data: any = { name: dto.name, openingBalance: balance, balance };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;
    if (dto.statementClosingDay !== undefined) data.statementClosingDay = dto.statementClosingDay;
    if (dto.paymentDueDay !== undefined) data.paymentDueDay = dto.paymentDueDay;
    if (initialDebt != null) {
      data.initialDebt = initialDebt;
      data.initialDebtDate = this.todayUtc();
    }
    const a = await this.prisma.account.create({ data });
    return this.toJson(a);
  }

  async update(id: string, dto: UpdateAccountDto) {
    const current = await this.prisma.account.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Account ${id} not found`);
    const resultingType = dto.type ?? current.type;
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.initialDebt !== undefined && resultingType === 'CREDIT') {
      // La deuda inicial fija el saldo; solo se re-fecha si el monto cambió.
      const netEffect = Number(current.balance) - Number(current.openingBalance);
      data.openingBalance = computeOpeningBalance(dto.initialDebt, netEffect);
      data.balance = dto.initialDebt;
      data.initialDebt = dto.initialDebt;
      const changed =
        current.initialDebt == null || Number(current.initialDebt) !== dto.initialDebt;
      if (changed) data.initialDebtDate = this.todayUtc();
    } else if (dto.balance !== undefined) {
      const netEffect = Number(current.balance) - Number(current.openingBalance);
      data.openingBalance = computeOpeningBalance(dto.balance, netEffect);
      data.balance = dto.balance;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;
    if (dto.statementClosingDay !== undefined) data.statementClosingDay = dto.statementClosingDay;
    if (dto.paymentDueDay !== undefined) data.paymentDueDay = dto.paymentDueDay;
    const a = await this.prisma.account.update({ where: { id }, data });
    return this.toJson(a);
  }

  async archive(id: string) {
    const current = await this.prisma.account.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Account ${id} not found`);
    const a = await this.prisma.account.update({ where: { id }, data: { archived: true } });
    return this.toJson(a);
  }

  async creditSummary(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.type !== 'CREDIT') {
      throw new BadRequestException(`Account ${id} is not a credit account`);
    }

    const [charges, payments, installments] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { accountId: id, type: 'EXPENSE', installmentPlan: null },
        select: { date: true, amount: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          OR: [
            { accountId: id, type: 'INCOME' },
            { toAccountId: id, type: 'TRANSFER' },
          ],
        },
        select: { date: true, amount: true },
      }),
      this.prisma.installment.findMany({
        where: { plan: { accountId: id } },
        select: { dueDate: true, amount: true },
      }),
    ]);

    const range = creditPeriodRange(account.statementClosingDay ?? 1, new Date());

    const nonMsiCharges = charges.reduce(
      (sum, t) => (isInCreditPeriod(t.date, range) ? sum + Number(t.amount) : sum),
      0,
    );
    const periodPayments = payments.reduce(
      (sum, t) => (isInCreditPeriod(t.date, range) ? sum + Number(t.amount) : sum),
      0,
    );
    const msiDue = installments.reduce(
      (sum, i) => (isInCreditPeriod(i.dueDate, range) ? sum + Number(i.amount) : sum),
      0,
    );
    const msiCommitted = installments.reduce(
      (sum, i) => (isAfterCreditPeriod(i.dueDate, range) ? sum + Number(i.amount) : sum),
      0,
    );

    const initialDue = initialDebtDue(
      account.initialDebt == null ? null : Number(account.initialDebt),
      account.initialDebtDate,
      range,
    );

    const totalDebt = Number(account.balance);
    const periodPayment = Math.max(0, nonMsiCharges + msiDue + initialDue - periodPayments);
    const available = account.creditLimit == null ? null : Number(account.creditLimit) - totalDebt;

    return { totalDebt, periodPayment, available, msiCommitted, initialDebtDue: initialDue };
  }
}
