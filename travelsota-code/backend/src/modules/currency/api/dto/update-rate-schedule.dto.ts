import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';

export class UpdateRateScheduleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(10080)
  intervalMinutes?: number;
}
