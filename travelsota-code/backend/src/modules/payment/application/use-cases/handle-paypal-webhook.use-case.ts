import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';

import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';

@Injectable()
export class HandlePaypalWebhookUseCase {
  private readonly logger = new Logger(HandlePaypalWebhookUseCase.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
  ) {}

  async execute(event: any): Promise<void> {
    switch (event.event_type) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        await this.handleCompleted(event);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
        await this.handleFailed(event);
        break;

      case 'CHECKOUT.ORDER.APPROVED':
        this.logger.log(`PayPal order approved: ${event.resource?.id}`);
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        await this.handleRefunded(event);
        break;

      case 'PAYMENT.CAPTURE.REVERSED':
        await this.handleReversed(event);
        break;
    }
  }

  private async handleCompleted(event: any) {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId) return;

    const payment = await this.paymentRepository.findByProviderPaymentId(orderId);
    if (!payment) return;
    if (payment.status === PaymentStatus.PAID) return;

    const notifEventId = randomUUID();
    const paymentSucceededPayload = {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      bookingType: payment.bookingType,
      amount: payment.amount,
      currency: payment.currency,
    };
    let paymentSucceededEventId: string | null = null;
    let outboxWritten = false;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, updatedAt: new Date() },
      });
      if (updated.count === 0) return;

      paymentSucceededEventId = await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: paymentSucceededPayload,
        idempotencyKey: notifEventId,
      });
      outboxWritten = true;
    });
    if (outboxWritten) {
      this.immediateDispatcher.dispatch({
        id: paymentSucceededEventId!,
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: paymentSucceededPayload,
        idempotencyKey: notifEventId,
      });
      this.notifications.notifyDirect({
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: paymentSucceededPayload,
        idempotencyKey: notifEventId,
      }).catch(() => {});
    }
  }

  private async handleFailed(event: any) {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId) return;

    const payment = await this.paymentRepository.findByProviderPaymentId(orderId);
    if (!payment) return;
    if (payment.status === PaymentStatus.FAILED) return;

    const notifEventId = randomUUID();
    let outboxWritten = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, updatedAt: new Date() },
      });

      await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'payment.failed',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          bookingType: payment.bookingType,
          amount: payment.amount,
          currency: payment.currency,
        },
        idempotencyKey: notifEventId,
      });
      outboxWritten = true;
    });
    if (outboxWritten) {
      this.notifications.notifyDirect({
        eventType: 'payment.failed',
        aggregateType: 'payment',
        aggregateId: payment.id,
        payload: {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          bookingType: payment.bookingType,
          amount: payment.amount,
          currency: payment.currency,
        },
        idempotencyKey: notifEventId,
      }).catch(() => {});
    }
  }

  private async handleRefunded(event: any) {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId) return;

    const payment = await this.paymentRepository.findByProviderPaymentId(orderId);
    if (!payment) return;
    if (payment.status !== PaymentStatus.PAID) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, updatedAt: new Date() },
    });

    this.logger.log(`PayPal payment ${payment.id} refunded`);
  }

  private async handleReversed(event: any) {
    const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId) return;

    const payment = await this.paymentRepository.findByProviderPaymentId(orderId);
    if (!payment) return;
    if (payment.status !== PaymentStatus.PAID) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, updatedAt: new Date() },
    });

    this.logger.warn(`PayPal payment ${payment.id} reversed`);
  }
}
