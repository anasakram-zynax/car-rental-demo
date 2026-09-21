import { Module } from '@nestjs/common';
import { AdminCarsController } from './api/admin-cars.controller.js';
import { PublicCarsController } from './api/public-cars.controller.js';
import { CreateCarUseCase } from './application/use-cases/create-car.use-case.js';
import { GetCarUseCase } from './application/use-cases/get-car.use-case.js';
import { UpdateCarUseCase } from './application/use-cases/update-car.use-case.js';
import { RemoveCarUseCase } from './application/use-cases/remove-car.use-case.js';
import { PrismaCarRepository } from './infrastructure/persistance/prisma-car.repository.js';
import { CAR_REPOSITORY } from './infrastructure/car-repository.token.js';
import { SearchCarsUseCase } from './application/use-cases/search-cars.use-case.js';
import { GetPublicCarUseCase } from './application/use-cases/get-public-car.use-case.js';

@Module({
  controllers: [AdminCarsController, PublicCarsController],
  providers: [
    CreateCarUseCase,
    GetCarUseCase,
    UpdateCarUseCase,
    RemoveCarUseCase,
    SearchCarsUseCase,
    GetPublicCarUseCase,
    PrismaCarRepository,
    {
      provide: CAR_REPOSITORY,
      useExisting: PrismaCarRepository,
    },
  ],
  exports:[CAR_REPOSITORY]
})
export class CatalogModule {}
