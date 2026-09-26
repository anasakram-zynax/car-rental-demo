import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MarkupModule } from '../markup/markup.module';
import { NotificationsModule } from '../notifications/notifications.module';

// Stores
import { DbRoleStore } from './infrastructure/db-role.store';
import { DbPermissionStore } from './infrastructure/db-permission.store';
import { DbUserStore } from './infrastructure/db-user.store';
import { DbAgentProfileStore } from './infrastructure/db-agent-profile.store';
import { DbAuditLogStore } from './infrastructure/db-audit-log.store';

// Services
import { RoleService, ROLE_STORE } from './application/services/role.service';
import { PermissionService, PERMISSION_STORE } from './application/services/permission.service';
import { UserManagementService, USER_STORE } from './application/services/user-management.service';
import { AgentProfileService, AGENT_PROFILE_STORE } from './application/services/agent-profile.service';
import { AuditLogService, AUDIT_LOG_STORE } from './application/services/audit-log.service';
import { PermissionCheckService } from './application/services/permission-check.service';
import { AccessControlSeedService } from './application/services/access-control-seed.service';
import { SubAgentService } from './application/services/sub-agent.service';

// Controllers
import { RoleController } from './api/controllers/role.controller';
import { PermissionController } from './api/controllers/permission.controller';
import { UserManagementController } from './api/controllers/user-management.controller';
import { AgentController } from './api/controllers/agent.controller';
import { AuditLogController } from './api/controllers/audit-log.controller';
import { AgentTeamController } from './api/controllers/agent-team.controller';

// Guards
import { PermissionGuard } from './api/guards/permission.guard';

@Module({
  imports: [PrismaModule, MarkupModule, NotificationsModule],
  controllers: [
    RoleController,
    PermissionController,
    UserManagementController,
    AgentController,
    AuditLogController,
    AgentTeamController,
  ],
  providers: [
    // Stores
    DbRoleStore,
    DbPermissionStore,
    DbUserStore,
    DbAgentProfileStore,
    DbAuditLogStore,

    // Store injection tokens
    { provide: ROLE_STORE, useExisting: DbRoleStore },
    { provide: PERMISSION_STORE, useExisting: DbPermissionStore },
    { provide: USER_STORE, useExisting: DbUserStore },
    { provide: AGENT_PROFILE_STORE, useExisting: DbAgentProfileStore },
    { provide: AUDIT_LOG_STORE, useExisting: DbAuditLogStore },

    // Services
    RoleService,
    PermissionService,
    UserManagementService,
    AgentProfileService,
    AuditLogService,
    PermissionCheckService,
    AccessControlSeedService,
    SubAgentService,

    // Global guard
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [
    RoleService,
    PermissionService,
    UserManagementService,
    AgentProfileService,
    AuditLogService,
    PermissionCheckService,
    SubAgentService,
    ROLE_STORE,
    USER_STORE,
    PERMISSION_STORE,
    AGENT_PROFILE_STORE,
    AUDIT_LOG_STORE,
  ],
})
export class AccessControlModule {}
