import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { CmsAdminService } from './application/services/cms-admin.service';
import { CmsPublicService } from './application/services/cms-public.service';
import { AdminCmsPagesController } from './api/admin-cms-pages.controller';
import { AdminCmsMenusController } from './api/admin-cms-menus.controller';
import { AdminCmsFooterCategoriesController } from './api/admin-cms-footer-categories.controller';
import { PublicCmsController } from './api/public-cms.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    AdminCmsPagesController,
    AdminCmsMenusController,
    AdminCmsFooterCategoriesController,
    PublicCmsController,
  ],
  providers: [CmsAdminService, CmsPublicService],
  exports: [CmsAdminService, CmsPublicService],
})
export class CmsModule {}
