import { IsArray, IsDateString, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaxDto } from './create-booking.dto';

class RoomOccupancyDto {
  @IsInt() adults!: number;
  @IsInt() @IsOptional() children?: number;
  @IsOptional() @IsArray() childAges?: number[];
}

export class HotelBookingDetailsDto {
  /** Provider-neutral rate identifier. */
  @IsString() rateId!: string;

  /** Search key from the original hotel search. */
  @IsOptional() @IsString() searchKey?: string;

  /** Provider key (hotelbeds, ratehawk). */
  @IsOptional() @IsString() provider?: string;

  /** Hotel identifier. */
  @IsOptional() @IsString() hotelId?: string;

  /** Provider-specific hotel identifier. */
  @IsOptional() @IsString() providerHotelId?: string;

  /** Hotel group ID for multi-provider lookup. */
  @IsOptional() @IsString() hotelGroupId?: string;

  /** Check-in date (ISO 8601). */
  @IsOptional() @IsDateString() checkIn?: string;

  /** Check-out date (ISO 8601). */
  @IsOptional() @IsDateString() checkOut?: string;

  /** Room occupancy details. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomOccupancyDto)
  occupancy?: RoomOccupancyDto[];

  /** Guest list for the booking. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaxDto)
  guests?: PaxDto[];
}
