import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';

export class CreateDebtPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
