import { Module } from '@nestjs/common';
import { AdminCarBookingsController } from './api/admin-car-bookings.controller.js';
import { PublicCarBookingsController } from './api/car-bookings.controller.js';

@Module({
  controllers: [AdminCarBookingsController, PublicCarBookingsController],
})
export class BookingsModule {}
