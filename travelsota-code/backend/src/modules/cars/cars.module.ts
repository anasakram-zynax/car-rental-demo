import { Module } from '@nestjs/common';
import { CarBookingRepositoryPortToken } from './application/ports/car-booking-repository.port';
import { CarFleetRepositoryPortToken } from './application/ports/car-fleet-repository.port';
import { PrismaCarBookingRepository } from './infrastructure/repositories/prisma-car-booking.repository';
import { PrismaCarFleetRepository } from './infrastructure/repositories/prisma-car-fleet.repository';
import { CarsService } from './application/services/cars.service';
import { CarsAdminController } from './api/cars-admin.controller';
import { CarsPublicController } from './api/cars-public.controller';
import { CarLocationRepositoryPortToken } from './application/ports/car-location-repository.port';
import { CarTransferPackageRepositoryPortToken } from './application/ports/car-transfer-package-repository.port';
import { PrismaCarLocationRepository } from './infrastructure/repositories/prisma-car-location.repository';
import { PrismaCarTransferPackageRepository } from './infrastructure/repositories/prisma-car-transfer-package.repository';
import { PaymentsModule } from '../payment/payments.module';
import { CarCheckoutService } from './application/services/car-checkout.service';
import { CarPaymentListener } from './application/services/car-payment.listener';
import { CarCancellationService } from './application/services/car-cancellation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PaymentsModule, NotificationsModule, SettingsModule],
  controllers: [CarsAdminController, CarsPublicController],
  providers: [
    CarsService,
    CarCheckoutService,
    CarPaymentListener,
    CarCancellationService,
    {
      provide: CarFleetRepositoryPortToken,
      useClass: PrismaCarFleetRepository,
    },
    {
      provide: CarBookingRepositoryPortToken,
      useClass: PrismaCarBookingRepository,
    },
    {
      provide: CarLocationRepositoryPortToken,
      useClass: PrismaCarLocationRepository,
    },
    {
      provide: CarTransferPackageRepositoryPortToken,
      useClass: PrismaCarTransferPackageRepository,
    },
  ],
  exports: [
    CarsService,
    CarFleetRepositoryPortToken,
    CarBookingRepositoryPortToken,
    CarLocationRepositoryPortToken,
    CarTransferPackageRepositoryPortToken,
  ],
})
export class CarsModule {}
