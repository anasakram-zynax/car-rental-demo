import { Inject, Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import {
  CarBookingRepositoryPortToken,
  type CarBookingRepositoryPort,
} from '../ports/car-booking-repository.port';

const CUSTOMER_CANCELLATION_NOTICE_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_CANCELLABLE_STATUSES = [
  'pending_payment',
  'booked',
  'payment_failed',
  'payment_expired',
] as const;

@Injectable()
export class CarCancellationService {
  constructor(
    @Inject(CarBookingRepositoryPortToken)
    private readonly bookingRepository: CarBookingRepositoryPort,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  async cancelOwnBooking(
    bookingId: string,
    userId: string,
    reason?: string,
    now = new Date(),
  ) {
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking || booking.userId !== userId)
      throw new BusinessError(
        'CAR_BOOKING_NOT_FOUND',
        'Cars booking not found.',
      );
    if (booking.status === 'cancelled')
      return { bookingId, status: 'cancelled', alreadyCancelled: true };
    if (!CUSTOMER_CANCELLABLE_STATUSES.includes(booking.status as never))
      throw new BusinessError(
        'CAR_BOOKING_NOT_CANCELLABLE',
        `Cars booking cannot be cancelled in status: ${booking.status}.`,
      );
    if (
      booking.pickupAt.getTime() - now.getTime() <
      CUSTOMER_CANCELLATION_NOTICE_MS
    )
      throw new BusinessError(
        'CAR_BOOKING_CANCELLATION_WINDOW_CLOSED',
        'Cars bookings may be cancelled only at least 24 hours before pickup.',
      );

    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments[0];
    let refundAmount = 0;
    let cancellationExpectedStatuses: readonly BookingStatus[] =
      CUSTOMER_CANCELLABLE_STATUSES;
    const paidBooking = payment?.status === PaymentStatus.PAID;
    if (paidBooking) {
      const claimed = await this.bookingRepository.atomicClaimStatus(
        bookingId,
        'booked',
        'cancellation_requested',
      );
      if (!claimed)
        throw new BusinessError(
          'CAR_BOOKING_CANCELLATION_CONFLICT',
          'Cars booking status changed while cancellation was processing.',
        );
      cancellationExpectedStatuses = ['cancellation_requested'];
    }

    try {
      if (paidBooking && payment) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (!gateway.refundPayment || !payment.providerPaymentId)
          throw new BusinessError(
            'CAR_BOOKING_REFUND_UNAVAILABLE',
            'This paid Cars booking cannot be cancelled until refund processing is available.',
          );
        refundAmount = Number(payment.amount);
        await gateway.refundPayment(
          payment.providerPaymentId,
          refundAmount,
          payment.currency,
        );
        payment.status = PaymentStatus.REFUNDED;
        payment.updatedAt = now;
        await this.paymentRepository.update(payment);
      } else if (
        payment &&
        [
          PaymentStatus.PENDING,
          PaymentStatus.PROCESSING,
          PaymentStatus.REQUIRES_ACTION,
          PaymentStatus.AUTHORIZED,
        ].includes(payment.status)
      ) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (payment.providerPaymentId && gateway.cancelPayment)
          await gateway.cancelPayment(payment.providerPaymentId);
        payment.status = PaymentStatus.CANCELLED;
        payment.updatedAt = now;
        await this.paymentRepository.update(payment);
      }
    } catch (error) {
      if (paidBooking)
        await this.bookingRepository.atomicClaimStatus(
          bookingId,
          'cancellation_requested',
          'booked',
        );
      throw error;
    }

    const cancellationReason = reason?.trim() || 'Cancelled by customer.';
    const cancelled = await this.bookingRepository.atomicCancel(
      bookingId,
      cancellationExpectedStatuses,
      cancellationReason,
      now,
    );
    if (!cancelled) {
      const latest = await this.bookingRepository.findById(bookingId);
      if (latest?.status === 'cancelled')
        return { bookingId, status: 'cancelled', alreadyCancelled: true };
      throw new BusinessError(
        'CAR_BOOKING_CANCELLATION_CONFLICT',
        'Cars booking status changed while cancellation was processing.',
      );
    }

    const idempotencyKey = `cars-booking-cancelled:${bookingId}`;
    const payload = {
      bookingId,
      bookingType: 'CAR',
      userId,
      reason: cancellationReason,
      cancellationFee: 0,
      refundAmount,
    };
    await this.outboxWriter.writeSafe({
      idempotencyKey,
      eventType: 'booking.cancelled',
      aggregateType: 'Booking',
      aggregateId: bookingId,
      payload,
    });
    await this.notifications
      .notifyDirect({
        idempotencyKey,
        eventType: 'booking.cancelled',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload,
      })
      .catch(() => null);
    return {
      bookingId,
      status: 'cancelled',
      cancellationFee: 0,
      refundAmount,
    };
  }
}
