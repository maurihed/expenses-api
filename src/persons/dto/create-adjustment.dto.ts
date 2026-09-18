import { IsNumber, IsString } from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';

export class CreateAdjustmentDto {
  @IsNumber()
  amount!: number;

  @IsString()
  reason!: string;

  @IsCalendarDate()
  date!: string;
}
