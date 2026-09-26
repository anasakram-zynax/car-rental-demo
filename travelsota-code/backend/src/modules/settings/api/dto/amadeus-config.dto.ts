import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateAmadeusEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateAmadeusConfigDto {
  @IsOptional()
  @IsIn(['test', 'production'])
  environment?: 'test' | 'production';

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;
}
