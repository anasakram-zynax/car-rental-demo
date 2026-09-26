import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { ManualFlightsService } from '../application/services/manual-flights.service';

@Controller('flights')
export class ManualFlightsPublicController {
  constructor(private readonly service: ManualFlightsService) {}

  @Get('featured')
  @ResponseMessage('Featured manual flights.')
  async getFeatured() {
    return this.service.getFeatured();
  }
}
