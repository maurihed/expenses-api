import {
  IsIn,
  IsNumber,
  IsPositive,
  IsString,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from './create-transaction.dto';

export class UpdateTransactionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['income', 'expense', 'transfer'])
  type?: 'income' | 'expense' | 'transfer';

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  accountId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  toAccountId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  description?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  date?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  category?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['joint', 'personal'])
  scope?: 'joint' | 'personal';

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  personId?: string;
}
