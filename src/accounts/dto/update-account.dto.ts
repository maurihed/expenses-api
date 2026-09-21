import { IsIn, IsInt, IsNumber, IsString, Max, Min, ValidateIf } from 'class-validator';
import { ACCOUNT_TYPES, AccountTypeValue, CURRENCIES, CurrencyValue } from './create-account.dto';

export class UpdateAccountDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

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

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0)
  initialDebt?: number;
}
