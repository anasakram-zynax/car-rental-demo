import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AccessControlModule } from '../access-control/access-control.module';
import { MarkupModule } from '../markup/markup.module';
import { WalletModule } from '../wallet/wallet.module';
import { RefundModule } from '../refund/refund.module';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';
import { PaymentsModule } from '../payment/payments.module';
import { EventDispatcherService } from '../../shared/outbox/application/event-dispatcher.service';
import { AgentBookingService } from './agent-booking.service';
import { AgentBookingsController } from './agent-booking.controller';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AccessControlModule,
    MarkupModule,
    WalletModule,
    RefundModule,
    FlightsModule,
    HotelsModule,
    PaymentsModule,
    CurrencyModule,
  ],
  controllers: [AgentBookingsController],
  providers: [AgentBookingService],
  exports: [AgentBookingService],
})
export class AgentBookingModule implements OnModuleInit {
  private readonly logger = new Logger(AgentBookingModule.name);

  constructor(
    private readonly bookingService: AgentBookingService,
    private readonly prisma: PrismaService,
    private readonly dispatcher: EventDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register('payment.succeeded', async (event) => {
      const payload = event.payload;
      const { bookingId, bookingType } = payload;

      // Hotel bookings: update status to confirmed (flight bookings handled by FlightPaymentListener)
      if (bookingType === 'HOTEL' || bookingType === 'hotel') {
        const booking = await this.prisma.hotelBooking.findUnique({
          where: { id: bookingId },
          select: { status: true },
        });
        if (booking && booking.status === 'pending') {
          await this.prisma.hotelBooking.update({
            where: { id: bookingId },
            data: {
              status: 'confirmed',
              message: 'Payment confirmed — booking confirmed.',
            },
          });
          this.logger.log(
            `Hotel booking ${bookingId} confirmed via payment.succeeded`,
          );
        }
      } else if (bookingType === 'FLIGHT' || bookingType === 'flight') {
        // Flight bookings are handled by FlightPaymentListener which calls the Travelport workflow.
        // Do NOT shortcut to 'confirmed' here — let the supplier workflow manage the status.
        this.logger.log(
          `Flight booking ${bookingId} payment succeeded — awaiting supplier workflow via FlightPaymentListener`,
        );
      }
    });

    // booking.supplier_confirmed: Deduct wallet AFTER supplier workflow succeeds
    // Only agent wallet bookings have a wallet hold — customer bookings are a no-op.
    this.dispatcher.register('booking.supplier_confirmed', async (event) => {
      const payload = event.payload as {
        bookingId: string;
        bookingType: string;
        ticketNumbers?: string[];
        locatorCode?: string;
      };

      try {
        await this.bookingService.finalizeSupplierConfirmedBooking(payload.bookingId);
      } catch (error: any) {
        this.logger.error(
          `Agent booking finalization failed for booking ${payload.bookingId}:${error?.message ?? error}`,
        );
        // Don't rethrow — the booking is already confirmed with the supplier.
        // The pending hold will be picked up by reconciliation or manual review.
        
      }
    });

    this.logger.log(
      'AgentBookingModule initialized — payment.succeeded + booking.supplier_confirmed handlers + hold cleanup cron registered',
    );
  }
}
