import { Injectable, NotFoundException } from '@nestjs/common';
import { CategoriesService } from '../categories/categories.service';
import { balanceDelta, TxType } from '../domain/balance';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    private prisma: PrismaService,
    private categories: CategoriesService,
  ) {}

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
}
