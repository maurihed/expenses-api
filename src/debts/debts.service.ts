import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { balanceDelta, TxType } from '../domain/balance';
import { debtBalance } from '../domain/debt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);
const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const round2 = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class DebtsService {
  constructor(private prisma: PrismaService) {}

  private toJson(debt: {
    id: string;
    type: string;
    counterparty: string;
    amount: unknown;
    currency: string;
    date: Date;
    dueDate: Date | null;
    notes: string | null;
    archived: boolean;
    payments: { amount: unknown }[];
  }) {
    const amount = Number(debt.amount);
    const balance = debtBalance(
      amount,
      debt.payments.map((payment) => Number(payment.amount)),
    );
    return {
      id: debt.id,
      type: debt.type.toLowerCase(),
      counterparty: debt.counterparty,
      amount,
      currency: debt.currency,
      date: toIsoDate(debt.date),
      dueDate: debt.dueDate ? toIsoDate(debt.dueDate) : null,
      notes: debt.notes,
      archived: debt.archived,
      paid: balance.paid,
      remaining: balance.remaining,
      status: balance.status,
    };
  }

  private async findDebtOrThrow(id: string) {
    const debt = await this.prisma.debt.findUnique({
      where: { id },
      include: { payments: { select: { amount: true } } },
    });
    if (!debt) throw new NotFoundException(`Debt ${id} not found`);
    return debt;
  }

  async findAll(includeArchived = false, type?: string) {
    const rows = await this.prisma.debt.findMany({
      where: {
        ...(includeArchived ? {} : { archived: false }),
        ...(type ? { type: type.toUpperCase() as 'RECEIVABLE' | 'PAYABLE' } : {}),
      },
      include: { payments: { select: { amount: true } } },
      orderBy: { date: 'desc' },
    });
    return rows.map((debt) => this.toJson(debt));
  }

  async findOne(id: string) {
    return this.toJson(await this.findDebtOrThrow(id));
  }

  async findPayments(id: string) {
    await this.findDebtOrThrow(id);
    const payments = await this.prisma.debtPayment.findMany({
      where: { debtId: id },
      orderBy: { date: 'desc' },
    });
    return payments.map((payment) => ({
      id: payment.id,
      debtId: payment.debtId,
      amount: Number(payment.amount),
      date: toIsoDate(payment.date),
      accountId: payment.accountId,
      transactionId: payment.transactionId,
      notes: payment.notes,
    }));
  }

  async create(dto: CreateDebtDto) {
    if (dto.dueDate && dto.dueDate < dto.date) {
      throw new BadRequestException('dueDate cannot be before date');
    }
    const debt = await this.prisma.debt.create({
      data: {
        type: dto.type === 'receivable' ? 'RECEIVABLE' : 'PAYABLE',
        counterparty: dto.counterparty,
        amount: dto.amount,
        currency: dto.currency,
        date: parseDate(dto.date),
        dueDate: dto.dueDate ? parseDate(dto.dueDate) : null,
        notes: dto.notes ?? null,
      },
      include: { payments: { select: { amount: true } } },
    });
    return this.toJson(debt);
  }

  async update(id: string, dto: UpdateDebtDto) {
    const current = await this.findDebtOrThrow(id);
    const paid = debtBalance(
      Number(current.amount),
      current.payments.map((payment) => Number(payment.amount)),
    ).paid;

    const data: Record<string, unknown> = {};
    if (dto.type !== undefined) data.type = dto.type === 'receivable' ? 'RECEIVABLE' : 'PAYABLE';
    if (dto.counterparty !== undefined) data.counterparty = dto.counterparty;
    if (dto.amount !== undefined) {
      if (dto.amount < paid) {
        throw new BadRequestException('amount cannot be less than already paid');
      }
      data.amount = dto.amount;
    }
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.date !== undefined) data.date = parseDate(dto.date);
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? parseDate(dto.dueDate) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const debt = await this.prisma.debt.update({
      where: { id },
      data,
      include: { payments: { select: { amount: true } } },
    });
    return this.toJson(debt);
  }

  async archive(id: string) {
    await this.findDebtOrThrow(id);
    const debt = await this.prisma.debt.update({
      where: { id },
      data: { archived: true },
      include: { payments: { select: { amount: true } } },
    });
    return this.toJson(debt);
  }

  async addPayment(debtId: string, dto: CreateDebtPaymentDto) {
    const debt = await this.findDebtOrThrow(debtId);
    if (debt.archived) {
      throw new BadRequestException(`Debt ${debtId} is archived`);
    }

    const { remaining } = debtBalance(
      Number(debt.amount),
      debt.payments.map((payment) => Number(payment.amount)),
    );
    if (round2(dto.amount) > remaining) {
      throw new BadRequestException(
        `Payment exceeds remaining balance (${remaining})`,
      );
    }

    const account = dto.accountId
      ? await this.prisma.account.findUnique({ where: { id: dto.accountId } })
      : null;
    if (dto.accountId && !account) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    const linkedType: TxType = debt.type === 'PAYABLE' ? 'EXPENSE' : 'INCOME';
    const date = parseDate(dto.date);

    await this.prisma.$transaction(async (db) => {
      let transactionId: string | null = null;

      if (account) {
        const delta = balanceDelta({
          type: linkedType,
          accountType: account.type,
          role: 'SOURCE',
          amount: dto.amount,
        });
        await db.account.update({
          where: { id: account.id },
          data: { balance: { increment: delta } },
        });
        const transaction = await db.transaction.create({
          data: {
            accountId: account.id,
            amount: dto.amount,
            type: linkedType,
            date,
            description: `Abono deuda: ${debt.counterparty}`,
          },
        });
        transactionId = transaction.id;
      }

      await db.debtPayment.create({
        data: {
          debtId,
          amount: dto.amount,
          date,
          accountId: account?.id ?? null,
          transactionId,
          notes: dto.notes ?? null,
        },
      });
    });

    return this.findOne(debtId);
  }

  async removePayment(debtId: string, paymentId: string) {
    const payment = await this.prisma.debtPayment.findUnique({
      where: { id: paymentId },
      include: { transaction: true },
    });
    if (!payment || payment.debtId !== debtId) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    await this.prisma.$transaction(async (db) => {
      if (payment.transaction) {
        const transaction = payment.transaction;
        const account = await db.account.findUnique({ where: { id: transaction.accountId } });
        if (account) {
          const reversal = balanceDelta({
            type: transaction.type as TxType,
            accountType: account.type,
            role: 'SOURCE',
            amount: -Number(transaction.amount),
          });
          await db.account.update({
            where: { id: account.id },
            data: { balance: { increment: reversal } },
          });
        }
      }

      await db.debtPayment.delete({ where: { id: paymentId } });
      if (payment.transactionId) {
        await db.transaction.delete({ where: { id: payment.transactionId } });
      }
    });

    return this.findOne(debtId);
  }
}
