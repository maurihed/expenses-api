import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

function parseIntParam(raw: string, name: string, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  findAll(@Query('year') year?: string, @Query('month') month?: string) {
    if (year === undefined && month === undefined) {
      return this.budgets.findAll();
    }
    if (year === undefined || month === undefined) {
      throw new BadRequestException('year and month are required together');
    }
    return this.budgets.findByMonth(
      parseIntParam(year, 'year', 2000, 2100),
      parseIntParam(month, 'month', 1, 12),
    );
  }

  @Put()
  upsert(@Body() dto: UpsertBudgetDto) {
    return this.budgets.upsert(dto);
  }

  @Post()
  create(@Body() dto: UpsertBudgetDto) {
    return this.budgets.upsert(dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.budgets.remove(id);
  }
}
