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
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../transactions/dto/create-transaction.dto';

export const RECURRING_TYPES = ['subscription', 'income', 'interest'] as const;
export const RECURRING_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
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

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(RECURRING_SCOPES)
  scope?: RecurringScopeValue;

  @IsOptional()
  @IsString()
  personId?: string;

  @ValidateIf((dto) => dto.type === 'subscription' || dto.type === 'income')
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

  @IsCalendarDate()
  startDate!: string;

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
