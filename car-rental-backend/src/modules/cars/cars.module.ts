import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module.js';
import { BookingsModule } from './bookings/bookings.module.js';

@Module({
  imports: [CatalogModule, BookingsModule]
})
export class CarsModule {}
