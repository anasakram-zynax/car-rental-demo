import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module.js';
import { CarsModule } from './modules/cars/cars.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SharedModule,
    CarsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
