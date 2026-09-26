import { Module } from '@nestjs/common';
import { AdminDashboardController } from './api/admin-dashboard.controller';
import { AdminBookingsController } from './api/admin-bookings.controller';
import { DashboardService } from './application/services/dashboard.service';
import { AdminBookingsService } from './application/services/admin-bookings.service';
import { HotelsModule } from '../hotels/hotels.module';
import { FlightsModule } from '../flights/flights.module';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [HotelsModule, FlightsModule, CurrencyModule],
  controllers: [AdminDashboardController, AdminBookingsController],
  providers: [DashboardService, AdminBookingsService],
})
export class DashboardModule {}
