import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  findByMonth(@Query('month') month?: string, @Query('year') year?: string) {
    const now = new Date();
    const m = month !== undefined ? Number(month) : now.getMonth();
    const y = year !== undefined ? Number(year) : now.getFullYear();
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
