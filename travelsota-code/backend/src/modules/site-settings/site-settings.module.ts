import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { SiteSettingsService } from './application/services/site-settings.service';
import { AdminSiteSettingsController } from './api/admin-site-settings.controller';
import { PublicSiteSettingsController } from './api/public-site-settings.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AdminSiteSettingsController, PublicSiteSettingsController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}
