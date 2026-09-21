import { Module } from '@nestjs/common';
import { AdminCarBookingsController } from './api/admin-car-bookings.controller.js';
import { CarBookingsController } from './api/car-bookings.controller.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CreateBookingUseCase } from './application/use-cases/create-booking.use-case.js';
import { PrismaCarBookingRepository } from './infrastructure/persistance/prisma-car-booking.repository.js';
import { CAR_BOOKING_REPOSITORY } from './infrastructure/car-booking-repository.token.js';
import { CatalogCarLookupAdapter } from './infrastructure/catalog-car-lookup.adapter.js';
import { CAR_LOOKUP } from './infrastructure/car-lookup.token.js';
import { GetBookingUseCase } from './application/use-cases/get-booking.use-case.js';
import { CancelBookingUseCase } from './application/use-cases/cancel-booking.use-case.js';
import { ListBookingsUseCase } from './application/use-cases/list-bookings.use-case.js';
import { UpdatePaymentStatusUseCase } from './application/use-cases/update-payment-status.use-case.js';

@Module({
  imports: [CatalogModule],
  providers: [
    CreateBookingUseCase,
    GetBookingUseCase,
    CancelBookingUseCase,
    ListBookingsUseCase,
    UpdatePaymentStatusUseCase,

    PrismaCarBookingRepository,
    {
      provide: CAR_BOOKING_REPOSITORY,
      useExisting: PrismaCarBookingRepository,
    },
    CatalogCarLookupAdapter,
    {
      provide: CAR_LOOKUP,
      useExisting: CatalogCarLookupAdapter,
    },
  ],
  controllers: [AdminCarBookingsController, CarBookingsController],
})
export class BookingsModule {}
