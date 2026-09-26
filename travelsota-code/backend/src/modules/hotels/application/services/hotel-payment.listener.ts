import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EventDispatcherService } from '../../../../shared/outbox/application/event-dispatcher.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { HotelBookingService } from './hotel-booking.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import type { HotelBookingRepoPort } from '../ports/hotel-booking-repo.port';
import { HotelBookingRepoPortToken } from '../ports/hotel-booking-repo.port';

@Injectable()
export class HotelPaymentListener implements OnModuleInit {
  private readonly logger = new Logger(HotelPaymentListener.name);

  constructor(
    private readonly dispatcher: EventDispatcherService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly bookingService: HotelBookingService,
    private readonly promoRedemptionService: PromoCodeRedemptionService,
    private readonly notifications: NotificationService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
    private readonly siteSettings: SiteSettingStore,
    @Inject(HotelBookingRepoPortToken)
    private readonly bookingRepo: HotelBookingRepoPort,
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

      if (payload.bookingType !== 'HOTEL') {
        return; // Not a hotel booking — ignore
      }

      this.logger.log(
        `[HotelPaymentListener] Processing payment success for booking ${payload.bookingId} (payment: ${payload.paymentId})`,
      );

      // Manual-issue mode: admin disabled "Auto-Issue After Payment" — a paid
      // hotel booking waits for admin issue instead of auto-confirming.
      // Mirrors the flight payment listener gate.
      const autoIssue =
        (await this.siteSettings
          .get<boolean>('bookingCustomerConfirm')
          .catch(() => null)) ?? true;
      if (!autoIssue) {
        this.logger.log(
          `[HotelPaymentListener] Manual-issue mode — booking ${payload.bookingId} waits for admin issue`,
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
          bookingType: 'HOTEL',
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

      try {
        const result = await this.bookingService.confirm(payload.bookingId);
        this.logger.log(
          `[HotelPaymentListener] Booking ${payload.bookingId} confirmed: status=${result.status} reference=${result.reference} fresh=${(result as any).fresh}`,
        );
        if (result.status === 'booked' && (result as any).fresh) {
          // Redeem the promo reservation (convert RESERVED → REDEEMED)
          await this.promoRedemptionService
            .redeemByBookingId(payload.bookingId)
            .catch(() => {});
          const eventId = randomUUID();
          const supplierConfirmedOutboxId = await this.outboxWriter.write({
            idempotencyKey: eventId,
            eventType: 'booking.supplier_confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'HOTEL',
              supplierReference: result.reference ?? null,
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
              bookingType: 'HOTEL',
              supplierReference: result.reference ?? null,
            },
          });
          this.logger.log(
            `[HotelPaymentListener] booking.supplier_confirmed dispatched for ${payload.bookingId}`,
          );
          // Note: booking.supplier_confirmed has no user-facing notification
          // (unmapped in NOTIFICATION_EVENT_MAP) — outbox dispatch only.

          // Notification: hotel booking confirmed
          const confirmedNotifId = randomUUID();
          const confirmedOutboxId = await this.outboxWriter.write({
            idempotencyKey: confirmedNotifId,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'HOTEL',
              amount: payload.amount,
              currency: payload.currency,
            },
          });
          this.immediateDispatcher.dispatch({
            id: confirmedOutboxId,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            idempotencyKey: confirmedNotifId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'HOTEL',
              amount: payload.amount,
              currency: payload.currency,
            },
          });
          this.notifications
            .notifyDirect({
              idempotencyKey: confirmedNotifId,
              eventType: 'booking.confirmed',
              aggregateType: 'Booking',
              aggregateId: payload.bookingId,
              payload: {
                bookingId: payload.bookingId,
                bookingType: 'HOTEL',
                amount: payload.amount,
                currency: payload.currency,
              },
            })
            .catch(() => {});
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `[HotelPaymentListener] Booking confirmation failed for ${payload.bookingId}: ${err.message}`,
          err.stack,
        );
        // Refund the promo reservation (convert RESERVED → REFUNDED or REDEEMED → REFUNDED)
        await this.promoRedemptionService
          .refundByBookingId(payload.bookingId)
          .catch(() => {});
        // If this is a BusinessError with upstream details, log them too
        if (error instanceof Error && 'details' in error) {
          this.logger.error(
            `[HotelPaymentListener] Upstream details for ${payload.bookingId}:`,
            JSON.stringify((error as any).details, null, 2),
          );
        }

        // Notification: provider failure — derive provider from booking
        let eventProvider = 'hotelbeds';
        try {
          const b = await this.bookingService.getBooking(payload.bookingId);
          eventProvider = b?.provider ?? 'hotelbeds';
        } catch {}
        const failureEventId = randomUUID();
        await this.outboxWriter.write({
          idempotencyKey: failureEventId,
          eventType: `provider.${eventProvider}.failure`,
          aggregateType: 'Booking',
          aggregateId: payload.bookingId,
          payload: {
            bookingId: payload.bookingId,
            bookingType: 'HOTEL',
            provider: eventProvider,
            reason: err.message,
            amount: payload.amount,
            currency: payload.currency,
          },
        });
        this.notifications
          .notifyDirect({
            idempotencyKey: failureEventId,
            eventType: `provider.${eventProvider}.failure`,
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: {
              bookingId: payload.bookingId,
              bookingType: 'HOTEL',
              provider: 'hotelbeds',
              reason: err.message,
              amount: payload.amount,
              currency: payload.currency,
            },
          })
          .catch(() => {});

        // Confirmation failure does NOT throw from the listener —
        // the booking is already marked as failed_supplier_booking with refund triggered
        // by the confirm() method. The listener should not crash the event bus.
      }
    });
  }
}
