import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@Injectable()
export class BudgetsService {
  constructor(private prisma: PrismaService) {}

  private toJson(budget: {
    id: string;
    year: number;
    month: number;
    amount: unknown;
    currency: string;
  }) {
    return {
      id: budget.id,
      year: budget.year,
      month: budget.month,
      amount: Number(budget.amount),
      currency: budget.currency,
    };
  }

  async findAll() {
    const rows = await this.prisma.budget.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    return rows.map((budget) => this.toJson(budget));
  }

  async findByMonth(year: number, month: number) {
    const budget = await this.prisma.budget.findUnique({ where: { year_month: { year, month } } });
    return budget ? this.toJson(budget) : null;
  }

  async upsert(dto: UpsertBudgetDto) {
    const budget = await this.prisma.budget.upsert({
      where: { year_month: { year: dto.year, month: dto.month } },
      update: { amount: dto.amount, ...(dto.currency ? { currency: dto.currency } : {}) },
      create: {
        year: dto.year,
        month: dto.month,
        amount: dto.amount,
        currency: dto.currency ?? 'MXN',
      },
    });
    return this.toJson(budget);
  }

  async remove(id: string) {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) throw new NotFoundException(`Budget ${id} not found`);
    await this.prisma.budget.delete({ where: { id } });
    return { id };
  }
}
