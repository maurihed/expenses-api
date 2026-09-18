import { IsNumber, IsString, Min, ValidateIf } from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';

export class UpdatePersonDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  weeklyAllowance?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  allowanceStartDate?: string;
}
