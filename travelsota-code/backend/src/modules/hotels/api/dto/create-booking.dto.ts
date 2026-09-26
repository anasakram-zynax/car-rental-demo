import {
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PaxDto {
  @IsString()
  roomId!: string;

  @IsString()
  type!: string;

  @IsString()
  name!: string;

  @IsString()
  surname!: string;
}

export class HolderDto {
  @IsString()
  name!: string;

  @IsString()
  surname!: string;
}

export class CreateBookingDto {
  /** Provider-neutral rate identifier (preferred) */
  @IsOptional()
  @IsString()
  rateId?: string;

  /** @deprecated Use rateId instead — kept for backward compatibility */
  @IsOptional()
  @IsString()
  rateKey?: string;

  /** Provider key — used for provider-specific routing */
  @IsOptional()
  @IsString()
  provider?: string;

  /** End-user IP address — required by some suppliers for booking form */
  @IsOptional()
  @IsString()
  userIp?: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsString()
  providerHotelId?: string;

  @IsOptional()
  @IsInt()
  roomAdults?: number;

  @IsOptional()
  @IsInt()
  roomChildren?: number;

  @ValidateNested()
  @Type(() => HolderDto)
  holder!: HolderDto;

  @IsEmail()
  clientReference!: string;

  @IsOptional()
  @IsString()
  promoCode?: string;

  /** The currency the user wants to see prices in (e.g. "USD"). When provided,
   * the preview response converts supplier amounts to this display currency. */
  @IsOptional()
  @IsString()
  displayCurrency?: string;

  /** The currency to charge the customer in (e.g. "USD").
   * The backend converts the supplier amount to this currency for payment.
   * Supplier-facing calls always use the supplier currency. */
  @IsOptional()
  @IsString()
  currency?: string;

  /** Check-in date — used to compute total stay price (per-night × nights) */
  @IsOptional()
  @IsString()
  checkIn?: string;

  /** Check-out date — used to compute total stay price (per-night × nights) */
  @IsOptional()
  @IsString()
  checkOut?: string;

  /** Display names shown on booking/admin pages (kept in the rate snapshot). */
  @IsOptional()
  @IsString()
  hotelName?: string;

  @IsOptional()
  @IsString()
  roomName?: string;

  @IsOptional()
  @IsString()
  boardName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaxDto)
  paxes!: PaxDto[];
}
