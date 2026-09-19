import { Module } from '@nestjs/common';
import { RecurringController } from './recurring.controller';
import { RecurringScheduler } from './recurring.scheduler';
import { RecurringService } from './recurring.service';

@Module({
  controllers: [RecurringController],
  providers: [RecurringService, RecurringScheduler],
})
export class RecurringModule {}
