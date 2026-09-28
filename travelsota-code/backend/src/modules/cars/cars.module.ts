import { Module } from '@nestjs/common';
import { CarBookingRepositoryPortToken } from './application/ports/car-booking-repository.port';
import { CarFleetRepositoryPortToken } from './application/ports/car-fleet-repository.port';
import { PrismaCarBookingRepository } from './infrastructure/repositories/prisma-car-booking.repository';
import { PrismaCarFleetRepository } from './infrastructure/repositories/prisma-car-fleet.repository';

@Module({
  providers: [
    {
      provide: CarFleetRepositoryPortToken,
      useClass: PrismaCarFleetRepository,
    },
    {
      provide: CarBookingRepositoryPortToken,
      useClass: PrismaCarBookingRepository,
    },
  ],
  exports: [CarFleetRepositoryPortToken, CarBookingRepositoryPortToken],
})
export class CarsModule {}
