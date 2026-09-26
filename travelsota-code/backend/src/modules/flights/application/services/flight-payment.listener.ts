import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventDispatcherService } from '../../../../shared/outbox/application/event-dispatcher.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { FlightBookingPublicService } from './flight-booking-public.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import type { FlightBookingRepoPort } from '../ports/flight-booking-repo.port';
import { FlightBookingRepoPortToken } from '../ports/flight-booking-repo.port';
import { NotificationService } from '../../../notifications/application/notification.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';

@Injectable()
export class FlightPaymentListener implements OnModuleInit {
  private readonly logger = new Logger(FlightPaymentListener.name);

  constructor(
    private readonly dispatcher: EventDispatcherService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly bookingService: FlightBookingPublicService,
    @Inject(FlightBookingRepoPortToken)
    private readonly bookingRepo: FlightBookingRepoPort,
    private readonly promoRedemptionService: PromoCodeRedemptionService,
    private readonly notifications: NotificationService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly bookingProviderRegistry: FlightBookingProviderRegistryService,
    private readonly siteSettings: SiteSettingStore,
  ) {}

  onModuleInit() {
    this.dispatcher.register('payment.succeeded', async (event) => {
      const payload = event.payload as {
        paymentId: string;
        bookingId: string;
        bookingType: string;
        amount: number;
        currency: string;
      };

      if (payload.bookingType !== 'FLIGHT') return;

      this.logger.log(
        `Payment ${payload.paymentId} succeeded — ticketing booking ${payload.bookingId}`,
      );

      // Safety: if booking is held_pending_payment but hold has expired,
      // cancel/refund the payment and mark booking as hold_expired.
      const booking = await this.bookingRepo.findById(payload.bookingId);
      if (booking?.status === 'held_pending_payment' && booking.holdExpiresAt) {
        if (new Date(booking.holdExpiresAt) < new Date()) {
          this.logger.warn(
            `[HoldExpired] Booking ${payload.bookingId} hold expired at ${booking.holdExpiresAt} — cancelling/refunding payment`,
          );
          await this.handleExpiredHoldPayment(payload);
          return;
        }
      }

      // Manual-issue mode: when the admin disables "Auto-Issue After Payment"
      // (bookingCustomerConfirm=false), a paid booking waits as held for an
      // admin to verify + issue it (bank-transfer / manual-review flow).
      // Bank-transfer/pay-later bookings never reach this handler with real
      // money — they hold without a gateway charge until admin issue.
      const autoIssue =
        (await this.siteSettings
          .get<boolean>('bookingCustomerConfirm')
          .catch(() => null)) ?? true;
      if (!autoIssue) {
        this.logger.log(
          `Payment ${payload.paymentId} succeeded — manual-issue mode, booking ${payload.bookingId} waits for admin issue`,
        );
        await this.bookingRepo
          .update(payload.bookingId, {
            status: 'awaiting_issue',
            message: 'Payment verified — awaiting admin issue.',
          })
          .catch(() => {});
        const eventId = randomUUID();
        const awaitingPayload = {
          bookingId: payload.bookingId,
          bookingType: 'FLIGHT',
          paymentId: payload.paymentId,
          amount: payload.amount,
          currency: payload.currency,
        };
        await this.outboxWriter
          .write({
            idempotencyKey: eventId,
            eventType: 'booking.awaiting_issue',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: awaitingPayload,
          })
          .catch(() => {});
        this.notifications
          .notifyDirect({
            idempotencyKey: eventId,
            eventType: 'booking.awaiting_issue',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: awaitingPayload,
          })
          .catch(() => {});
        return;
      }

      // Atomic status claim: atomically transition from 'pending_payment', 'held',
      // or 'held_pending_payment' to 'booking_in_progress'. This uses Prisma's
      // updateMany with a WHERE clause so that if two workers process the same
      // outbox event, only one succeeds.
      let claimed = await this.bookingRepo.atomicClaimStatus(
        payload.bookingId,
        'pending_payment',
        'booking_in_progress',
        'Supplier booking started after payment',
      );

      if (!claimed) {
        claimed = await this.bookingRepo.atomicClaimStatus(
          payload.bookingId,
          'held',
          'booking_in_progress',
          'Ticketing started after payment (from held)',
        );
      }

      if (!claimed) {
        claimed = await this.bookingRepo.atomicClaimStatus(
          payload.bookingId,
          'held_pending_payment',
          'booking_in_progress',
          'Ticketing started after payment (from held_pending_payment)',
        );
      }

      if (!claimed) {
        this.logger.log(
          `[Idempotency] Booking ${payload.bookingId} not in 'pending_payment', 'held', or 'held_pending_payment' state — skipping`,
        );
        return;
      }

      try {
        // Auto-issue ON (toggle): ticket immediately — forceTicket bypasses
        // the hold_only instance default, which only governs held flows.
        const result = await this.bookingService.ticketBooking(
          payload.bookingId,
          { forceTicket: true },
        );

        this.logger.log(
          `Ticketing result for ${payload.bookingId}: ok=${result.ok}, status=${result.status}, tickets=${result.ticketNumbers?.length ?? 0}`,
        );

        // On successful ticketing/held, fire booking.supplier_confirmed
        if (
          result.ok &&
          (result.status === 'ticketed' || result.status === 'held')
        ) {
          // Redeem the promo reservation (convert RESERVED → REDEEMED)
          await this.promoRedemptionService
            .redeemByBookingId(payload.bookingId)
            .catch(() => {});

          // Manual capture: if payment was authorized (manual capture), capture it now
          // that the supplier booking succeeded.
          await this.captureIfManualCapture(payload.bookingId);

          let eventId = randomUUID();
          const supplierConfirmedOutboxId = await this.outboxWriter.write({
            idempotencyKey: eventId,
            eventType: 'booking.supplier_confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'FLIGHT',
              ticketNumbers: result.ticketNumbers,
              locatorCode: result.locatorCode,
            },
          });
          this.immediateDispatcher.dispatch({
            id: supplierConfirmedOutboxId,
            eventType: 'booking.supplier_confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            idempotencyKey: eventId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'FLIGHT',
              ticketNumbers: result.ticketNumbers,
              locatorCode: result.locatorCode,
            },
          });
          // Note: booking.supplier_confirmed has no user-facing notification
          // (unmapped in NOTIFICATION_EVENT_MAP) — outbox dispatch only.

          // Notification: booking confirmed
          this.logger.log(
            `[NOTIF-DEBUG] STEP-1 booking.confirmed writing to outbox for booking ${payload.bookingId}`,
          );
          eventId = randomUUID();
          const bookingConfirmedOutboxId = await this.outboxWriter.write({
            idempotencyKey: eventId,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'FLIGHT',
              amount: payload.amount,
              currency: payload.currency,
            },
          });
          this.immediateDispatcher.dispatch({
            id: bookingConfirmedOutboxId,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            idempotencyKey: eventId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'FLIGHT',
              amount: payload.amount,
              currency: payload.currency,
            },
          });
          this.notifications.notifyDirect({
            idempotencyKey: eventId,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'FLIGHT',
              amount: payload.amount,
              currency: payload.currency,
            },
          }).catch(() => {});
          this.logger.log(
            `[NOTIF-DEBUG] STEP-1 booking.confirmed outbox write OK for booking ${payload.bookingId}`,
          );

