import { IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';

export const DEBT_TYPES = ['receivable', 'payable'] as const;
export type DebtTypeValue = (typeof DEBT_TYPES)[number];

export const DEBT_CURRENCIES = ['MXN', 'USD'] as const;
export type DebtCurrencyValue = (typeof DEBT_CURRENCIES)[number];

export class CreateDebtDto {
  @IsIn(DEBT_TYPES)
  type!: DebtTypeValue;

  @IsString()
  @MaxLength(120)
  counterparty!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsIn(DEBT_CURRENCIES)
  currency: DebtCurrencyValue = 'MXN';

  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsCalendarDate()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
