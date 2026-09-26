import { PaymentEntity } from "../entities/payment.entity";

export abstract class PaymentRepository {
  abstract create(
    payment: PaymentEntity,

  ): Promise<void>;

  abstract update(
    payment: PaymentEntity,
  ): Promise<void>;

  abstract findById(
    id: string,
  ): Promise<PaymentEntity | null>;

  abstract findByReference(
    reference: string,
  ): Promise<PaymentEntity | null>;

  abstract findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentEntity | null>;

  abstract findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentEntity | null>;

  abstract findMany(filters: {
    bookingId?: string;
    status?: string;
    gateway?: string;
    from?: Date;
    to?: Date;
  }): Promise<PaymentEntity[]>;
}