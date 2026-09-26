import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { FlightBookingProvider, BookingProviderInput, BookingProviderResult, BookingCancelResult, VoidResult, RefundQuoteResult, RefundRequestResult } from '../application/ports/flight-booking-provider.interface';

function generateLocator(): string {
  return 'MF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

@Injectable()
export class ManualFlightBookingProvider implements FlightBookingProvider {
  readonly key = 'manual' as const;
  readonly capabilities = {
    supportsPrePaymentHold: false,
    supportsPostPaymentTicketing: false,
    supportsHoldCancellation: true,
    requiresInstantPayment: true,
  } as const;
  private readonly logger = new Logger(ManualFlightBookingProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async confirmBooking(input: BookingProviderInput): Promise<BookingProviderResult> {
    const flight = await this.prisma.manualFlight.findUnique({ where: { id: input.offerId } });
    if (!flight || flight.status !== 'active') {
      return { ok: false, message: 'Flight not available', failedStep: 'confirm' };
    }
    if (flight.availableSeats < 1) {
      return { ok: false, message: 'No seats available', failedStep: 'confirm' };
    }

    const locator = generateLocator();

    await this.prisma.manualFlight.update({
      where: { id: flight.id },
      data: { availableSeats: { decrement: 1 } },
    });

    return {
      ok: true,
      locatorCode: locator,
      supplierBookingId: locator,
      supplierStatus: 'confirmed',
    };
  }

  async cancelBooking?(input: { bookingId: string; supplierBookingId?: string; locatorCode?: string }): Promise<BookingCancelResult> {
    const flight = await this.prisma.manualFlight.findUnique({ where: { id: input.bookingId } });
    if (flight) {
      await this.prisma.manualFlight.update({
        where: { id: flight.id },
        data: { availableSeats: { increment: 1 } },
      });
    }
    return { ok: true, supplierStatus: 'cancelled' };
  }

  async voidTicket?(input: { bookingId: string; locatorCode?: string }): Promise<VoidResult> {
    return { ok: true, supplierStatus: 'voided' };
  }

  async quoteRefund?(input: { bookingId: string; locatorCode?: string }): Promise<RefundQuoteResult> {
    const flight = await this.prisma.manualFlight.findUnique({ where: { id: input.bookingId } });
    if (!flight) return { ok: false, refundable: false, message: 'Flight not found' };
    return {
      ok: true,
      refundable: flight.refundable,
      refundAmount: flight.basePrice,
      refundCurrency: flight.currency,
    };
  }

  async requestRefund?(input: { bookingId: string; locatorCode?: string }): Promise<RefundRequestResult> {
    const flight = await this.prisma.manualFlight.findUnique({ where: { id: input.bookingId } });
    if (flight) {
      await this.prisma.manualFlight.update({
        where: { id: flight.id },
        data: { availableSeats: { increment: 1 } },
      });
    }
    return { ok: true, supplierRefundId: `MF-REF-${Date.now()}`, supplierStatus: 'refunded' };
  }
}
