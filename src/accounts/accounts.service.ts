import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeOpeningBalance } from '../domain/balance';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  private toJson(a: any) {
    return { id: a.id, name: a.name, balance: Number(a.balance) };
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
    const a = await this.prisma.account.create({
      data: { name: dto.name, openingBalance: balance, balance },
    });
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
    const a = await this.prisma.account.update({ where: { id }, data });
    return this.toJson(a);
  }
}
