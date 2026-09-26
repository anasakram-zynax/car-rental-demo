import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventDispatcherService } from '../../../../shared/outbox/application/event-dispatcher.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { NotificationService } from '../../../notifications/application/notification.service';

/**
 * Handles payment.refund_needed events fired by FlightPaymentListener
 * when supplier ticketing fails after payment. Automatically refunds
 * the customer through the original payment gateway.
 */
@Injectable()
export class FlightRefundListener implements OnModuleInit {
  private readonly logger = new Logger(FlightRefundListener.name);

  constructor(
    private readonly dispatcher: EventDispatcherService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly paymentRepository: PaymentRepository,
    private readonly orchestrator: PaymentOrchestratorService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    this.dispatcher.register('payment.refund_needed', async (event) => {
      const payload = event.payload as {
        paymentId: string;
        bookingId: string;
        bookingType: string;
        reason: string;
        amount: number;
        currency: string;
      };

      this.logger.log(
        `Refund needed for booking ${payload.bookingId} — processing refund for payment ${payload.paymentId}`,
      );

      const payment = await this.paymentRepository.findById(payload.paymentId);
      if (!payment) {
        this.logger.error(
          `Payment ${payload.paymentId} not found — cannot process refund`,
        );
        return;
      }

      if (payment.status === PaymentStatus.REFUNDED) {
        this.logger.log(
          `Payment ${payload.paymentId} already refunded — skipping`,
        );
        return;
      }

      if (payment.status !== PaymentStatus.PAID) {
        this.logger.warn(
          `Payment ${payload.paymentId} status is ${payment.status} — cannot refund (expected PAID)`,
        );
        return;
      }

      // Notification: refund requested
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'refund.requested',
        aggregateType: 'Payment',
        aggregateId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          bookingId: payload.bookingId,
          amount: payload.amount,
          currency: payload.currency,
          reason: payload.reason,
        },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'refund.requested',
        aggregateType: 'Payment',
        aggregateId: payload.paymentId,
        payload: {
          paymentId: payload.paymentId,
          bookingId: payload.bookingId,
          amount: payload.amount,
          currency: payload.currency,
          reason: payload.reason,
        },
      }).catch(() => {});

      try {
        const gateway = this.orchestrator.getGateway(payment.gateway);
        if (gateway.refundPayment) {
          await gateway.refundPayment(payment.providerPaymentId!);
          this.logger.log(
            `Refund processed for payment ${payload.paymentId} via ${payment.gateway}`,
          );
        } else {
          this.logger.warn(
            `Gateway ${payment.gateway} does not support refundPayment — manual refund required`,
          );
          return;
        }

        payment.status = PaymentStatus.REFUNDED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);

        // Notification: refund completed
        const eventId = randomUUID();
        await this.outboxWriter.write({
          idempotencyKey: eventId,
          eventType: 'refund.completed',
          aggregateType: 'Payment',
          aggregateId: payload.paymentId,
          payload: {
            paymentId: payload.paymentId,
            bookingId: payload.bookingId,
            amount: payload.amount,
            currency: payload.currency,
          },
        });
        this.notifications.notifyDirect({
          idempotencyKey: eventId,
          eventType: 'refund.completed',
          aggregateType: 'Payment',
          aggregateId: payload.paymentId,
          payload: {
            paymentId: payload.paymentId,
            bookingId: payload.bookingId,
            amount: payload.amount,
            currency: payload.currency,
          },
        }).catch(() => {});

        this.logger.log(
          `Payment ${payload.paymentId} marked as REFUNDED — booking ${payload.bookingId}`,
        );
      } catch (err: unknown) {
        this.logger.error(
          `Refund failed for payment ${payload.paymentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Don't throw — the outbox event should not be retried for refund failures.
        // Admin intervention is needed for manual refund.
      }
    });
  }
}
