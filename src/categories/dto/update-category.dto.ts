import { IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateCategoryDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  name?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  icon?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  color?: string;
}
