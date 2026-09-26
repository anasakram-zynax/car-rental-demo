import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePayPalEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePayPalConfigDto {
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';

  @IsString()
  clientId!: string;

  @IsOptional()
  @IsString()
  clientSecret?: string;

  @IsOptional()
  @IsString()
  webhookId?: string;
}
