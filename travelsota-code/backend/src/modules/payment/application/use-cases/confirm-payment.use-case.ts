import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';

import { PaymentRepository } from '../../domain/repositories/payment.repository';

import { PaymentStatus } from '../../domain/enums/payment-status.enum';

import { PaymentOrchestratorService } from '../services/payment-orchestrator.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';

@Injectable()
export class ConfirmPaymentUseCase {
  private readonly logger = new Logger(ConfirmPaymentUseCase.name);

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orchestrator: PaymentOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
  ) { }

  async execute(paymentId: string) {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new BusinessError('PAYMENT_NOT_FOUND');
    }

    if (payment.status === PaymentStatus.PAID) {
      this.logger.log(
        `Payment ${paymentId} already PAID — skipping (idempotent)`,
      );
      return {
        paymentId: payment.id,
        reference: payment.reference,
        status: payment.status,
        stripeStatus: 'succeeded',
      };
    }

    if (!payment.providerPaymentId) {
      throw new BusinessError('PAYMENT_PROVIDER_ID_MISSING');
    }

    const gateway = this.orchestrator.getGateway(payment.gateway);

    this.logger.log(
      `Confirming payment ${paymentId} via ${payment.gateway} (providerId: ${payment.providerPaymentId})`,
    );

    const result = await gateway.confirmPayment(payment.providerPaymentId);

    this.logger.log(
      `Gateway returned ${result.status} for payment ${paymentId}`,
    );

    let newStatus: string = payment.status;

    if (result.status === 'PAID') {
      newStatus = PaymentStatus.PAID;
      let outboxWritten = false;
      const notifEventId = randomUUID();
      let paymentSucceededEventId: string | null = null;
      const paymentSucceededPayload = {
        paymentId: payment.id,
        bookingId: payment.bookingId,
        bookingType: payment.bookingType,
        amount: payment.amount,
        currency: payment.currency,
      };
      await this.prisma.$transaction(async (tx) => {
        // Optimistic locking: only update if still in PENDING status
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.PAID },
        });
        if (updated.count === 0) {
          // Another process (webhook) already set this payment to PAID.
          // The webhook's transaction should have written the outbox event.
          this.logger.warn(
            `Payment ${paymentId} already updated by another process (webhook?) — skipping outbox write`,
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
          `Outbox event payment.succeeded written for payment ${paymentId} (eventId: ${eventId})`,
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

    if (result.status === 'AUTHORIZED') {
      newStatus = PaymentStatus.AUTHORIZED;
      let outboxWritten = false;
      const notifEventId = randomUUID();
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
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.AUTHORIZED },
        });
        if (updated.count === 0) {
          this.logger.warn(
            `Payment ${paymentId} already updated by another process (webhook?) — skipping outbox write`,
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

    if (result.status === 'FAILED') {
      newStatus = PaymentStatus.FAILED;
      let outboxWritten = false;
      const notifEventIdFailed = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        // Optimistic locking: only update if still in PENDING status
        const updated = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED },
        });
        if (updated.count === 0) return;

        await this.outboxWriter.writeInTransaction(tx, {
          eventType: 'payment.failed',
          aggregateType: 'payment',
          aggregateId: payment.id,
          idempotencyKey: notifEventIdFailed,
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
          idempotencyKey: notifEventIdFailed,
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

    if (result.status !== 'PAID' && result.status !== 'AUTHORIZED' && result.status !== 'FAILED') {
      this.logger.warn(
        `Gateway returned unexpected status '${result.status}' for payment ${paymentId} — no outbox event written`,
      );
    }

    return {
      paymentId: payment.id,
      reference: payment.reference,
      status: newStatus,
      providerStatus: result.status,
    };
  }
}
