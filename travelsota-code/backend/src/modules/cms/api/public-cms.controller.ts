import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { CmsPublicService } from '../application/services/cms-public.service';
import { PublicCacheInterceptor } from '../../../shared/cache/public-cache.interceptor';

@Controller('cms')
@UseInterceptors(PublicCacheInterceptor)
export class PublicCmsController {
  constructor(private readonly publicService: CmsPublicService) {}

  @Get('pages/:slug')
  @ResponseMessage('CMS page retrieved.')
  async getPage(@Param('slug') slug: string, @Query('lang') lang?: string) {
    return this.publicService.getPageBySlug(slug, lang);
  }

  @Get('menus/:position')
  @ResponseMessage('CMS menu retrieved.')
  async getMenu(@Param('position') position: 'HEADER' | 'FOOTER' | 'BOTH') {
    if (!['HEADER', 'FOOTER', 'BOTH'].includes(position)) {
      return [];
    }
    return this.publicService.getMenuTree(position);
  }

  @Get('footer')
  @ResponseMessage('CMS footer retrieved.')
  async getFooter() {
    return this.publicService.getFooter();
  }
}
