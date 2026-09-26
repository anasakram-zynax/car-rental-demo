import { IsOptional, IsString, IsIn, MaxLength, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class AutocompleteQueryDto {
  @IsString()
  @MaxLength(100)
  q!: string;

  @IsOptional()
  @IsString()
  @IsIn(['hotels', 'flights', 'all'])
  module?: string;

  // Result cap. Optional for backward compatibility (older callers omit it —
  // the flights deep-link resolver sends limit=5). The service clamps it.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
