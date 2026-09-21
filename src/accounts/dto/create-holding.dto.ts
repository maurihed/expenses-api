import { IsBoolean, IsNumber, IsPositive, IsString, Matches, ValidateIf } from 'class-validator';

const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/;

export class CreateHoldingDto {
  @IsString()
  @Matches(SYMBOL_PATTERN, { message: 'Símbolo inválido' })
  symbol!: string;

  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  quantity!: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  deductFromCash?: boolean;
}
