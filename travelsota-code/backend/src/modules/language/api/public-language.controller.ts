import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { LanguageService } from '../application/services/language.service';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PublicCacheInterceptor } from '../../../shared/cache/public-cache.interceptor';

@Controller('languages')
@UseInterceptors(PublicCacheInterceptor)
export class PublicLanguageController {
  constructor(private readonly languageService: LanguageService) {}

  @Get()
  @ResponseMessage('Active languages retrieved.')
  async listActive() {
    return this.languageService.listActive();
  }
}
