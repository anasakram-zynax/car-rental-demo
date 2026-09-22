import { IsEnum } from 'class-validator';
import { PaymentStatus } from '../../domain/payment-status.js';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  paymentStatus!: PaymentStatus;
}
