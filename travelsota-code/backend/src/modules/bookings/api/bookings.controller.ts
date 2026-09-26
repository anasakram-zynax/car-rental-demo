import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RateLimitTier } from '../../../shared/rate-limit/rate-limit-tier.decorator';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import type { FlightBookingRepoPort } from '../../flights/application/ports/flight-booking-repo.port';
import { FlightBookingRepoPortToken } from '../../flights/application/ports/flight-booking-repo.port';
import type { HotelBookingRepoPort } from '../../hotels/application/ports/hotel-booking-repo.port';
import { HotelBookingRepoPortToken } from '../../hotels/application/ports/hotel-booking-repo.port';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PaymentRepository } from '../../payment/domain/repositories/payment.repository';
import {
  isBookingSuccess,
  isBookingFailure,
  isBookingTerminal,
  isBookingPending,
} from '../../../shared/booking/booking-state-machine';
import { BusinessError } from '../../../shared/errors/business-error';

/**
 * Unified booking controller — works for both flight and hotel bookings.
 *
 * The frontend uses these endpoints to display booking status and details
 * regardless of the booking type. The controller auto-detects the booking
 * type by checking both repos.
 */
@Controller('bookings')
@RateLimitTier({ tier: 'customer' })
export class BookingsController {
  private readonly logger = new Logger(BookingsController.name);

  constructor(
    @Inject(FlightBookingRepoPortToken)
    private readonly flightBookingRepo: FlightBookingRepoPort,
    @Inject(HotelBookingRepoPortToken)
    private readonly hotelBookingRepo: HotelBookingRepoPort,
    private readonly prisma: PrismaService,
    private readonly paymentRepository: PaymentRepository,
  ) {}

  /** Latest payment status + newest live invoice number for a booking. */
  private async paymentAndInvoice(bookingId: string): Promise<{
    paymentStatus: string | null;
    invoiceNumber: string | null;
  }> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      const invoice = await this.prisma.bookingDocument.findFirst({
        where: {
          bookingId,
          documentType: 'invoice',
          status: { notIn: ['cancelled', 'void'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });
      return {
        paymentStatus: payments?.[0]?.status ?? null,
        invoiceNumber: invoice?.invoiceNumber ?? null,
      };
    } catch {
      return { paymentStatus: null, invoiceNumber: null };
    }
  }

  /**
   * Ownership enforcement: customers can only access their own bookings.
   * Admins and agents can access any booking.
   * Guest bookings (userId == null) are accessible by anyone with the booking UUID.
   */
  private assertOwnership(
    booking: { userId?: string | null },
    user?: { id: string; userType: string },
  ) {
    if (!user) return;
    if (user.userType === 'CUSTOMER') {
      if (booking.userId && booking.userId !== user.id) {
        throw new BusinessError(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'You do not have access to this booking.',
          403,
        );
      }
    }
  }

  /**
   * Unified booking status endpoint.
   *
   * Works for both flight and hotel bookings. Auto-detects the booking type
   * by checking both repos. Returns a normalized status response that the
   * frontend can render regardless of booking type.
   *
   * Response shape:
   * {
   *   bookingId: string,
   *   type: 'flight' | 'hotel',
   *   status: string,
   *   statusLabel: string,
   *   isTerminal: boolean,
   *   isFailure: boolean,
   *   isPending: boolean,
   *   ...booking-specific fields
   * }
   */
  @Get(':id/status')
  @UserTypes('public')
  @ResponseMessage('Booking status fetched.')
  async getBookingStatus(@Param('id') id: string, @CurrentUser() user?: any) {
    // Independent PK lookups — parallel. (Polled by the success page.)
    const [flightBooking, hotelBooking] = await Promise.all([
      this.flightBookingRepo.findById(id),
      this.hotelBookingRepo.findById(id),
    ]);
    if (flightBooking) {
      this.assertOwnership(flightBooking, user);
      return this.buildFlightStatusResponse(flightBooking);
    }

    if (hotelBooking) {
      this.assertOwnership(hotelBooking, user);
      return this.buildHotelStatusResponse(hotelBooking);
    }

    return null;
  }

  private async buildFlightStatusResponse(booking: any) {
    const status = booking.status ?? 'unknown';
    const { paymentStatus, invoiceNumber } = await this.paymentAndInvoice(booking.id);
    return {
      bookingId: booking.id,
      type: 'flight',
      status,
      statusLabel: this.flightStatusLabel(status),
      isTerminal: isBookingTerminal(status),
      isFailure: isBookingFailure(status),
      isPending: isBookingPending(status),
      isBooked: isBookingSuccess(status),
      paymentStatus,
      invoiceNumber,
      provider: booking.provider ?? 'travelport',
      reference: booking.locatorCode ?? booking.confirmationNumber ?? null,
      itinerary: {
        from: booking.from,
        to: booking.to,
        departureDate: booking.departureDate,
        returnDate: booking.returnDate,
      },
      pricing: {
        totalAmount: booking.totalAmount,
        currency: booking.currency,
      },
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  private async buildHotelStatusResponse(booking: any) {
    const status = booking.status ?? 'unknown';
    const { paymentStatus, invoiceNumber } = await this.paymentAndInvoice(booking.id);
    return {
      bookingId: booking.id,
      type: 'hotel',
      status,
      statusLabel: this.hotelStatusLabel(status),
      isTerminal: isBookingTerminal(status),
      isFailure: isBookingFailure(status),
      isPending: isBookingPending(status),
      isBooked: isBookingSuccess(status),
      paymentStatus,
      invoiceNumber,
      provider: booking.provider ?? 'unknown',
      reference: booking.supplierReference ?? booking.hotelbedsRef ?? null,
      hotelConfirmationNumber: booking.hotelConfirmationNumber ?? null,
      hotel: booking.hotelSnapshot ?? null,
      pricing: {
        totalAmount: booking.customerAmount ?? booking.amount,
        currency: booking.customerCurrency ?? booking.currency,
      },
      message: booking.message ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }

  // Travelport settles a booking as 'held', Duffel/default as 'ticketed',
  // ATS/hotel as 'booked' — internal statuses are unchanged (business logic
  // still keys off them), but every dashboard shows one label, "Confirmed",
  // for any of them.
  private flightStatusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'Awaiting Payment';
      case 'payment_processing':
        return 'Processing Payment';
      case 'booking_in_progress':
        return 'Booking in Progress';
      case 'awaiting_issue':
        return 'Payment Received — Issuing Soon';
      case 'held':
        return 'Confirmed';
      case 'booked':
        return 'Confirmed';
      case 'ticketed':
        return 'Confirmed';
      case 'cancelled':
        return 'Cancelled';
      case 'failed':
        return 'Booking Failed';
      case 'failed_supplier_booking':
        return 'Supplier Booking Failed';
      case 'refund_pending':
        return 'Refund Pending';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  }

  private hotelStatusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'Awaiting Payment';
      case 'payment_processing':
        return 'Processing Payment';
      case 'booking_in_progress':
        return 'Booking in Progress';
      case 'awaiting_issue':
        return 'Payment Received — Issuing Soon';
      case 'held':
        return 'Reservation Held';
      case 'booked':
        return 'Booking Confirmed';
      case 'cancelled':
        return 'Cancelled';
      case 'cancellation_requested':
        return 'Cancellation Requested';
      case 'failed':
        return 'Booking Failed';
      case 'failed_supplier_booking':
        return 'Supplier Booking Failed';
      case 'failed_payment':
        return 'Payment Failed';
      case 'refund_pending':
        return 'Refund Pending';
      case 'refunded':
        return 'Refunded';
      default:
        return status;
    }
  }
}
