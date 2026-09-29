import { Controller, Get, Query } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CarsService } from '../application/services/cars.service';
import { CarSearchDto } from './dto/car-search.dto';
import {
  CarLocationSuggestionsDto,
  CarTransferDropoffsDto,
} from './dto/car-location-query.dto';

@Controller('cars')
export class CarsPublicController {
  constructor(private readonly carsService: CarsService) {}

  @Get('search')
  @ResponseMessage('Cars search results.')
  search(@Query() query: CarSearchDto) {
    return this.carsService.search(query);
  }

  @Get('locations/suggestions')
  @ResponseMessage('Cars location suggestions.')
  suggestLocations(@Query() query: CarLocationSuggestionsDto) {
    return this.carsService.suggestLocations(
      query.serviceType,
      query.q,
      query.limit,
    );
  }

  @Get('transfers/dropoffs')
  @ResponseMessage('Cars transfer drop-off locations.')
  transferDropoffs(@Query() query: CarTransferDropoffsDto) {
    return this.carsService.findTransferDropoffs(
      query.pickupLocationId,
      query.q,
    );
  }
}
