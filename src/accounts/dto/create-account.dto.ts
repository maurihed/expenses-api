import { IsIn, IsInt, IsNumber, IsString, Max, Min, ValidateIf } from 'class-validator';

export const ACCOUNT_TYPES = ['CASH', 'DEBIT', 'CREDIT', 'INVESTMENT'] as const;
export const CURRENCIES = ['MXN', 'USD'] as const;

export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];
export type CurrencyValue = (typeof CURRENCIES)[number];

export class CreateAccountDto {
  @IsString()
  name!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  balance?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(ACCOUNT_TYPES)
  type?: AccountTypeValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(CURRENCIES)
  currency?: CurrencyValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(31)
  statementClosingDay?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(31)
  paymentDueDay?: number;
}
