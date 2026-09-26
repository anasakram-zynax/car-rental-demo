import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateStripeEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateStripeConfigDto {
  @IsIn(['test', 'production'])
  environment!: 'test' | 'production';

  @IsString()
  publishableKey!: string;

  @IsOptional()
  @IsString()
  secretKey?: string;

  @IsOptional()
  @IsString()
  webhookSecret?: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  requestTimeoutMs?: number;
}
