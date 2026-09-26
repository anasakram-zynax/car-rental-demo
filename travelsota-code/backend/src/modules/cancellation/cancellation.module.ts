import { Module, forwardRef } from '@nestjs/common';
import { BookingCancellationService } from './application/services/booking-cancellation.service';
import { PaymentsModule } from '../payment/payments.module';
import { FlightsModule } from '../flights/flights.module';
import { HotelsModule } from '../hotels/hotels.module';

@Module({
  imports: [
    PaymentsModule,
    forwardRef(() => FlightsModule),
    forwardRef(() => HotelsModule),
  ],
  providers: [BookingCancellationService],
  exports: [BookingCancellationService],
})
export class CancellationModule {}
