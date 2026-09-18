import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  registerDecorator,
  ValidateIf,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
          if (!match) return false;
          const date = new Date(`${value}T00:00:00.000Z`);
          return (
            !Number.isNaN(date.getTime()) &&
            date.getUTCFullYear() === Number(match[1]) &&
            date.getUTCMonth() + 1 === Number(match[2]) &&
            date.getUTCDate() === Number(match[3])
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid calendar date in YYYY-MM-DD format`;
        },
      },
    });
  };
}

export class CreateTransactionDto {
  @IsIn(['income', 'expense', 'transfer'])
  type!: 'income' | 'expense' | 'transfer';

  @IsString()
  accountId!: string;

  @ValidateIf((dto) => dto.type === 'transfer')
  @IsString()
  toAccountId?: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @ValidateIf((dto) => dto.type !== 'transfer')
  @IsString()
  description?: string;

  @IsCalendarDate()
  date!: string;

  @IsOptional()
  @IsString()
  category?: string;
}
