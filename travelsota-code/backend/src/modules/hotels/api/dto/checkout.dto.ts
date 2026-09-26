import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { CreateBookingDto, PaxDto } from './create-booking.dto';

export class CheckoutDto extends CreateBookingDto {
  @IsEnum(PaymentGateway)
  gateway!: PaymentGateway;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  totalPrice?: number;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  /**
   * Payment-method signal for role-aware checkout (unified pipeline).
   * Agents default to the wallet/credit reserve-commit branch; passing
   * 'gateway' forces the normal PaymentIntent flow (agent pays by card).
   * Authenticated customers pass 'wallet' to spend prepaid wallet funds
   * (reserve-commit, no credit); guests ignore it (gateway only).
   */
  @IsOptional()
  @IsString()
  paymentMethod?: 'wallet' | 'gateway';

  /** Provider-neutral guest list (preferred over paxes) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaxDto)
  guests?: PaxDto[];
}
