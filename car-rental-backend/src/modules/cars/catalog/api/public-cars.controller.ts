import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchCarsUseCase } from '../application/use-cases/search-cars.use-case.js';
import { SearchCarsDto } from './dto/search-cars.dto.js';
import { GetPublicCarUseCase } from '../application/use-cases/get-public-car.use-case.js';
import { GetCarFilterOptionsUseCase } from '../application/use-cases/get-car-filter-options.use-case.js';
import { SearchTransferLocationsUseCase } from '../application/use-cases/search-transfer-locations.use-case.js';
import {
  CarFilterOptionsDto,
  TransferDropoffLocationsDto,
  TransferPickupLocationsDto,
} from './dto/catalog-options.dto.js';

@Controller('cars')
export class PublicCarsController {
  constructor(
    private readonly searchCars: SearchCarsUseCase,
    private readonly getCar: GetPublicCarUseCase,
    private readonly getFilterOptions: GetCarFilterOptionsUseCase,
    private readonly searchTransferLocations: SearchTransferLocationsUseCase,
  ) {}

  @Get()
  search(@Query() query: SearchCarsDto) {
    return this.searchCars.execute(query);
  }

  @Get('filter-options')
  filterOptions(@Query() query: CarFilterOptionsDto) {
    return this.getFilterOptions.execute(query.serviceType);
  }

  @Get('transfer-locations/pickups')
  transferPickupLocations(@Query() query: TransferPickupLocationsDto) {
    return this.searchTransferLocations.pickups(query.search, query.limit);
  }

  @Get('transfer-locations/dropoffs')
  transferDropoffLocations(@Query() query: TransferDropoffLocationsDto) {
    return this.searchTransferLocations.dropoffs(
      query.pickupLocation,
      query.search,
      query.limit,
    );
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getCar.execute(id);
  }
}
