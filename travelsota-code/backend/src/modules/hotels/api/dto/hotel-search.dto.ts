import { 
  IsArray, 
  IsBoolean,
  IsInt, 
  IsNumber,
  IsObject,
  IsOptional, 
  IsString, 
  Min, 
  Max,
  ValidateNested, 
  ArrayMinSize, 
  IsDateString,
  IsIn
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

const HOTEL_SORT_FIELDS = ['price', 'rating', 'name', 'distance'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

export class OccupancyDto {
  @IsInt()
  @Min(1)
  @Max(9)
  rooms!: number;

  @IsInt()
  @Min(1)
  adults!: number;

  @IsInt()
  @Min(0)
  children!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  childAges?: number[];
}

export class RoomDto {
  @IsInt()
  @Min(1)
  adults!: number;

  @IsInt()
  @Min(0)
  children!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  childAges?: number[];
}

export class GeolocationDto {
  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsNumber()
  @Min(1)
  radius!: number;
}

// ── Post-search Filter/Sort DTOs ────────────────────────────────

export class HotelPriceRangeDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max!: number;
}

export class HotelFilterDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceMax?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HotelPriceRangeDto)
  priceRanges?: HotelPriceRangeDto[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  starRating?: number[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  freeCancellation?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  suppliers?: string[];

  @IsOptional()
  @IsString()
  hotelName?: string;
}

export class HotelSortDto {
  @IsOptional()
  @IsString()
  @IsIn(HOTEL_SORT_FIELDS)
  field?: 'price' | 'rating' | 'name' | 'distance';

  @IsOptional()
  @IsString()
  @IsIn(SORT_ORDERS)
  order?: 'asc' | 'desc';
}

export class HotelSearchDto {
  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @IsString()
  hotelName?: string;

  @IsOptional()
  @IsString()
  destinationCode?: string;

  @IsOptional()
  @IsArray()
  // Codes may be numeric (Hotelbeds) or alphanumeric (Amadeus) — pass through as-is.
  hotelCodes?: Array<number | string>;

  @IsOptional()
  @IsString()
  canonicalHotelId?: string;

  @IsOptional()
  @IsString()
  destinationName?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => GeolocationDto)
  geolocation?: GeolocationDto;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OccupancyDto)
  occupancies?: OccupancyDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoomDto)
  rooms?: RoomDto[];

  // Advanced Filters
  @IsOptional()
  @IsNumber()
  @Min(0)
  minRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  minCategory?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxCategory?: number;

  @IsOptional()
  @IsString()
  @IsIn(['any', 'AT_WEB', 'AT_HOTEL', 'BOTH'])
  paymentType?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRatesPerRoom?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
packaging?: boolean;

@IsOptional()
@IsString()
hotelPackage?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  // ── Post-search filter/sort (applied after aggregation) ──────

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => HotelFilterDto)
  filters?: HotelFilterDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => HotelSortDto)
  sort?: HotelSortDto;
}