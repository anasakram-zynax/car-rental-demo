import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { MarkupModule } from '../markup/markup.module';
import { AgentPanelController } from './api/agent-panel.controller';
import { AgentDashboardController } from './api/agent-dashboard.controller';

@Module({
  imports: [PrismaModule, AccessControlModule, MarkupModule],
  controllers: [AgentPanelController, AgentDashboardController],
})
export class AgentPanelModule {}
