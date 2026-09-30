import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsIn,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';

export class CarRentalCheckoutDto {
  @IsIn(['rental', 'transfer'])
  serviceType!: 'rental' | 'transfer';

  @ValidateIf((input: CarRentalCheckoutDto) => input.serviceType === 'rental')
  @IsString()
  @MinLength(1)
  fleetId?: string;

  @ValidateIf((input: CarRentalCheckoutDto) => input.serviceType === 'transfer')
  @IsString()
  @MinLength(1)
  transferPackageId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  pickupLocation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dropoffLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  returnAt?: string;

  @IsISO8601({ strict: true })
  pickupAt!: string;

  @ValidateIf((input: CarRentalCheckoutDto) => input.serviceType === 'rental')
  @IsISO8601({ strict: true })
  dropoffAt?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  contactName!: string;

  @IsEmail()
  @MaxLength(200)
  contactEmail!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  contactPhone!: string;

  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  // Accepted only for compatibility/debugging; checkout never trusts it.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  clientTotal?: number;
}
