import { Controller, Get } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { SiteSettingsService } from '../application/services/site-settings.service';

@Controller('site-settings')
export class PublicSiteSettingsController {
  constructor(private readonly service: SiteSettingsService) {}

  @Get()
  @ResponseMessage('Site settings retrieved.')
  async get() {
    return this.service.getSettings();
  }
}
