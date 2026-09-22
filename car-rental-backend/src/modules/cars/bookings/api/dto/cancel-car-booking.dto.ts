import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelCarBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
