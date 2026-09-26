import { PaymentGateway } from "../enums/payment-gateway.enum";
import { PaymentStatus } from "../enums/payment-status.enum";
import { BookingType } from "../enums/booking-type.enum";



export class PaymentEntity {
  id!: string;

  idempotencyKey!: string;
  
  reference!: string;

  bookingId!: string;

  bookingType!: BookingType;

  gateway!: PaymentGateway;

  amount!: number;

  currency!: string;

  status!: PaymentStatus;

  /** 'automatic' (default) or 'manual' — Stripe capture_method */
  captureMethod?: string;

  providerPaymentId?: string;

  providerPayerId?: string;

  providerClientSecret?: string;

  providerCheckoutUrl?: string;

  successUrl?: string;

  cancelUrl?: string;

  customerId?: string;

  createdAt!: Date;

  updatedAt!: Date;


  constructor(props: PaymentEntity) {
    Object.assign(this, props);
  }
}