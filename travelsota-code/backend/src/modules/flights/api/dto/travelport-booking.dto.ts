import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { AncillarySelections } from '../../domain/entities/flight-search-response';

class TravelerDto {
  @IsString() givenName!: string;
  @IsString() surname!: string;
  @IsOptional() @IsString() title?: string;
  @IsString() gender!: string;
  @IsDateString() birthDate!: string;
  @IsString() passengerTypeCode!: string;
  @IsString() @Matches(/^\d{1,3}$/) phoneCountryCode!: string;
  @IsString() @Matches(/^\d{6,14}$/) phoneNumber!: string;
  @IsString() email!: string;

  // Optional travel document fields for international bookings
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  issueCountry?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  birthPlace?: string;
}

class ProductSelectionDto {
  @IsString() offeringId!: string;

  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

export class TravelportBookingWorkflowDto {
  @IsString() from!: string;
  @IsString() to!: string;
  @IsDateString() departureDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  offersPerPage?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  contentSourceList?: string[];

  @IsOptional()
  @IsString()
  accessGroup?: string;

  @IsOptional()
  @IsString()
  pcc?: string;

  @IsOptional()
  @IsString()
  gds?: string;

  @IsOptional()
  @IsString()
  tripType?: 'one_way' | 'round_trip';

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  // NEW: explicit selected offer ids
  @IsOptional()
  @IsString()
  catalogUuid?: string;

  @IsOptional()
  @IsString()
  offeringId?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSelectionDto)
  productSelections?: ProductSelectionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  baggageProductIds?: string[];

  @IsOptional()
  @IsBoolean()
  skipTicketing?: boolean;

  @IsOptional()
  @IsString()
  offerId?: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsOptional()
  ancillaries?: AncillarySelections;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TravelerDto)
  traveler?: TravelerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerDto)
  travelers?: TravelerDto[];

  @IsOptional()
  selectedOfferContext?: Record<string, unknown>;
}
