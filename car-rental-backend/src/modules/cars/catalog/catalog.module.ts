import { Module } from '@nestjs/common';
import { AdminCarsController } from './api/admin-cars.controller.js';
import { PublicCarsController } from './api/public-cars.controller.js';

@Module({
  controllers: [AdminCarsController, PublicCarsController],
})
export class CatalogModule {}
