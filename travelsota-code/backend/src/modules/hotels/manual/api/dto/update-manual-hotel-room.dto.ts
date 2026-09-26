import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateManualHotelRoomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  basePrice?: number;

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

  @IsOptional()
  @IsString()
  status?: string;
}
