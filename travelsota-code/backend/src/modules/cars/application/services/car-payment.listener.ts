import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventDispatcherService } from '../../../../shared/outbox/application/event-dispatcher.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import {
  CarBookingRepositoryPortToken,
  type CarBookingRepositoryPort,
} from '../ports/car-booking-repository.port';

// Matches the existing payment scheduler's stale-payment cutoff. Kept here as
// one Cars boundary until the platform exposes a shared configured TTL.
export const CAR_PAYMENT_HOLD_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CarPaymentListener implements OnModuleInit {
  private readonly logger = new Logger(CarPaymentListener.name);

  constructor(
    private readonly dispatcher: EventDispatcherService,
    @Inject(CarBookingRepositoryPortToken)
    private readonly bookingRepository: CarBookingRepositoryPort,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    this.dispatcher.register('payment.succeeded', async (event) => {
      const payload = event.payload as {
        bookingId: string;
        bookingType: string;
      };
      if (payload.bookingType !== 'CAR') return;
      const started = await this.bookingRepository.atomicClaimStatus(
        payload.bookingId,
        'pending_payment',
        'booking_in_progress',
      );
      const finalized = await this.bookingRepository.atomicClaimStatus(
        payload.bookingId,
        'booking_in_progress',
        'booked',
      );
      if (started || finalized)
        this.logger.log(
          `Cars booking ${payload.bookingId} finalized after payment.`,
        );
      if (finalized) {
        const idempotencyKey = `cars-booking-confirmed:${payload.bookingId}`;
        const notificationPayload = {
          ...payload,
          bookingType: 'CAR',
        };
        await this.outboxWriter.writeSafe({
          idempotencyKey,
          eventType: 'booking.confirmed',
          aggregateType: 'Booking',
          aggregateId: payload.bookingId,
          payload: notificationPayload,
        });
        await this.notifications
          .notifyDirect({
            idempotencyKey,
            eventType: 'booking.confirmed',
            aggregateType: 'Booking',
            aggregateId: payload.bookingId,
            payload: notificationPayload,
          })
          .catch(() => null);
      }
    });

    const release = async (
      event: { payload: unknown },
      status: 'payment_failed' | 'payment_expired',
    ) => {
      const payload = event.payload as {
        bookingId: string;
        bookingType: string;
      };
      if (payload.bookingType !== 'CAR') return;
      await this.bookingRepository.atomicClaimStatus(
        payload.bookingId,
        'pending_payment',
        status,
      );
    };
    this.dispatcher.register('payment.failed', (event) =>
      release(event, 'payment_failed'),
    );
    this.dispatcher.register('payment.expired', (event) =>
      release(event, 'payment_expired'),
    );
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireStalePendingRentals() {
    if (
      process.env.APP_ROLE !== 'worker' ||
      process.env.ENABLE_PAYMENT_SCHEDULER !== 'true'
    )
      return;
    const cutoff = new Date(Date.now() - CAR_PAYMENT_HOLD_TTL_MS);
    const count =
      await this.bookingRepository.expirePendingPaymentRentals(cutoff);
    if (count > 0)
      this.logger.log(`Expired ${count} stale Cars checkout hold(s).`);
  }
}
