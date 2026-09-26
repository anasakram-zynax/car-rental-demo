import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateDuffelEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateDuffelConfigDto {
  @IsIn(['sandbox', 'production'])
  environment!: 'sandbox' | 'production';

  @IsOptional()
  @IsString()
  accessToken?: string;
}
