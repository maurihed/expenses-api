import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export const BUDGET_CURRENCIES = ['MXN', 'USD'] as const;
export type BudgetCurrencyValue = (typeof BUDGET_CURRENCIES)[number];

export class UpsertBudgetDto {
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsIn(BUDGET_CURRENCIES)
  currency?: BudgetCurrencyValue;
}
