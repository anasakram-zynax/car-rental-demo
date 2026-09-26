import { Controller, Get, Param, Query } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { BlogPublicService } from '../application/services/blog-public.service';

@Controller('blog')
export class PublicBlogController {
  constructor(private readonly publicService: BlogPublicService) {}

  @Get('posts')
  @ResponseMessage('Blog posts retrieved.')
  async list(
    @Query('categorySlug') categorySlug?: string,
    @Query('q') q?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.publicService.listPublished({
      categorySlug,
      q,
      sort,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('posts/:slug')
  @ResponseMessage('Blog post retrieved.')
  async get(@Param('slug') slug: string) {
    return this.publicService.getPublishedBySlug(slug);
  }

  @Get('categories')
  @ResponseMessage('Blog categories retrieved.')
  async categories() {
    return this.publicService.listCategories();
  }
}
