import { IsNumber, IsString, ValidateIf } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name!: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  balance?: number;
}
