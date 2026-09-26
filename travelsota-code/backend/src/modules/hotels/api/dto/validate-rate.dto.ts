import { IsArray, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ValidateRateOccupancyDto {
  @IsInt()
  adults!: number;

  @IsInt()
  children!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  childAges?: number[];
}

export class ValidateRateDto {
  @IsString()
  rateId!: string;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsOptional()
  @IsString()
  hotelGroupId?: string;

  @IsOptional()
  @IsString()
  providerHotelId?: string;

  @IsOptional()
  @IsString()
  checkIn?: string;

  @IsOptional()
  @IsString()
  checkOut?: string;

  @IsOptional()
  @IsString()
  displayCurrency?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ValidateRateOccupancyDto)
  occupancy?: ValidateRateOccupancyDto[];
}
