import { IsNumber, IsPositive, IsString, Matches, ValidateIf } from 'class-validator';

const SYMBOL_PATTERN = /^[A-Za-z][A-Za-z0-9.\-]{0,9}$/;

export class UpdateHoldingDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(SYMBOL_PATTERN, { message: 'Símbolo inválido' })
  symbol?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  quantity?: number;
}
