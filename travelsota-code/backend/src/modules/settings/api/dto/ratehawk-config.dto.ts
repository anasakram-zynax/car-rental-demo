import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateRatehawkEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateRatehawkConfigDto {
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';

  @IsOptional()
  @IsString()
  keyId?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
