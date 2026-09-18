import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  findAll(@Query('includeArchived') includeArchived?: string) {
    return this.accounts.findAll(includeArchived === 'true');
  }

  @Get(':id/credit-summary')
  creditSummary(@Param('id') id: string) {
    return this.accounts.creditSummary(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.accounts.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  archive(@Param('id') id: string) {
    return this.accounts.archive(id);
  }
}
