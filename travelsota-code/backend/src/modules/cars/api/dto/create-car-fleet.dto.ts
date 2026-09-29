import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CarFleetImageDto {
  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CarLocationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  country!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['airport', 'city', 'area'])
  type!: 'airport' | 'city' | 'area';

  @IsOptional()
  @IsString()
  @MaxLength(12)
  code?: string;
}

export class CreateCarFleetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-z0-9][a-z0-9 _-]*$/i)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  passengerCapacity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  luggageCapacity?: number;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsIn(['automatic', 'manual'])
  transmission?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsBoolean()
  rentalEnabled!: boolean;

  @IsBoolean()
  transferEnabled!: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Type(() => Number)
  rentalPrice?: number;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @ValidateNested()
  @Type(() => CarLocationDto)
  location!: CarLocationDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CarFleetImageDto)
  images?: CarFleetImageDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  displayOrder?: number;
}
