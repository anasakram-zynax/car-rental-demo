import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { BlogAdminService } from './application/services/blog-admin.service';
import { BlogPublicService } from './application/services/blog-public.service';
import { AdminBlogPostsController } from './api/admin-blog-posts.controller';
import { AdminBlogCategoriesController } from './api/admin-blog-categories.controller';
import { PublicBlogController } from './api/public-blog.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminBlogPostsController,
    AdminBlogCategoriesController,
    PublicBlogController,
  ],
  providers: [BlogAdminService, BlogPublicService],
  exports: [BlogAdminService, BlogPublicService],
})
export class BlogModule {}
