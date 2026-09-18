import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  balance?: number;
}
