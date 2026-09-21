import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchCarsUseCase } from '../application/use-cases/search-cars.use-case.js';
import { SearchCarsDto } from './dto/search-cars.dto.js';
import { GetPublicCarUseCase } from '../application/use-cases/get-public-car.use-case.js';

@Controller('cars')
export class PublicCarsController {
  constructor(
    private readonly searchCars: SearchCarsUseCase,
    private readonly getCar: GetPublicCarUseCase,
  ) {}

  @Get()
  search(@Query() query: SearchCarsDto) {
    return this.searchCars.execute(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getCar.execute(id);
  }
}
