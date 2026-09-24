import { Module } from '@nestjs/common';
import { ManageCarImagesUseCase } from './application/use-cases/manage-car-images.use-case.js';
import { CAR_IMAGE_REPOSITORY, CAR_IMAGE_STORAGE } from './application/ports/car-image.port.js';
import { CloudinaryImageStorage } from './infrastructure/cloudinary-image.storage.js';
import { PrismaCarImageRepository } from './infrastructure/persistance/prisma-car-image.repository.js';
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
import { ListAdminCarsUseCase } from './application/use-cases/list-admin-cars.use-case.js';
import { GetCarFilterOptionsUseCase } from './application/use-cases/get-car-filter-options.use-case.js';
import { SearchTransferLocationsUseCase } from './application/use-cases/search-transfer-locations.use-case.js';
import { GetCarFormOptionsUseCase } from './application/use-cases/get-car-form-options.use-case.js';

@Module({
  controllers: [AdminCarsController, PublicCarsController],
  providers: [
    ManageCarImagesUseCase,
    { provide: CAR_IMAGE_STORAGE, useClass: CloudinaryImageStorage },
    { provide: CAR_IMAGE_REPOSITORY, useClass: PrismaCarImageRepository },
    CreateCarUseCase,
    GetCarUseCase,
    UpdateCarUseCase,
    RemoveCarUseCase,
    SearchCarsUseCase,
    GetPublicCarUseCase,
    ListAdminCarsUseCase,
    GetCarFilterOptionsUseCase,
    SearchTransferLocationsUseCase,
    GetCarFormOptionsUseCase,
    PrismaCarRepository,
    {
      provide: CAR_REPOSITORY,
      useExisting: PrismaCarRepository,
    },
  ],
  exports: [CAR_REPOSITORY],
})
export class CatalogModule {}
