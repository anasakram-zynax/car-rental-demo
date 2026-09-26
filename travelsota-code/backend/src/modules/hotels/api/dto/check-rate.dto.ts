import { IsOptional, IsString } from 'class-validator';

export class CheckRateDto {
  /** Provider-neutral rate identifier (preferred) */
  @IsOptional()
  @IsString()
  rateId?: string;

  /** @deprecated Use rateId instead — kept for backward compatibility */
  @IsOptional()
  @IsString()
  rateKey?: string;

  @IsOptional()
  @IsString()
  provider?: string;
}