import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { CarServiceType } from '../../domain/types/car-service-type';

export class CarSearchDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['rental', 'transfer'])
  serviceType!: CarServiceType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  location?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  pickupLocationId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  dropoffLocationId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  pickupAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dropoffAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  returnAt?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  passengerCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  luggageCapacity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['automatic', 'manual'])
  transmission?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['recommended', 'price_asc', 'price_desc'])
  sort?: 'recommended' | 'price_asc' | 'price_desc';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  pageSize?: number;
}
