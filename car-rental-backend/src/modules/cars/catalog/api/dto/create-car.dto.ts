import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Matches,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceType } from '../../domain/service-type.js';

class CreateCarImageDto {
  @IsUrl()
  url: string;

  @IsBoolean()
  isDefault: boolean;
}

export class CreateCarTransferPackageDto {
  @IsString()
  @Matches(/\S/, { message: 'fromLocation must not be blank.' })
  fromLocation: string;

  @IsString()
  @Matches(/\S/, { message: 'toLocation must not be blank.' })
  toLocation: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price: number;

  @IsString()
  @Matches(/\S/, { message: 'currency must not be blank.' })
  currency: string;
}

@ValidatorConstraint({ name: 'transferPackagesRequired', async: false })
class TransferPackagesRequiredConstraint implements ValidatorConstraintInterface {
  validate(serviceType: ServiceType | undefined, args: ValidationArguments) {
    if (serviceType !== ServiceType.TRANSFER) {
      return true;
    }

    const object = args.object as {
      transferPackages?: CreateCarTransferPackageDto[];
    };

    return (
      Array.isArray(object.transferPackages) &&
      object.transferPackages.length > 0
    );
  }

  defaultMessage() {
    return 'Transfer cars require at least one transfer package.';
  }
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

  @IsOptional()
  @IsEnum(ServiceType)
  @Validate(TransferPackagesRequiredConstraint)
  serviceType?: ServiceType;

  @IsOptional()
  @IsBoolean()
  withDriver?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  availableQuantity?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCarImageDto)
  images: CreateCarImageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCarTransferPackageDto)
  transferPackages?: CreateCarTransferPackageDto[];
}
