import {
  IsString,
  IsNumber,
  IsEnum,
  IsPositive,
  IsOptional,
} from 'class-validator';

import { BookingType } from '../../domain/enums/booking-type.enum';
import { PaymentGateway } from '../../domain/enums/payment-gateway.enum';

export class CreatePaymentIntentDto {
  @IsString()
  bookingId!: string;

  @IsEnum(BookingType)
  bookingType!: BookingType;

  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  currency!: string;

  @IsOptional()
@IsString()
successUrl?: string;

@IsOptional()
@IsString()
cancelUrl?: string;

@IsOptional()
@IsString()
customerId?: string;

@IsOptional()
@IsString()
idempotencyKey?: string;

@IsOptional()
@IsString()
captureMethod?: 'automatic' | 'manual';
}