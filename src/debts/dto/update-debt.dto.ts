import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength, ValidateIf } from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';
import { DEBT_CURRENCIES, DEBT_TYPES, DebtCurrencyValue, DebtTypeValue } from './create-debt.dto';

export class UpdateDebtDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(DEBT_TYPES)
  type?: DebtTypeValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(120)
  counterparty?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(DEBT_CURRENCIES)
  currency?: DebtCurrencyValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  date?: string;

  @IsOptional()
  @IsCalendarDate()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}
