import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CategoriesService } from '../categories/categories.service';
import { AccountType, balanceDelta, TxType } from '../domain/balance';
import { splitInstallments } from '../domain/installments';
import { clampDayOfMonth } from '../domain/recurring';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
  ) {}

  private toJson(tx: any) {
    const base = {
      id: tx.id,
      accountId: tx.accountId,
      amount: Number(tx.amount),
      category: tx.category?.name ?? '',
      date: tx.date.toISOString().slice(0, 10),
      description: tx.description,
      type: tx.type.toLowerCase(),
      scope: tx.scope.toLowerCase(),
      personId: tx.personId ?? null,
      installments: tx.installments ?? null,
    };
    return tx.type === 'TRANSFER' ? { ...base, toAccountId: tx.toAccountId ?? null } : base;
  }

  private installmentDueDate(start: Date, index: number): Date {
    return clampDayOfMonth(
      start.getUTCFullYear(),
      start.getUTCMonth() + index,
      start.getUTCDate(),
    );
  }

  private async createInstallmentPlan(
    db: Prisma.TransactionClient,
    tx: { id: string; accountId: string; date: Date },
    total: number,
    installments: number,
  ) {
    const plan = await db.installmentPlan.create({
      data: {
        accountId: tx.accountId,
        transactionId: tx.id,
        totalAmount: total,
        installments,
        startDate: tx.date,
      },
    });
    const amounts = splitInstallments(total, installments);
    await db.installment.createMany({
      data: amounts.map((amount, index) => ({
        planId: plan.id,
        number: index + 1,
        dueDate: this.installmentDueDate(tx.date, index),
        amount,
      })),
    });
  }

  private async resolveScope(
    requested: { scope?: 'joint' | 'personal'; personId?: string },
    current?: { scope: string; personId: string | null },
  ): Promise<{ scope: 'JOINT' | 'PERSONAL'; personId: string | null }> {
    const scope = requested.scope ?? current?.scope.toLowerCase() ?? 'joint';
    if (scope !== 'personal') {
      return { scope: 'JOINT', personId: null };
    }
    const personId =
      requested.personId !== undefined ? requested.personId : (current?.personId ?? null);
    if (!personId) {
      throw new BadRequestException('personId is required when scope is personal');
    }
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) {
      throw new NotFoundException(`Person ${personId} not found`);
    }
    return { scope: 'PERSONAL', personId };
  }

  private async resolveDestination(
    toAccountId: string | undefined,
    sourceAccountId: string,
    { allowArchived = false }: { allowArchived?: boolean } = {},
  ) {
    if (!toAccountId) {
      throw new BadRequestException('toAccountId is required for transfers');
    }
    if (toAccountId === sourceAccountId) {
      throw new BadRequestException('toAccountId must be different from accountId');
    }
    const destination = await this.prisma.account.findUnique({ where: { id: toAccountId } });
    if (!destination || (!allowArchived && destination.archived)) {
      throw new BadRequestException(`Account ${toAccountId} not found`);
    }
    return destination;
  }

  private async assertNotDebtPayment(transactionId: string) {
    const linked = await this.prisma.debtPayment.findUnique({
      where: { transactionId },
      select: { id: true },
    });
    if (linked) {
      throw new BadRequestException(
        'This transaction is a debt payment; manage it from the debts page',
      );
    }
  }

  async create(dto: CreateTransactionDto) {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account || account.archived) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    const type = dto.type.toUpperCase() as TxType;
    const { scope, personId } = await this.resolveScope(dto);

    const installments = dto.installments ?? null;
    if (installments !== null) {
      if (type !== 'EXPENSE') {
        throw new BadRequestException('installments are only allowed for expense transactions');
      }
      if (account.type !== 'CREDIT') {
        throw new BadRequestException('installments are only allowed on CREDIT accounts');
      }
    }

    if (type === 'TRANSFER') {
      const destination = await this.resolveDestination(dto.toAccountId, account.id);
      const sourceDelta = balanceDelta({
        type,
        accountType: account.type,
        role: 'SOURCE',
        amount: dto.amount,
      });
      const destinationDelta = balanceDelta({
        type,
        accountType: destination.type,
        role: 'DESTINATION',
        amount: dto.amount,
      });

      const tx = await this.prisma.$transaction(async (db) => {
        await db.account.update({
          where: { id: account.id },
          data: { balance: { increment: sourceDelta } },
        });
        await db.account.update({
          where: { id: destination.id },
          data: { balance: { increment: destinationDelta } },
        });
        return db.transaction.create({
          data: {
            accountId: account.id,
            toAccountId: destination.id,
            amount: dto.amount,
            type,
            date: new Date(`${dto.date}T00:00:00.000Z`),
            description: dto.description ?? '',
            scope,
            personId,
          },
        });
      });

      return { id: tx.id };
    }

    const delta = balanceDelta({
      type,
      accountType: account.type,
      role: 'SOURCE',
      amount: dto.amount,
    });

    const categoryId = await this.categories.resolveByName(dto.category);

    const tx = await this.prisma.$transaction(async (db) => {
      await db.account.update({
        where: { id: account.id },
        data: { balance: { increment: delta } },
      });
      const created = await db.transaction.create({
        data: {
          accountId: account.id,
          amount: dto.amount,
          type,
          categoryId,
          date: new Date(`${dto.date}T00:00:00.000Z`),
          description: dto.description ?? '',
          scope,
          personId,
          installments,
        },
      });
      if (installments !== null) {
        await this.createInstallmentPlan(db, created, dto.amount, installments);
      }
      return created;
    });

    return { id: tx.id };
  }

  async findByMonth(month: number, year: number) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const rows = await this.prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      include: { category: true },
      orderBy: { date: 'desc' },
    });
    return rows.map((tx) => this.toJson(tx));
  }

  async update(id: string, dto: UpdateTransactionDto) {
    const current = await this.prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transaction ${id} not found`);
    await this.assertNotDebtPayment(id);

    const { scope, personId } = await this.resolveScope(dto, {
      scope: current.scope,
      personId: current.personId,
    });

    const accountId = dto.accountId ?? current.accountId;
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const currentType = current.type as TxType;
    const newType = (dto.type ?? current.type.toLowerCase()).toUpperCase() as TxType;
    const amount = dto.amount ?? Number(current.amount);

    const installments =
      dto.installments === undefined ? current.installments : dto.installments;
    if (installments !== null) {
      if (newType !== 'EXPENSE') {
        throw new BadRequestException('installments are only allowed for expense transactions');
      }
      if (account.type !== 'CREDIT') {
        throw new BadRequestException('installments are only allowed on CREDIT accounts');
      }
    }

    const newDate =
      dto.date !== undefined ? new Date(`${dto.date}T00:00:00.000Z`) : current.date;
    const shouldRegenerate =
      current.installments !== installments ||
      Number(current.amount) !== amount ||
      current.accountId !== account.id ||
      current.date.getTime() !== newDate.getTime();

    const oldSource =
      account.id === current.accountId
        ? account
        : await this.prisma.account.findUnique({ where: { id: current.accountId } });
    if (!oldSource) throw new NotFoundException(`Account ${current.accountId} not found`);

    const currentToAccountId = currentType === 'TRANSFER' ? current.toAccountId : null;
    const oldDestination = currentToAccountId
      ? await this.prisma.account.findUnique({ where: { id: currentToAccountId } })
      : null;
    if (currentToAccountId && !oldDestination) {
      throw new NotFoundException(`Account ${currentToAccountId} not found`);
    }

    let newToAccountId: string | null = null;
    let newDestination: { id: string; type: AccountType } | null = null;
    if (newType === 'TRANSFER') {
      const resolved = await this.resolveDestination(
        dto.toAccountId ?? currentToAccountId ?? undefined,
        account.id,
        { allowArchived: true },
      );
      newToAccountId = resolved.id;
      newDestination = resolved;
    }

    const balanceChanges: { id: string; delta: number }[] = [
      {
        id: current.accountId,
        delta: balanceDelta({
          type: currentType,
          accountType: oldSource.type,
          role: 'SOURCE',
          amount: -Number(current.amount),
        }),
      },
    ];
    if (oldDestination && currentToAccountId) {
      balanceChanges.push({
        id: currentToAccountId,
        delta: balanceDelta({
          type: 'TRANSFER',
          accountType: oldDestination.type,
          role: 'DESTINATION',
          amount: -Number(current.amount),
        }),
      });
    }
    balanceChanges.push({
      id: account.id,
      delta: balanceDelta({
        type: newType,
        accountType: account.type,
        role: 'SOURCE',
        amount,
      }),
    });
    if (newDestination && newToAccountId) {
      balanceChanges.push({
        id: newToAccountId,
        delta: balanceDelta({
          type: 'TRANSFER',
          accountType: newDestination.type,
          role: 'DESTINATION',
          amount,
        }),
      });
    }

    const categoryId =
      newType === 'TRANSFER'
        ? null
        : dto.category !== undefined
          ? await this.categories.resolveByName(dto.category)
          : current.categoryId;

    const updated = await this.prisma.$transaction(async (db) => {
      for (const change of balanceChanges) {
        await db.account.update({
          where: { id: change.id },
          data: { balance: { increment: change.delta } },
        });
      }
      const existingPlan = await db.installmentPlan.findUnique({
        where: { transactionId: id },
      });
      if (existingPlan && (installments === null || shouldRegenerate)) {
        await db.installment.deleteMany({ where: { planId: existingPlan.id } });
        await db.installmentPlan.delete({ where: { id: existingPlan.id } });
      }
      const saved = await db.transaction.update({
        where: { id },
        data: {
          accountId: account.id,
          amount,
          type: newType,
          toAccountId: newType === 'TRANSFER' ? newToAccountId : null,
          categoryId,
          date: newDate,
          description: dto.description ?? current.description,
          scope,
          personId,
          installments,
        },
        include: { category: true },
      });
      if (installments !== null && (!existingPlan || shouldRegenerate)) {
        await this.createInstallmentPlan(db, saved, amount, installments);
      }
      return saved;
    });

    return this.toJson(updated);
  }

  async remove(id: string) {
    const current = await this.prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transaction ${id} not found`);
    await this.assertNotDebtPayment(id);

    const account = await this.prisma.account.findUnique({ where: { id: current.accountId } });
    if (!account) throw new NotFoundException(`Account ${current.accountId} not found`);

    const balanceChanges: { id: string; delta: number }[] = [
      {
        id: account.id,
        delta: balanceDelta({
          type: current.type as TxType,
          accountType: account.type,
          role: 'SOURCE',
          amount: -Number(current.amount),
        }),
      },
    ];
    if (current.type === 'TRANSFER' && current.toAccountId) {
      const destination = await this.prisma.account.findUnique({
        where: { id: current.toAccountId },
      });
      if (!destination) {
        throw new NotFoundException(`Account ${current.toAccountId} not found`);
      }
      balanceChanges.push({
        id: destination.id,
        delta: balanceDelta({
          type: 'TRANSFER',
          accountType: destination.type,
          role: 'DESTINATION',
          amount: -Number(current.amount),
        }),
      });
    }

    await this.prisma.$transaction(async (db) => {
      for (const change of balanceChanges) {
        await db.account.update({
          where: { id: change.id },
          data: { balance: { increment: change.delta } },
        });
      }
      const plan = await db.installmentPlan.findUnique({ where: { transactionId: id } });
      if (plan) {
        await db.installment.deleteMany({ where: { planId: plan.id } });
        await db.installmentPlan.delete({ where: { id: plan.id } });
      }
      await db.transaction.delete({ where: { id } });
    });

    return { id };
  }
}
