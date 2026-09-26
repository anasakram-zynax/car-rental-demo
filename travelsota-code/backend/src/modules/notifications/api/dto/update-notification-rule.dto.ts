import { IsOptional, IsBoolean, IsString, IsArray, IsIn } from 'class-validator';

export class UpdateNotificationRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['info', 'high', 'critical'])
  severity?: string;

  @IsOptional()
  @IsBoolean()
  critical?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleIds?: string[];
}