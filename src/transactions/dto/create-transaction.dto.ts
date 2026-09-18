import { IsIn, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CreateTransactionDto {
  @IsIn(['income', 'expense'])
  type!: 'income' | 'expense';

  @IsString()
  accountId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  description!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
