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

export const RECURRING_TYPES = ['subscription', 'income', 'interest'] as const;
export const RECURRING_FREQUENCIES = ['weekly', 'biweekly', 'monthly'] as const;
export const RECURRING_SCOPES = ['joint', 'personal'] as const;

export type RecurringTypeValue = (typeof RECURRING_TYPES)[number];
export type RecurringFrequencyValue = (typeof RECURRING_FREQUENCIES)[number];
export type RecurringScopeValue = (typeof RECURRING_SCOPES)[number];

export class CreateRecurringRuleDto {
  @IsString()
  name!: string;

  @IsIn(RECURRING_TYPES)
  type!: RecurringTypeValue;

  @IsString()
  accountId!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  categoryId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(RECURRING_SCOPES)
  scope?: RecurringScopeValue;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  personId?: string;

  @ValidateIf((dto) => dto.type === 'subscription' || dto.type === 'income')
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

  @IsCalendarDate()
  startDate!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsCalendarDate()
  endDate?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  interestTiers?: unknown[];
}
