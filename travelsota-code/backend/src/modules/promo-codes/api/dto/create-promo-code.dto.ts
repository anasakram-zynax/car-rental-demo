import {
  IsString,
  IsOptional,
  IsIn,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  IsDateString,
  MaxLength,
} from 'class-validator';

export class CreatePromoCodeDto {
  @IsString()
  @MaxLength(30)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsIn(['PERCENTAGE', 'FIXED'])
  discountType!: 'PERCENTAGE' | 'FIXED';

  @IsNumber()
  @Min(1)
  discountValueMinor!: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  discountPercentBps?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxDiscountMinor?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBookingAmountMinor?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  totalUsageLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  firstBookingOnly?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['ALL', 'CUSTOMER', 'AGENT'])
  customerType?: 'ALL' | 'CUSTOMER' | 'AGENT';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleRoutes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleAirlines?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleCabins?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleHotelIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleDestinations?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedProviders?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
