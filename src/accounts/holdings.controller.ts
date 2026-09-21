import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CreateHoldingDto } from './dto/create-holding.dto';
import { UpdateHoldingDto } from './dto/update-holding.dto';
import { HoldingsService } from './holdings.service';

@Controller('accounts/:accountId/holdings')
export class HoldingsController {
  constructor(private readonly holdings: HoldingsService) {}

  @Get()
  list(@Param('accountId') accountId: string) {
    return this.holdings.listForAccount(accountId);
  }

  @Post()
  create(@Param('accountId') accountId: string, @Body() dto: CreateHoldingDto) {
    return this.holdings.create(accountId, dto);
  }

  @Put(':holdingId')
  update(
    @Param('accountId') accountId: string,
    @Param('holdingId') holdingId: string,
    @Body() dto: UpdateHoldingDto,
  ) {
    return this.holdings.update(accountId, holdingId, dto);
  }

  @Delete(':holdingId')
  remove(@Param('accountId') accountId: string, @Param('holdingId') holdingId: string) {
    return this.holdings.remove(accountId, holdingId);
  }
}
