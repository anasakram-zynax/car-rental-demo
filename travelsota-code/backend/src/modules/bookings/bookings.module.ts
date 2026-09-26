import { Module } from '@nestjs/common';
import { BookingsController } from './api/bookings.controller';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';
import { PrismaModule } from '../../shared/database/prisma.module';
import { PaymentsModule } from '../payment/payments.module';

/**
 * Unified bookings module — provides the cross-cutting booking status endpoint
 * that works for both flight and hotel bookings.
 */
@Module({
  imports: [FlightsModule, HotelsModule, PrismaModule, PaymentsModule],
  controllers: [BookingsController],
})
export class BookingsModule {}
