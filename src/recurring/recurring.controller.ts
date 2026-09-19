import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CreateRecurringRuleDto } from './dto/create-recurring-rule.dto';
import { UpdateRecurringRuleDto } from './dto/update-recurring-rule.dto';
import { RecurringService } from './recurring.service';

@Controller('recurring')
export class RecurringController {
  constructor(private readonly recurring: RecurringService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.recurring.findAll(includeInactive === 'true');
  }

  @Post()
  create(@Body() dto: CreateRecurringRuleDto) {
    return this.recurring.create(dto);
  }

  @Post('run')
  run() {
    return this.recurring.runDue(new Date());
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRecurringRuleDto) {
    return this.recurring.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.recurring.deactivate(id);
  }
}
