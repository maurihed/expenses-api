import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { DebtsService } from './debts.service';
import { CreateDebtDto } from './dto/create-debt.dto';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';

@Controller('debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  findAll(@Query('includeArchived') includeArchived?: string, @Query('type') type?: string) {
    return this.debts.findAll(includeArchived === 'true', type);
  }

  @Post()
  create(@Body() dto: CreateDebtDto) {
    return this.debts.create(dto);
  }

  @Get(':id/payments')
  findPayments(@Param('id') id: string) {
    return this.debts.findPayments(id);
  }

  @Post(':id/payments')
  addPayment(@Param('id') id: string, @Body() dto: CreateDebtPaymentDto) {
    return this.debts.addPayment(id, dto);
  }

  @Delete(':id/payments/:paymentId')
  removePayment(@Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.debts.removePayment(id, paymentId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.debts.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDebtDto) {
    return this.debts.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.debts.archive(id);
  }
}
