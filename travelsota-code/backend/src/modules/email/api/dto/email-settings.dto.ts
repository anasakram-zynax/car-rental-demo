import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateEmailProviderConfigDto {
  @IsIn(['smtp', 'resend'])
  provider!: 'smtp' | 'resend';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // SMTP fields
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  pass?: string;

  // Resend fields
  @IsOptional()
  @IsString()
  apiKey?: string;
}

export class TestEmailProviderConfigDto {
  @IsIn(['smtp', 'resend'])
  provider!: 'smtp' | 'resend';

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  pass?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;
}
