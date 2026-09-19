import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PersonsService } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Get()
  findAll() {
    return this.persons.findAll();
  }

  @Get(':id/summary')
  summary(@Param('id') id: string) {
    return this.persons.summary(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.persons.update(id, dto);
  }

  @Post(':id/adjustments')
  addAdjustment(@Param('id') id: string, @Body() dto: CreateAdjustmentDto) {
    return this.persons.addAdjustment(id, dto);
  }
}
