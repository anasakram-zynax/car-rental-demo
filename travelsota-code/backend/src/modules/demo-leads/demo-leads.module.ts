import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../shared/database/prisma.module';
import { EmailModule } from '../email/email.module';
import { DemoRequestController } from './api/demo-request.controller';
import { AdminDemoLeadsController } from './api/admin-demo-leads.controller';
import { DemoSessionController } from './api/demo-session.controller';
import { DemoActivityInterceptor } from './api/demo-activity.interceptor';
import { AdminDemoSessionsController } from './api/admin-demo-sessions.controller';
import { DemoLeadsService } from './application/demo-leads.service';
import { DemoResetService } from './application/demo-reset.service';
import { DemoSessionService } from './application/demo-session.service';
import { DemoGeoService } from './application/demo-geo.service';
import { PrismaDemoLeadsRepository } from './infrastructure/prisma-demo-leads.repository';
import { PrismaDemoSessionsRepository } from './infrastructure/prisma-demo-sessions.repository';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [
    DemoRequestController,
    AdminDemoLeadsController,
    DemoSessionController,
    AdminDemoSessionsController,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: DemoActivityInterceptor },
    DemoLeadsService,
    DemoResetService,
    DemoSessionService,
    DemoGeoService,
    PrismaDemoLeadsRepository,
    PrismaDemoSessionsRepository,
  ],
  exports: [DemoLeadsService, DemoResetService, DemoSessionService],
})
export class DemoLeadsModule {}
