import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class RepriceProductSelectionDto {
  @IsString() offeringId!: string;

  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

/**
 * Lightweight reprice request used by the booking detail page to re-validate
 * the live fare before checkout. Unlike preview/checkout it does NOT create a
 * booking — it only re-shops the cached offer and returns the current price
 * plus the fresh priced-offer identifiers (so the price shown on the detail
 * page matches what checkout will charge).
 */
export class FlightRepriceDto {
  @IsString() offerId!: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsOptional()
  @IsString()
  catalogUuid?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepriceProductSelectionDto)
  productSelections?: RepriceProductSelectionDto[];

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  departureDate?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  totalPrice?: number;

  @IsOptional()
  @IsString()
  tripType?: 'one_way' | 'round_trip';

  @IsOptional()
  @IsString()
  offeringIdentifierValue?: string;

  @IsOptional()
  @IsString()
  offeringIdentifierAuthority?: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];
}
