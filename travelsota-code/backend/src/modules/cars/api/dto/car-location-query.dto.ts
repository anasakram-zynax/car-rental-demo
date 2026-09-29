import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import type { CarServiceType } from '../../domain/types/car-service-type';

export class CarLocationSuggestionsDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['rental', 'transfer'])
  serviceType!: CarServiceType;

  @IsString()
  @MinLength(3)
  q!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  limit?: number;
}

export class CarTransferDropoffsDto {
  @IsString()
  @MinLength(1)
  pickupLocationId!: string;

  @IsOptional()
  @IsString()
  q?: string;
}
