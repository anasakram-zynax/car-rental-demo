import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { ManualHotelsService } from '../application/services/manual-hotels.service';

@Controller('hotels')
export class ManualHotelsPublicController {
  constructor(private readonly service: ManualHotelsService) {}

  @Get('featured')
  @ResponseMessage('Featured manual hotels.')
  async getFeatured() {
    return this.service.getFeatured();
  }
}
