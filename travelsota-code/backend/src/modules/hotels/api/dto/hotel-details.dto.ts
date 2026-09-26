import { IsArray, IsDateString, IsOptional, IsString } from 'class-validator';

export class HotelDetailsDto {
  @IsOptional()
  @IsString()
  searchKey?: string;

  /** hotelId or hotelGroupId — accepts provider:hotelId prefixed format from aggregator */
  @IsString()
  hotelId!: string;

  @IsOptional()
  @IsString()
  hotelGroupId?: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  providerHotelId?: string;

  /** Correct hotel name from search results — used as the canonical display
   *  name when the provider's detail response returns a different name. */
  @IsOptional()
  @IsString()
  hotelName?: string;

  /** Searched destination (e.g. "Dubai") — city hint for demo content
   *  matching when the provider response carries no city. */
  @IsOptional()
  @IsString()
  destinationName?: string;

  /** Currency the user wants to see prices in (e.g. "AED"). When provided,
   *  the response converts supplier amounts to this display currency. */
  @IsOptional()
  @IsString()
  displayCurrency?: string;

  /** Search criteria — used as fallback for a direct re-search when the
   *  cached search session is missing (rooms must never be empty). */
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;

  @IsOptional()
  @IsArray()
  rooms?: Array<{ adults: number; children: number; childAges?: number[] }>;
}
