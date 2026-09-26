import { IsString, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { BookingPreviewDto } from './booking-preview.dto';

export class BookingConfirmDto extends BookingPreviewDto {
  @IsString()
  bookingId!: string; // required to update existing preview record
}