import { IsArray, IsDateString, IsEmail, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TravelerSummaryDto {
  @IsString() givenName!: string;
  @IsString() surname!: string;
  @IsString() @IsOptional() passengerTypeCode?: string;
  @IsString() @IsOptional() email?: string;
}

export class FlightBookingDetailsDto {
  /** Offer identifier from the search response. */
  @IsString() offerId!: string;

  /** Search key used to retrieve this offer. */
  @IsOptional() @IsString() searchKey?: string;

  /** The full offer object as returned by the search response. The frontend
   *  stores this after search and sends it here so the backend can apply
   *  markup and return a fully-enriched details view. */
  @IsOptional() offerData?: Record<string, any>;

  /** Traveler information — if provided, the backend can show per-traveler
   *  pricing and seat/meal/baggage selections. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerSummaryDto)
  travelers?: TravelerSummaryDto[];
}
