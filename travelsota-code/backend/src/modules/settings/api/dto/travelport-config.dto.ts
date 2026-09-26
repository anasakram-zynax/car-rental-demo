import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateTravelportEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class UpdateTravelportConfigDto {
  @IsIn(['development', 'production'])
  environment!: 'development' | 'production';

  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() clientSecret?: string;
  @IsOptional() @IsString() accessGroup?: string;
  @IsOptional() @IsString() pcc?: string;
}
