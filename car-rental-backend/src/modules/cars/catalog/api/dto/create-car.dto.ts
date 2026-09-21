import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsString,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateCarImageDto {
  @IsUrl()
  url: string;

  @IsBoolean()
  isDefault: boolean;
}

export class CreateCarDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsString()
  brand: string;

  @IsString()
  model: string;

  @IsInt()
  @Min(1900)
  year: number;

  @IsString()
  carTypeId: string;

  @IsString()
  transmission: string;

  @IsString()
  fuelType: string;

  @IsInt()
  @Min(1)
  doors: number;

  @IsInt()
  @Min(1)
  passengers: number;

  @IsInt()
  @Min(0)
  baggage: number;

  @IsArray()
  @IsString({ each: true })
  amenities: string[];

  @IsString()
  city: string;

  @IsNumber()
  @Min(0)
  dailyPrice: number;

  @IsString()
  currency: string;

  @IsBoolean()
  isRefundable: boolean;

  @IsBoolean()
  featured: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCarImageDto)
  images: CreateCarImageDto[];
}
