import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../../shared/database/prisma.service';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

import { PaymentEntity } from '../../domain/entities/payment.entity';

@Injectable()
export class PrismaPaymentRepository
  extends PaymentRepository {
  constructor(
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async create(
    payment: PaymentEntity,
  ): Promise<void> {
    await this.prisma.payment.create({
      data: {
        id: payment.id,
        reference: payment.reference,
        idempotencyKey:
          payment.idempotencyKey,
        bookingId: payment.bookingId,
        bookingType: payment.bookingType,
        gateway: payment.gateway,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status as any,
        providerPaymentId:
          payment.providerPaymentId,

        providerClientSecret:
          payment.providerClientSecret,

        providerCheckoutUrl:
          payment.providerCheckoutUrl,

        providerPayerId:
          payment.providerPayerId,

        successUrl:
          payment.successUrl,

        cancelUrl:
          payment.cancelUrl,

        customerId:
          payment.customerId,

        captureMethod:
          payment.captureMethod,
      },
    });
  }

  async update(
    payment: PaymentEntity,
  ): Promise<void> {
    await this.prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        status: payment.status as any,
        providerPaymentId:
          payment.providerPaymentId,

        providerClientSecret:
          payment.providerClientSecret,
        providerCheckoutUrl:
          payment.providerCheckoutUrl,
        providerPayerId:
          payment.providerPayerId,

        successUrl:
          payment.successUrl,

        cancelUrl:
          payment.cancelUrl,

        customerId:
          payment.customerId,

        updatedAt: new Date(),
      },
    });
  }

  async findById(
    id: string,
  ): Promise<PaymentEntity | null> {
    const payment =
      await this.prisma.payment.findUnique({
        where: { id },
      });

    return payment
      ? new PaymentEntity(payment as any)
      : null;
  }

  async findByReference(
    reference: string,
  ): Promise<PaymentEntity | null> {
    const payment =
      await this.prisma.payment.findUnique({
        where: { reference },
      });

    return payment
      ? new PaymentEntity(payment as any)
      : null;
  }

  async findByProviderPaymentId(
    providerPaymentId: string,
  ): Promise<PaymentEntity | null> {
    const payment =
      await this.prisma.payment.findFirst({
        where: {
          providerPaymentId,
        },
      });

    return payment
      ? new PaymentEntity(payment as any)
      : null;
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentEntity | null> {
    const payment =
      await this.prisma.payment.findFirst({
        where: { idempotencyKey },
      });

    return payment
      ? new PaymentEntity(payment as any)
      : null;
  }

  async findMany(filters: {
  bookingId?: string;
  status?: string;
  gateway?: string;
  from?: Date;
  to?: Date;
}): Promise<PaymentEntity[]> {

  const payments =
    await this.prisma.payment.findMany({
      where: {
        bookingId:
          filters.bookingId,

        status:
          filters.status as any,

        gateway:
          filters.gateway,

        createdAt: {
          gte: filters.from,
          lte: filters.to,
        },
      },

      orderBy: {
        createdAt: 'desc',
      },

      // Unbounded public list otherwise — no callers paginate this.
      take: 100,
    });

  return payments.map(
    payment =>
      new PaymentEntity(
        payment as any,
      ),
  );
}
}