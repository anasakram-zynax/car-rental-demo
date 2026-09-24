import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ServiceType } from '../../domain/service-type.js';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}

export class CarFilterOptionsDto {
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;
}

export class TransferPickupLocationsDto {
  @IsOptional()
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}

export class TransferDropoffLocationsDto extends TransferPickupLocationsDto {
  @Transform(({ value }) => normalizeText(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  pickupLocation!: string;
}
