import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { balanceDelta, TxType } from '../domain/balance';
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
    return {
      id: tx.id,
      accountId: tx.accountId,
      amount: Number(tx.amount),
      category: tx.category?.name ?? '',
      date: tx.date.toISOString().slice(0, 10),
      description: tx.description,
      type: tx.type.toLowerCase(),
    };
  }

  async create(dto: CreateTransactionDto) {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account || account.archived) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    const categoryId = await this.categories.resolveByName(dto.category);
    const type = dto.type.toUpperCase() as TxType;
    const delta = balanceDelta({
      type,
      accountType: account.type,
      role: 'SOURCE',
      amount: dto.amount,
    });

    const tx = await this.prisma.$transaction(async (db) => {
      await db.account.update({
        where: { id: account.id },
        data: { balance: { increment: delta } },
      });
      return db.transaction.create({
        data: {
          accountId: account.id,
          amount: dto.amount,
          type,
          categoryId,
          date: new Date(`${dto.date}T00:00:00.000Z`),
          description: dto.description,
        },
      });
    });

    return { id: tx.id };
  }

  async findByMonth(month: number, year: number) {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 1));
    const rows = await this.prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      include: { category: true },
      orderBy: { date: 'asc' },
    });
    return rows.map((tx) => this.toJson(tx));
  }

  async update(id: string, dto: UpdateTransactionDto) {
    const current = await this.prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transaction ${id} not found`);

    const accountId = dto.accountId ?? current.accountId;
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.archived) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const oldAccount =
      account.id === current.accountId
        ? account
        : await this.prisma.account.findUnique({ where: { id: current.accountId } });
    if (!oldAccount) throw new NotFoundException(`Account ${current.accountId} not found`);

    const type = (dto.type ?? current.type.toLowerCase()) as 'income' | 'expense';
    const newType = type.toUpperCase() as TxType;
    const amount = dto.amount ?? Number(current.amount);
    const categoryId =
      dto.category !== undefined
        ? await this.categories.resolveByName(dto.category)
        : current.categoryId;

    const reverseDelta = balanceDelta({
      type: current.type as TxType,
      accountType: oldAccount.type,
      role: 'SOURCE',
      amount: -Number(current.amount),
    });
    const applyDelta = balanceDelta({
      type: newType,
      accountType: account.type,
      role: 'SOURCE',
      amount,
    });

    const updated = await this.prisma.$transaction(async (db) => {
      await db.account.update({
        where: { id: oldAccount.id },
        data: { balance: { increment: reverseDelta } },
      });
      await db.account.update({
        where: { id: account.id },
        data: { balance: { increment: applyDelta } },
      });
      return db.transaction.update({
        where: { id },
        data: {
          accountId: account.id,
          amount,
          type: newType,
          categoryId,
          date:
            dto.date !== undefined
              ? new Date(`${dto.date}T00:00:00.000Z`)
              : current.date,
          description: dto.description ?? current.description,
        },
        include: { category: true },
      });
    });

    return this.toJson(updated);
  }

  async remove(id: string) {
    const current = await this.prisma.transaction.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Transaction ${id} not found`);

    const account = await this.prisma.account.findUnique({ where: { id: current.accountId } });
    if (!account) throw new NotFoundException(`Account ${current.accountId} not found`);

    const reverseDelta = balanceDelta({
      type: current.type as TxType,
      accountType: account.type,
      role: 'SOURCE',
      amount: -Number(current.amount),
    });

    await this.prisma.$transaction(async (db) => {
      await db.account.update({
        where: { id: account.id },
        data: { balance: { increment: reverseDelta } },
      });
      await db.transaction.delete({ where: { id } });
    });

    return { id };
  }
}
