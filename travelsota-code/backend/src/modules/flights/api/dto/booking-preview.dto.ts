import { IsArray, IsDateString, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TravelerDto {
  @IsString() givenName!: string;
  @IsString() surname!: string;
  @IsString() @IsOptional() title?: string;
  @IsString() gender!: string;
  @IsDateString() birthDate!: string;
  @IsString() passengerTypeCode!: string;
  @IsString() @IsNotEmpty() @Matches(/^\d{1,3}$/) phoneCountryCode!: string;
  @IsString() @IsNotEmpty() @Matches(/^\d{6,14}$/) phoneNumber!: string;
  @IsEmail() email!: string;

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

// ── Unified Ancillary DTOs (Phase 4) ──

class AncillaryPriceDto {
  @IsNumber() amount!: number;
  @IsString() currency!: string;
}

class SeatSelectionDto {
  @IsString() type!: 'seat';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() seatNumber!: string;
  @IsString() @MaxLength(500) ancillaryProductId!: string;
  @IsOptional()
  @IsString() @MaxLength(500)
  catalogOfferingsIdentifier?: string;
  @IsOptional()
  @IsString() @MaxLength(500)
  catalogOfferingIdentifierValue?: string;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class BaggageSelectionDto {
  @IsString() type!: 'baggage';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsOptional() @IsString() journeyRef?: string;
  @IsString() segmentRef!: string;
  @IsString() @MaxLength(500) ancillaryProductId!: string;
  @IsOptional() @IsString() catalogOfferingIdentifier?: string;
  @IsOptional() @IsString() catalogOfferingsIdentifier?: string;
  @IsString() label!: string;
  @IsString() baggageType!: string;
  @IsString() weight!: string;
  @IsNumber() pieces!: number;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class MealSelectionDto {
  @IsString() type!: 'meal';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() @MaxLength(500) ancillaryProductId!: string;
  @IsString() mealCode!: string;
  @IsString() mealName!: string;
  @IsString() dietaryType!: string;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class ServiceSelectionDto {
  @IsString() type!: 'sports_equipment' | 'priority' | 'lounge' | 'wifi' | 'pet' | 'other';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() @MaxLength(500) ancillaryProductId!: string;
  @IsOptional() @IsString() @MaxLength(500) catalogOfferingIdentifier?: string;
  @IsOptional() @IsString() @MaxLength(500) catalogOfferingsIdentifier?: string;
  @IsString() label!: string;
  @IsString() serviceType!: string;
  @IsNumber() quantity!: number;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class AncillarySelectionsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => SeatSelectionDto)
  seats!: SeatSelectionDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => BaggageSelectionDto)
  baggage!: BaggageSelectionDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => MealSelectionDto)
  meals!: MealSelectionDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => ServiceSelectionDto)
  services!: ServiceSelectionDto[];
}

class MultiCityLegPreviewDto {
  @IsString() origin!: string;
  @IsString() destination!: string;
  @IsString() departureDate!: string;
}

export class BookingPreviewDto {
  /**
   * When snapshotId is provided, route fields (from, to, departureDate)
   * and offerId/searchKey are optional — backend loads everything from
   * the persisted FlightOfferSnapshot.
   */
  @IsOptional()
  @IsString()
  snapshotId?: string;

  /** QA 2026-09-09: set server-side in checkout()/preview() from the snapshot.
   *  'manual' offers skip supplier hold/detection and settle locally. */
  @IsOptional()
  @IsIn(['travelport', 'duffel', 'amadeus', 'manual'])
  snapshotProvider?: 'travelport' | 'duffel' | 'amadeus' | 'manual';

  /** Required unless snapshotId is provided */
  @ValidateIf((o: any) => !o.snapshotId)
  @IsString()
  @IsNotEmpty()
  offerId?: string;
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

  // Legacy ancillary product IDs (for backward compatibility)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  seatProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  baggageProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceProductIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mealSelectionIds?: string[];

  // Unified ancillary selections (Phase 4)
  @IsOptional()
  @ValidateNested()
  @Type(() => AncillarySelectionsDto)
  ancillaries?: AncillarySelectionsDto;

  @IsOptional()
  @IsString()
  tripType?: 'one_way' | 'round_trip' | 'multi_city';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MultiCityLegPreviewDto)
  legs?: MultiCityLegPreviewDto[];

  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @IsOptional()
  @IsString()
  catalogUuid?: string;

  @IsOptional()
  @IsString()
  offeringIdentifierValue?: string;
  @ValidateIf((o: any) => !o.snapshotId)
  @IsString()
  @IsNotEmpty()
  from?: string;
  @ValidateIf((o: any) => !o.snapshotId)
  @IsString()
  @IsNotEmpty()
  to?: string;
  @ValidateIf((o: any) => !o.snapshotId)
  @IsDateString()
  departureDate?: string;

  @IsOptional()
  @IsString()
  sessionKey?: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsOptional()
  @IsNumber()
  totalPrice?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  /** Currency the user wants to see prices in (e.g. "AED"). When provided,
   *  the preview response converts supplier amounts to this display currency. */
  @IsOptional()
  @IsString()
  displayCurrency?: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TravelerDto)
  travelers!: TravelerDto[];
}


