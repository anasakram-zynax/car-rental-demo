import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { FlightBookingRepoPortToken } from '../../../flights/application/ports/flight-booking-repo.port';
import type { FlightBookingRepoPort } from '../../../flights/application/ports/flight-booking-repo.port';
import { HotelBookingRepoPortToken } from '../../../hotels/application/ports/hotel-booking-repo.port';
import type { HotelBookingRepoPort } from '../../../hotels/application/ports/hotel-booking-repo.port';

type BookingType = 'FLIGHT' | 'HOTEL';

@Injectable()
export class BookingCancellationService {
  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly orchestrator: PaymentOrchestratorService,
    @Inject(FlightBookingRepoPortToken)
    private readonly flightBookingRepo: FlightBookingRepoPort,
    @Inject(HotelBookingRepoPortToken)
    private readonly hotelBookingRepo: HotelBookingRepoPort,
  ) {}

  async cancelBooking(bookingId: string, bookingType: BookingType, reason?: string) {
    const repo = bookingType === 'FLIGHT' ? this.flightBookingRepo : this.hotelBookingRepo;
    const booking = await repo.findById(bookingId);

    if (!booking) {
      throw new NotFoundException(`${bookingType} booking not found.`);
    }

    // Only allow cancellation for certain statuses
    const cancellableStatuses = ['pending_payment', 'held_pending_payment', 'booking_in_progress', 'booked', 'held', 'ticketed'];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BadRequestException({
        code: 'BOOKING_NOT_CANCELLABLE',
        message: `Booking cannot be cancelled in its current status: ${booking.status}.`,
      });
    }

    // Find the associated payment
    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];

    // Handle payment refund/cancellation
    if (payment) {
      if (payment.status === PaymentStatus.PAID) {
        // Refund the payment via gateway
        const gateway = this.orchestrator.getGateway(payment.gateway);
        if (gateway.refundPayment) {
          await gateway.refundPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.REFUNDED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
      } else if (payment.status === PaymentStatus.PENDING) {
        // Cancel the pending payment via gateway
        const gateway = this.orchestrator.getGateway(payment.gateway);
        if (gateway.cancelPayment) {
          await gateway.cancelPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.CANCELLED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
      }
    }

    // Update the booking status
    await repo.update(bookingId, {
      status: 'cancelled',
      message: reason ?? 'Cancelled by user.',
    });

    return {
      bookingId,
      bookingType,
      status: 'cancelled',
      paymentStatus: payment?.status ?? null,
      message: reason ?? 'Cancelled by user.',
    };
  }
}
