import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

const IATA_CODE_REGEX = /^[A-Za-z]{3}$/;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const ALPHA_NUMERIC_REGEX = /^[A-Za-z0-9]+$/;
const FLIGHT_TYPES = ['one_way', 'round_trip', 'multi_city'] as const;
const CABIN_CLASSES = [
  'Economy',
  'PremiumEconomy',
  'Business',
  'First',
  'PremiumFirst',
] as const;
const FLIGHT_SORT_FIELDS = ['price', 'duration', 'departure', 'arrival', 'airline'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

// ── Filter & Sort DTOs ──────────────────────────────────────────

export class FlightPriceRangeDto {
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min!: number;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max!: number;
}

export class FlightFilterDto {
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
  @Type(() => FlightPriceRangeDto)
  priceRanges?: FlightPriceRangeDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  airlines?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stops?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  departureTimes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  arrivalTimes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cabinClasses?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  refundable?: boolean;

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
  flightNumber?: string;
}

export class FlightSortDto {
  @IsOptional()
  @IsString()
  @IsIn(FLIGHT_SORT_FIELDS)
  field?: 'price' | 'duration' | 'departure' | 'arrival' | 'airline';

  @IsOptional()
  @IsString()
  @IsIn(SORT_ORDERS)
  order?: 'asc' | 'desc';
}

export class MultiCitySliceDto {
  @IsString()
  @Matches(IATA_CODE_REGEX, {
    message: 'Each slice origin must be a 3-letter IATA code.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  origin!: string;

  @IsString()
  @Matches(IATA_CODE_REGEX, {
    message: 'Each slice destination must be a 3-letter IATA code.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  destination!: string;

  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'Each slice departureDate must be in YYYY-MM-DD format.',
  })
  departureDate!: string;
}

export class FlightSearchDto {
  @IsString()
  @Matches(IATA_CODE_REGEX, {
    message: 'from must be a 3-letter IATA code.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  from!: string;

  @IsString()
  @Matches(IATA_CODE_REGEX, {
    message: 'to must be a 3-letter IATA code.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  to!: string;

  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'departureDate must be in YYYY-MM-DD format.',
  })
  departureDate!: string;

  @IsOptional()
  @IsString()
  @IsIn(FLIGHT_TYPES)
  tripType?: 'one_way' | 'round_trip' | 'multi_city';

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MultiCitySliceDto)
  legs?: MultiCitySliceDto[];

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'returnDate must be in YYYY-MM-DD format.',
  })
  returnDate?: string;

  @IsOptional()
  @IsString()
  @IsIn(CABIN_CLASSES)
  cabinClass?: 'Economy' | 'PremiumEconomy' | 'Business' | 'First' | 'PremiumFirst';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  offersPerPage?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((item) =>
            typeof item === 'string' ? item.trim().toUpperCase() : item,
          )
          .filter(Boolean)
      : value,
  )
  contentSourceList?: string[];

  @IsOptional()
  @IsString()
  accessGroup?: string;

  @IsOptional()
  @IsString()
  @Matches(ALPHA_NUMERIC_REGEX, {
    message: 'pcc must be alphanumeric.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  pcc?: string;

  @IsOptional()
  @IsString()
  @Matches(ALPHA_NUMERIC_REGEX, {
    message: 'gds must be alphanumeric.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  gds?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  // ── Post-search filter/sort (applied after aggregation) ──────

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FlightFilterDto)
  filters?: FlightFilterDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => FlightSortDto)
  sort?: FlightSortDto;
}
