import { Injectable, NotFoundException } from '@nestjs/common';
import { computePersonalBudget } from '../domain/personal-budget';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class PersonsService {
  constructor(private prisma: PrismaService) {}

  private async budgetFor(person: any, today = new Date()) {
    const [spentAgg, adjustmentAgg] = await Promise.all([
      // spent cuenta solo transacciones scope = PERSONAL Y type = EXPENSE;
      // el ingreso personal no es un gasto y por lo tanto no se descuenta.
      this.prisma.transaction.aggregate({
        where: { personId: person.id, scope: 'PERSONAL', type: 'EXPENSE' },
        _sum: { amount: true },
      }),
      this.prisma.personalAdjustment.aggregate({
        where: { personId: person.id },
        _sum: { amount: true },
      }),
    ]);

    const spent = Number(spentAgg._sum.amount ?? 0);
    const adjustmentTotal = Number(adjustmentAgg._sum.amount ?? 0);
    const budget = computePersonalBudget({
      allowanceStartDate: person.allowanceStartDate,
      weeklyAllowance: Number(person.weeklyAllowance),
      today,
      adjustmentTotal,
      spent,
    });

    return { ...budget, adjustmentTotal, spent };
  }

  private toJson(person: any) {
    return {
      id: person.id,
      name: person.name,
      weeklyAllowance: Number(person.weeklyAllowance),
      allowanceStartDate: person.allowanceStartDate.toISOString().slice(0, 10),
    };
  }

  async findAll() {
    const persons = await this.prisma.person.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(
      persons.map(async (person) => {
        const budget = await this.budgetFor(person);
        return {
          ...this.toJson(person),
          balance: budget.balance,
          spent: budget.spent,
        };
      }),
    );
  }

  async summary(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException(`Person ${id} not found`);
    const { accrued, adjustmentTotal, spent, balance } = await this.budgetFor(person);
    return { accrued, adjustmentTotal, spent, balance };
  }

  async update(id: string, dto: UpdatePersonDto) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException(`Person ${id} not found`);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.weeklyAllowance !== undefined) data.weeklyAllowance = dto.weeklyAllowance;
    if (dto.allowanceStartDate !== undefined) {
      data.allowanceStartDate = new Date(`${dto.allowanceStartDate}T00:00:00.000Z`);
    }

    const updated = await this.prisma.person.update({ where: { id }, data });
    return this.toJson(updated);
  }

  async addAdjustment(id: string, dto: CreateAdjustmentDto) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException(`Person ${id} not found`);

    const adjustment = await this.prisma.personalAdjustment.create({
      data: {
        personId: id,
        amount: dto.amount,
        reason: dto.reason,
        date: new Date(`${dto.date}T00:00:00.000Z`),
      },
    });

    return {
      id: adjustment.id,
      personId: adjustment.personId,
      amount: Number(adjustment.amount),
      reason: adjustment.reason,
      date: adjustment.date.toISOString().slice(0, 10),
    };
  }
}
