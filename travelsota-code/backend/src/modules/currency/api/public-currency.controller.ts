import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CurrencyService } from '../application/services/currency.service';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PublicCacheInterceptor } from '../../../shared/cache/public-cache.interceptor';

@Controller('currencies')
@UseInterceptors(PublicCacheInterceptor)
export class PublicCurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @ResponseMessage('Active currencies retrieved.')
  async listActive() {
    return this.currencyService.listActive();
  }
}
