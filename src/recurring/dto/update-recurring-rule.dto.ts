import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';
import {
  RECURRING_FREQUENCIES,
  RECURRING_SCOPES,
  RECURRING_TYPES,
  RecurringFrequencyValue,
  RecurringScopeValue,
  RecurringTypeValue,
} from './create-recurring-rule.dto';

export class UpdateRecurringRuleDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(RECURRING_TYPES)
  type?: RecurringTypeValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  accountId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(RECURRING_SCOPES)
  scope?: RecurringScopeValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  personId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @IsPositive()
  amount?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(RECURRING_FREQUENCIES)
  frequency?: RecurringFrequencyValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  startDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  endDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  interestTiers?: unknown[];
}
