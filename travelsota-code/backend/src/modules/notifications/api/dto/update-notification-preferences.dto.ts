import { IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsString()
  type!: string;

  @IsString()
  @IsIn(['toast', 'realtime', 'persisted'])
  channel!: string;

  @IsBoolean()
  enabled!: boolean;
}