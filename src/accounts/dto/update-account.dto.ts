import { IsNumber, IsString, ValidateIf } from 'class-validator';

export class UpdateAccountDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  balance?: number;
}
