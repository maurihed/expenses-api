import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
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
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(RECURRING_TYPES)
  type?: RecurringTypeValue;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(RECURRING_SCOPES)
  scope?: RecurringScopeValue;

  @IsOptional()
  @IsString()
  personId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsIn(RECURRING_FREQUENCIES)
  frequency?: RecurringFrequencyValue;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsCalendarDate()
  startDate?: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @IsArray()
  interestTiers?: unknown[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
