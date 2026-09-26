import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CheckoutTravelerDto {
  @IsString() givenName!: string;
  @IsString() surname!: string;
  @IsString() gender!: string;
  @IsDateString() birthDate!: string;
  @IsString() passengerTypeCode!: string;
  @IsString() @Matches(/^\d{1,3}$/) phoneCountryCode!: string;
  @IsString() @Matches(/^\d{6,14}$/) phoneNumber!: string;
  @IsString() email!: string;

  @IsOptional() @IsString() documentNumber?: string;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsString() issueCountry?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsOptional() @IsString() birthPlace?: string;
}

class CheckoutProductSelectionDto {
  @IsString() offeringId!: string;
  @IsArray() @IsString({ each: true }) productIds!: string[];
}

export class FlightCheckoutSessionDto {
  @IsString() searchKey!: string;
  @IsString() offerId!: string;
  @IsOptional() @IsString() catalogUuid?: string;

  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutProductSelectionDto)
  productSelections?: CheckoutProductSelectionDto[];

  @IsOptional() @IsString() tripType?: 'one_way' | 'round_trip';
  @IsOptional() @IsDateString() returnDate?: string;
  @IsString() from!: string;
  @IsString() to!: string;
  @IsDateString() departureDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckoutTravelerDto)
  travelers!: CheckoutTravelerDto[];
}
