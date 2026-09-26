import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';

export class CreateManualHotelRoomDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  roomType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxAdults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  maxChildren?: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  basePrice!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercent?: number;

  @IsOptional()
  @IsBoolean()
  extraBedAvailable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  extraBedCharge?: number;

  @IsOptional()
  @IsBoolean()
  breakfastIncluded?: boolean;

  @IsOptional()
  @IsBoolean()
  cancellationFree?: boolean;

  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  availableQuantity?: number;

  @IsOptional()
  @IsString()
  boardType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  images?: { url: string }[];
}

export class CreateManualHotelDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  featured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  hotelOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  stars?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rating?: number;

  @IsOptional()
  @IsString()
  accommodationType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discount?: number;

  @IsOptional()
  @IsBoolean()
  refundable?: boolean;

  @IsOptional()
  @IsString()
  checkinTime?: string;

  @IsOptional()
  @IsString()
  checkoutTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  bookingAgeRequirement?: number;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsString()
  @MinLength(1)
  location!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  longitude?: number;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsString()
  metaDesc?: string;

  @IsOptional()
  @IsString()
  cancellationPolicy?: string;

  @IsOptional()
  @IsString()
  privacyPolicy?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsArray()
  images?: { url: string; isDefault?: boolean }[];

  @IsOptional()
  @IsString()
  destinationCode?: string;

  @IsOptional()
  @IsString()
  destinationName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateManualHotelRoomDto)
  rooms!: CreateManualHotelRoomDto[];
}
