import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { AccountType, balanceDelta, TxType } from '../domain/balance';
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
    };
    return tx.type === 'TRANSFER' ? { ...base, toAccountId: tx.toAccountId ?? null } : base;
  }

  private async resolveDestination(toAccountId: string | undefined, sourceAccountId: string) {
    if (!toAccountId) {
      throw new BadRequestException('toAccountId is required for transfers');
    }
    if (toAccountId === sourceAccountId) {
      throw new BadRequestException('toAccountId must be different from accountId');
    }
    const destination = await this.prisma.account.findUnique({ where: { id: toAccountId } });
    if (!destination || destination.archived) {
      throw new BadRequestException(`Account ${toAccountId} not found`);
    }
    return destination;
  }

  async create(dto: CreateTransactionDto) {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account || account.archived) {
      throw new NotFoundException(`Account ${dto.accountId} not found`);
    }

    const type = dto.type.toUpperCase() as TxType;

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

    const tx = await this.prisma.$transaction(async (db) => {
      const categoryId = await this.categories.resolveByName(dto.category, db);
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
          description: dto.description ?? '',
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
      orderBy: { date: 'desc' },
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

    const currentType = current.type as TxType;
    const newType = (dto.type ?? current.type.toLowerCase()).toUpperCase() as TxType;
    const amount = dto.amount ?? Number(current.amount);

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

    const updated = await this.prisma.$transaction(async (db) => {
      const categoryId =
        newType === 'TRANSFER'
          ? null
          : dto.category !== undefined
            ? await this.categories.resolveByName(dto.category, db)
            : current.categoryId;
      for (const change of balanceChanges) {
        await db.account.update({
          where: { id: change.id },
          data: { balance: { increment: change.delta } },
        });
      }
      return db.transaction.update({
        where: { id },
        data: {
          accountId: account.id,
          amount,
          type: newType,
          toAccountId: newType === 'TRANSFER' ? newToAccountId : null,
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
      if (destination) {
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
    }

    await this.prisma.$transaction(async (db) => {
      for (const change of balanceChanges) {
        await db.account.update({
          where: { id: change.id },
          data: { balance: { increment: change.delta } },
        });
      }
      await db.transaction.delete({ where: { id } });
    });

    return { id };
  }
}
