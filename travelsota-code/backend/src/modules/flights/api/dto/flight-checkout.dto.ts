import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { BookingPreviewDto } from './booking-preview.dto';

export class FlightCheckoutDto extends BookingPreviewDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  // Unified pipeline Phase 8: agents default to wallet/credit settlement.
  // 'gateway' forces the card PaymentIntent flow (agent chose card at checkout).
  @IsOptional()
  @IsIn(['wallet', 'gateway'])
  paymentMethod?: 'wallet' | 'gateway';
}
