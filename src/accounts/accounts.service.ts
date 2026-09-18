import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { computeOpeningBalance } from '../domain/balance';
import { creditPeriodPayment } from '../domain/credit';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  private toJson(a: any) {
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance: Number(a.balance),
      creditLimit: a.creditLimit == null ? null : Number(a.creditLimit),
      statementClosingDay: a.statementClosingDay ?? null,
      paymentDueDay: a.paymentDueDay ?? null,
      archived: a.archived,
    };
  }

  async findAll(includeArchived = false) {
    const rows = await this.prisma.account.findMany({
      where: includeArchived ? {} : { archived: false },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((a) => this.toJson(a));
  }

  async findOne(id: string) {
    const a = await this.prisma.account.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`Account ${id} not found`);
    return this.toJson(a);
  }

  async create(dto: CreateAccountDto) {
    const balance = dto.balance ?? 0;
    const data: any = { name: dto.name, openingBalance: balance, balance };
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.creditLimit !== undefined) data.creditLimit = dto.creditLimit;
    if (dto.statementClosingDay !== undefined) data.statementClosingDay = dto.statementClosingDay;
    if (dto.paymentDueDay !== undefined) data.paymentDueDay = dto.paymentDueDay;
    const a = await this.prisma.account.create({ data });
    return this.toJson(a);
  }

  async update(id: string, dto: UpdateAccountDto) {
    const current = await this.prisma.account.findUnique({ where: { id } });
    if (!current) throw new NotFoundException(`Account ${id} not found`);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.balance !== undefined) {
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

    const [charges, payments] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { accountId: id, type: 'EXPENSE' },
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
    ]);

    const totalDebt = Number(account.balance);
    const periodPayment = creditPeriodPayment({
      closingDay: account.statementClosingDay ?? 1,
      today: new Date(),
      charges: charges.map((t) => ({ date: t.date, amount: Number(t.amount) })),
      payments: payments.map((t) => ({ date: t.date, amount: Number(t.amount) })),
    });
    const available = account.creditLimit == null ? null : Number(account.creditLimit) - totalDebt;

    return { totalDebt, periodPayment, available };
  }
}
