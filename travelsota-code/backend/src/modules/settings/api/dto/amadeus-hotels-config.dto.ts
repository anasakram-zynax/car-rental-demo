import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAmadeusHotelsEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateAmadeusHotelsConfigDto {
  @IsIn(['test', 'production'])
  environment!: 'test' | 'production';

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;
}
