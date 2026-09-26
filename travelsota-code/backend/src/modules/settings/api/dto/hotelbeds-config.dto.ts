import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateHotelbedsEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateHotelbedsConfigDto {
  @IsIn(['development', 'production', 'mtls'])
  environment!: 'development' | 'production' | 'mtls';

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  secret?: string;
}
