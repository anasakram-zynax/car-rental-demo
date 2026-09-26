import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ── Shared ──

class AncillaryPriceDto {
  @IsNumber() amount!: number;
  @IsString() currency!: string;
}

// ── GET /bookings/:id/extras/catalog ──

export class ExtrasCatalogParamsDto {
  @IsString() id!: string;
}

// ── POST /bookings/:id/extras/quote ──

class QuoteSeatDto {
  @IsString() type!: 'seat';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() seatNumber!: string;
  @IsString() ancillaryProductId!: string;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class QuoteBaggageDto {
  @IsString() type!: 'baggage';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() ancillaryProductId!: string;
  @IsOptional() @IsString() catalogOfferingsIdentifier?: string;
  @IsOptional() @IsString() catalogOfferingIdentifier?: string;
  @IsString() label!: string;
  @IsString() baggageType!: string;
  @IsString() weight!: string;
  @IsNumber() pieces!: number;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class QuoteMealDto {
  @IsString() type!: 'meal';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() mealCode!: string;
  @IsString() mealName!: string;
  @IsString() dietaryType!: string;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

class QuoteServiceDto {
  @IsString() type!: 'sports_equipment' | 'priority' | 'lounge' | 'wifi' | 'pet' | 'other';
  @IsNumber() travelerIndex!: number;
  @IsString() travelerRef!: string;
  @IsString() segmentRef!: string;
  @IsString() ancillaryProductId!: string;
  @IsOptional() @IsString() catalogOfferingsIdentifier?: string;
  @IsOptional() @IsString() catalogOfferingIdentifier?: string;
  @IsString() label!: string;
  @IsString() serviceType!: string;
  @IsNumber() quantity!: number;
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price!: AncillaryPriceDto;
}

export class ExtrasQuoteBodyDto {
  @IsString() bookingId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteSeatDto)
  seats?: QuoteSeatDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteBaggageDto)
  baggage?: QuoteBaggageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteMealDto)
  meals?: QuoteMealDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuoteServiceDto)
  services?: QuoteServiceDto[];
}

// ── POST /bookings/:id/extras/payment ──

export class ExtrasPaymentBodyDto {
  @IsString() bookingId!: string;
  @IsString() gateway!: string;
  @IsOptional() @IsString() successUrl?: string;
  @IsOptional() @IsString() cancelUrl?: string;
}

// ── POST /bookings/:id/extras/confirm ──

export class ExtrasConfirmBodyDto {
  @IsString() bookingId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtrasConfirmItemDto)
  items!: ExtrasConfirmItemDto[];
}

class ExtrasConfirmItemDto {
  @IsString() ancillaryProductId!: string;
  @IsString() type!: 'seat' | 'baggage' | 'meal' | 'service';
  @IsString() label!: string;
  @IsOptional() @IsString() travelerRef?: string;
  @IsOptional() @IsString() segmentRef?: string;
  @IsOptional() @IsString() seatNumber?: string;
  @IsOptional() @IsString() mealCode?: string;
  @IsOptional() @IsString() catalogOfferingsIdentifier?: string;
  @IsOptional() @IsString() catalogOfferingIdentifier?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => AncillaryPriceDto)
  price?: AncillaryPriceDto;
}

// ── GET /bookings/:id/extras/status ──

export class ExtrasStatusParamsDto {
  @IsString() id!: string;
}
