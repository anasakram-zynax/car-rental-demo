import { IsInt, IsOptional, Min } from 'class-validator';

export class SaveTranslationConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  monthlyCharLimit?: number;
}