          this.logger.log(
            `booking.supplier_confirmed + booking.confirmed fired for ${payload.bookingId}`,
          );
        }

        // On failure, mark booking as failed
        if (!result.ok) {
          const booking = await this.bookingRepo.findById(payload.bookingId);
          await this.promoRedemptionService
            .refundByBookingId(payload.bookingId)
            .catch(() => {});

          // Manual capture: cancel authorization instead of firing refund
          const wasCancelled = await this.cancelIfManualCapture(payload.bookingId);
          if (wasCancelled) {
            this.logger.log(
              `[ManualCapture] Cancelled authorization for ${payload.bookingId} after supplier failure`,
            );
            return;
          }

          await this.handleTicketingFailure(
            payload.bookingId,
            result.status ?? 'failed_supplier_booking',
            result.message ?? 'Ticketing failed after payment',
            payload.paymentId,
            payload.amount,
            payload.currency,
            booking?.provider ?? 'travelport',
          );
        }
      } catch (err: unknown) {
        // Unhandled error in ticketBooking — mark as failed
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Ticketing crashed for ${payload.bookingId}: ${message}`,
        );
        const booking = await this.bookingRepo.findById(payload.bookingId).catch(() => null);
        await this.promoRedemptionService
          .refundByBookingId(payload.bookingId)
          .catch(() => {});

        // Manual capture: cancel authorization instead of firing refund
        const wasCancelled = await this.cancelIfManualCapture(payload.bookingId);
        if (wasCancelled) {
          this.logger.log(
            `[ManualCapture] Cancelled authorization for ${payload.bookingId} after crash`,
          );
          return;
        }

        await this.handleTicketingFailure(
          payload.bookingId,
          'failed_supplier_booking',
          message,
          payload.paymentId,
          payload.amount,
          payload.currency,
          booking?.provider ?? 'travelport',
        );
      }
    });

    // ── Phase 8: Payment failure → cancel held PNR ──────────────────────
    this.dispatcher.register('payment.failed', async (event) => {
      const payload = event.payload as {
        paymentId: string;
        bookingId: string;
        bookingType: string;
        amount: number;
        currency: string;
      };

      if (payload.bookingType !== 'FLIGHT') return;

      this.logger.log(
        `Payment ${payload.paymentId} failed — checking booking ${payload.bookingId} for held PNR cleanup`,
      );

      const booking = await this.bookingRepo.findById(payload.bookingId);
      if (!booking) {
        this.logger.warn(`[PaymentFailed] Booking ${payload.bookingId} not found`);
        return;
      }

      // Only act if the booking is in a state where a hold may exist
      const holdStatuses = ['held_pending_payment', 'pending_payment', 'held'];
      if (!holdStatuses.includes(booking.status)) {
        this.logger.log(
          `[PaymentFailed] Booking ${payload.bookingId} in status ${booking.status} — no hold to cancel`,
        );
        return;
      }

      // Attempt to cancel the held PNR via provider (best-effort)
      await this.cancelHeldPNR(booking);

      // Update booking status
      const newStatus = booking.status === 'held_pending_payment' || booking.status === 'held'
        ? 'payment_failed'
        : 'payment_failed';

      await this.bookingRepo.update(payload.bookingId, {
        status: newStatus,
        message: `Payment failed: ${payload.paymentId}. Hold cancelled.`,
      });

      this.notifications.notifyDirect({
        idempotencyKey: randomUUID(),
        eventType: 'booking.payment_failed',
        aggregateType: 'Booking',
        aggregateId: payload.bookingId,
        payload: {
          bookingId: payload.bookingId,
          bookingType: 'FLIGHT',
          paymentId: payload.paymentId,
          reason: 'Payment failed — held PNR cancelled.',
        },
      }).catch(() => {});

      this.logger.log(
        `[PaymentFailed] Booking ${payload.bookingId} → ${newStatus}`,
      );
    });

    // ── Phase 8: Payment expired → cancel held PNR ──────────────────────
    this.dispatcher.register('payment.expired', async (event) => {
      const payload = event.payload as {
        paymentId: string;
        bookingId: string;
        bookingType: string;
      };

      if (payload.bookingType !== 'FLIGHT') return;

      this.logger.log(
        `Payment ${payload.paymentId} expired — checking booking ${payload.bookingId} for held PNR cleanup`,
      );

      const booking = await this.bookingRepo.findById(payload.bookingId);
      if (!booking) return;

      const holdStatuses = ['held_pending_payment', 'pending_payment', 'held'];
      if (!holdStatuses.includes(booking.status)) return;

      await this.cancelHeldPNR(booking);

      await this.bookingRepo.update(payload.bookingId, {
        status: 'payment_expired',
        message: `Payment expired. Hold cancelled.`,
      });

      this.notifications.notifyDirect({
        idempotencyKey: randomUUID(),
        eventType: 'booking.payment_expired',
        aggregateType: 'Booking',
        aggregateId: payload.bookingId,
        payload: {
          bookingId: payload.bookingId,
          bookingType: 'FLIGHT',
          paymentId: payload.paymentId,
          reason: 'Payment expired — held PNR cancelled.',
        },
      }).catch(() => {});

      this.logger.log(
        `[PaymentExpired] Booking ${payload.bookingId} → payment_expired`,
      );
    });
  }

  /**
   * Capture a manually-authorized payment after supplier booking succeeded.
   * No-op if the payment is not manual capture or already captured.
   */
  private async captureIfManualCapture(bookingId: string): Promise<void> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      const payment = payments?.[0];
      if (!payment || payment.captureMethod !== 'manual' || payment.status !== PaymentStatus.AUTHORIZED) {
        return;
      }
      const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
      if (gateway.capturePayment) {
        await gateway.capturePayment(payment.providerPaymentId!);
      }
      payment.status = PaymentStatus.PAID;
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
      this.logger.log(
        `[ManualCapture] Captured payment ${payment.id} for booking ${bookingId}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(
        `[ManualCapture] Capture failed for booking ${bookingId}: ${msg}`,
      );
    }
  }

  /**
   * Cancel a manual-capture authorization when supplier booking fails.
   * Returns true if the authorization was cancelled, false if no action taken.
   */
  private async cancelIfManualCapture(bookingId: string): Promise<boolean> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      const payment = payments?.[0];
      if (!payment || payment.captureMethod !== 'manual' || payment.status !== PaymentStatus.AUTHORIZED) {
        return false;
      }
      const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
      if (gateway.cancelPayment) {
        await gateway.cancelPayment(payment.providerPaymentId!);
      }
      payment.status = PaymentStatus.CANCELLED;
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
      this.logger.log(
        `[ManualCapture] Cancelled authorization for payment ${payment.id} on booking ${bookingId}`,
      );
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(
        `[ManualCapture] Cancel authorization failed for booking ${bookingId}: ${msg}`,
      );
      return false;
    }
  }

  /**
   * Phase 8: Best-effort cancel of a held PNR via the provider adapter.
   * Used when payment fails or expires so the supplier does not hold the seat
   * indefinitely. Errors are logged but never thrown — the booking status
   * update must still proceed.
   */
  private async cancelHeldPNR(booking: {
    id: string;
    provider: string;
    locatorCode?: string | null;
    workbenchId?: string | null;
  }): Promise<void> {
    if (!booking.locatorCode) return;

    try {
      const provider = this.bookingProviderRegistry.getProvider(booking.provider as FlightsProviderKey);
      if (!provider.cancelBooking) {
        this.logger.warn(
          `[CancelHeldPNR] Provider ${booking.provider} has no cancelBooking method`,
        );
        return;
      }

      const result = await provider.cancelBooking({
        bookingId: booking.id,
        supplierBookingId: booking.workbenchId ?? undefined,
        locatorCode: booking.locatorCode,
      });

      this.logger.log(
        `[CancelHeldPNR] Provider cancel result for ${booking.id}: ok=${result.ok}, status=${result.supplierStatus}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `[CancelHeldPNR] Provider cancel failed for ${booking.id}: ${msg}`,
      );
    }
  }

  /**
   * Handle a payment that arrived after the hold already expired.
   * Cancels the auth or refunds the charge, then marks the booking hold_expired.
   */
  private async handleExpiredHoldPayment(payload: {
    paymentId: string;
    bookingId: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId: payload.bookingId });
      const payment = payments?.[0];
      if (!payment) return;

      if (payment.status === PaymentStatus.AUTHORIZED) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.cancelPayment) {
          await gateway.cancelPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.CANCELLED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
        this.logger.log(`[HoldExpired] Cancelled auth for payment ${payment.id} on booking ${payload.bookingId}`);
      } else if (payment.status === PaymentStatus.PAID) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.refundPayment) {
          await gateway.refundPayment(payment.providerPaymentId!, payload.amount);
        }
        payment.status = PaymentStatus.REFUNDED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
        this.logger.log(`[HoldExpired] Refunded payment ${payment.id} for booking ${payload.bookingId}`);
      } else if (payment.status === PaymentStatus.PENDING) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.cancelPayment) {
          await gateway.cancelPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.CANCELLED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
        this.logger.log(`[HoldExpired] Cancelled pending payment ${payment.id} for booking ${payload.bookingId}`);
      }

      // Mark booking as hold_expired
      await this.bookingRepo.transitionStatus(payload.bookingId, 'held_pending_payment', 'hold_expired', 'Hold expired before payment could be processed.');
    } catch (err: unknown) {
      this.logger.error(
        `[HoldExpired] Failed to handle payment for ${payload.bookingId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Mark the booking as failed and fire payment.refund_needed so the refund
   * module can process the automatic refund. Without this, the customer pays
   * but never gets a ticket or a refund.
   */
  private async handleTicketingFailure(
    bookingId: string,
    status: string,
    reason: string,
    paymentId: string,
    amount: number,
    currency: string,
    provider: string = 'travelport',
  ): Promise<void> {
    try {
      // Mark the booking as failed so it doesn't block future retries.
      // Tolerant update (not transitionStatus): ticketBookingCore already
      // moved the booking to ticketing_failed_refund_needed before we run,
      // so a guarded from-status transition would throw P2025 and — worse —
      // skip the refund event below, leaving customer money stuck.
      await this.bookingRepo
        .update(bookingId, {
          status: 'failed_supplier_booking',
          message: `Ticketing failed after payment: ${reason}`,
        } as any)
        .catch(() => null);

      // Fire refund event — the refund module or admin will process it
      let eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'payment.refund_needed',
        aggregateType: 'Payment',
        aggregateId: paymentId,
        payload: {
          paymentId,
          bookingId,
          bookingType: 'FLIGHT',
          reason: `Supplier ticketing failed: ${reason}`,
          amount,
          currency,
        },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'payment.refund_needed',
        aggregateType: 'Payment',
        aggregateId: paymentId,
        payload: {
          paymentId,
          bookingId,
          bookingType: 'FLIGHT',
          reason: `Supplier ticketing failed: ${reason}`,
          amount,
          currency,
        },
      }).catch(() => {});

      // Notification: booking failed
      eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.failed',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason,
          amount,
          currency,
        },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'booking.failed',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason,
          amount,
          currency,
        },
      }).catch(() => {});

      // Notification: provider failure (use actual provider name)
      const providerEventType = `provider.${provider}.failure` as const;
      eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: providerEventType,
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          provider,
          reason,
          amount,
          currency,
        },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: providerEventType,
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          provider,
          reason,
          amount,
          currency,
        },
      }).catch(() => {});

      this.logger.warn(
        `payment.refund_needed fired for ${bookingId} (payment ${paymentId}, ${amount} ${currency})`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to handle ticketing failure for ${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
