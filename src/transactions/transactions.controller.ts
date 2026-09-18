import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  private parseIntParam(raw: string, name: string, min: number, max: number): number {
    const trimmed = raw.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
    }
    return value;
  }

  @Get()
  findByMonth(@Query('month') month?: string, @Query('year') year?: string) {
    const now = new Date();
    const m = month !== undefined ? this.parseIntParam(month, 'month', 0, 11) : now.getMonth();
    const y =
      year !== undefined ? this.parseIntParam(year, 'year', 1970, 2100) : now.getFullYear();
    return this.transactions.findByMonth(m, y);
  }

  @Post()
  create(@Body() dto: CreateTransactionDto) {
    return this.transactions.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.transactions.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transactions.remove(id);
  }
}
