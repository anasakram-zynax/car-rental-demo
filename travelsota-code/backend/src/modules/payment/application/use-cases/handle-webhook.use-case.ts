import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { PaymentStatus } from '../../domain/enums/payment-status.enum';

import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';

@Injectable()
export class HandleWebhookUseCase {
  private readonly logger = new Logger(HandleWebhookUseCase.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
  ) {}

  async execute(event: any): Promise<void> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handleSucceeded(event);
        break;

      case 'payment_intent.requires_capture':
        await this.handleRequiresCapture(event);
        break;

      case 'payment_intent.payment_failed':
        await this.handleFailed(event);
        break;

      case 'payment_intent.canceled':
        await this.handleCancelled(event);
        break;

      case 'payment_intent.processing':
        this.logger.log(`Payment ${event.data.object?.id} is processing`);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event);
        break;
    }
  }

  private async handleRequiresCapture(event: any) {
    const paymentIntent = event.data.object;

    const payment = await this.paymentRepository.findByProviderPaymentId(paymentIntent.id);
    if (!payment) {
      this.logger.warn(
        `Webhook payment_intent.requires_capture: no payment found for ${paymentIntent.id}`,
      );
      return;
    }
    if (payment.captureMethod !== 'manual') {
      this.logger.warn(
        `Webhook payment_intent.requires_capture: payment ${payment.id} is not manual capture — skipping`,
      );
      return;
    }
    if (payment.status === PaymentStatus.AUTHORIZED) {
      this.logger.log(
        `Webhook payment_intent.requires_capture: payment ${payment.id} already AUTHORIZED — skipping`,
      );
      return;
    }

    this.logger.log(
      `Webhook payment_intent.requires_capture: authorizing payment ${payment.id} (booking: ${payment.bookingId})`,
    );

    const notifEventId = randomUUID();
    let outboxWritten = false;
    let paymentSucceededEventId: string | null = null;
    const payload = {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      bookingType: payment.bookingType,
      amount: payment.amount,
      currency: payment.currency,
    };

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.AUTHORIZED, updatedAt: new Date() },
      });
      if (updated.count === 0) {
        this.logger.warn(
          `Webhook: payment ${payment.id} already processed — skipping outbox write`,
        );
        return;
      }

      const eventId = await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload,
      });
      paymentSucceededEventId = eventId;
      outboxWritten = true;
    });

    if (outboxWritten) {
      this.immediateDispatcher.dispatch({
        id: paymentSucceededEventId!,
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload,
      });

      this.notifications.notifyDirect({
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload,
      }).catch(() => {});
    }
  }

  private async handleSucceeded(event: any) {
    const paymentIntent = event.data.object;

    const payment = await this.paymentRepository.findByProviderPaymentId(paymentIntent.id);
    if (!payment) {
      this.logger.warn(
        `Webhook payment_intent.succeeded: no payment found for providerPaymentId ${paymentIntent.id}`,
      );
      return;
    }
    if (payment.status === PaymentStatus.PAID) {
      this.logger.log(
        `Webhook payment_intent.succeeded: payment ${payment.id} already PAID — skipping`,
      );
      return;
    }

    this.logger.log(
      `Webhook payment_intent.succeeded: processing payment ${payment.id} (booking: ${payment.bookingId})`,
    );

    // Keep payment update + outbox write atomic inside a $transaction
    // to prevent data loss on process crash between writes.
    // Use updateMany + count check (not singular update) to avoid P2025
    // "Record to update not found" when the confirm endpoint already set PAID.
    const notifEventId = randomUUID();
    let outboxWritten = false;
    let paymentSucceededEventId: string | null = null;
    const paymentSucceededPayload = {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      bookingType: payment.bookingType,
      amount: payment.amount,
      currency: payment.currency,
    };
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.PAID } },
        data: { status: PaymentStatus.PAID, updatedAt: new Date() },
      });
      if (updated.count === 0) {
        this.logger.warn(
          `Webhook: payment ${payment.id} already PAID by another process — skipping outbox write`,
        );
        return;
      }

      const eventId = await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload: paymentSucceededPayload,
      });
      this.logger.log(
        `Webhook: outbox event payment.succeeded written for payment ${payment.id} (eventId: ${eventId})`,
      );
      paymentSucceededEventId = eventId;
      outboxWritten = true;
    });
    if (outboxWritten) {
      this.immediateDispatcher.dispatch({
        id: paymentSucceededEventId!,
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload: paymentSucceededPayload,
      });

      this.notifications.notifyDirect({
        eventType: 'payment.succeeded',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload: paymentSucceededPayload,
      }).catch(() => {});
    }
  }

  private async handleFailed(event: any) {
    const paymentIntent = event.data.object;

    const payment = await this.paymentRepository.findByProviderPaymentId(paymentIntent.id);
    if (!payment) return;
    if (payment.status === PaymentStatus.FAILED) return;

    const notifEventId = randomUUID();
    let outboxWritten = false;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, updatedAt: new Date() },
      });
      if (updated.count === 0) return;

      await this.outboxWriter.writeInTransaction(tx, {
        eventType: 'payment.failed',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload: {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          bookingType: payment.bookingType,
          amount: payment.amount,
          currency: payment.currency,
        },
      });
      outboxWritten = true;
    });
    if (outboxWritten) {
      this.notifications.notifyDirect({
        eventType: 'payment.failed',
        aggregateType: 'payment',
        aggregateId: payment.id,
        idempotencyKey: notifEventId,
        payload: {
          paymentId: payment.id,
          bookingId: payment.bookingId,
          bookingType: payment.bookingType,
          amount: payment.amount,
          currency: payment.currency,
        },
      }).catch(() => {});
    }
  }

  private async handleCancelled(event: any) {
    const paymentIntent = event.data.object;

    const payment = await this.paymentRepository.findByProviderPaymentId(paymentIntent.id);
    if (!payment) return;
    if (payment.status === PaymentStatus.CANCELLED || payment.status === PaymentStatus.PAID) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.CANCELLED, updatedAt: new Date() },
    });

    this.logger.log(`Payment ${payment.id} was cancelled`);
  }

  private async handleChargeRefunded(event: any) {
    const charge = event.data.object;
    const paymentIntentId = charge.payment_intent;

    if (!paymentIntentId) return;

    const payment = await this.paymentRepository.findByProviderPaymentId(paymentIntentId);
    if (!payment) return;
    if (payment.status !== PaymentStatus.PAID) return;

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED, updatedAt: new Date() },
    });

    this.logger.log(`Payment ${payment.id} refunded — charge ${charge.id}`);
  }

}
