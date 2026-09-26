import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessError } from '../../../../shared/errors/business-error';
import * as bcrypt from 'bcrypt';
import type { UserStorePort } from '../ports/user-store.port';
import type { AgentProfileStorePort, AgentProfileFilters } from '../ports/agent-profile-store.port';
import type { UserEntity, UserDetail, UserWithRole, UserType } from '../../domain/user.entity';
import type { AgentProfileEntity, KycStatusType } from '../../domain/agent-profile.entity';
import { PermissionCheckService } from './permission-check.service';
import { AGENT_PROFILE_STORE } from './agent-profile.service';
import { RoleService, ROLE_STORE } from './role.service';
import type { RoleStorePort } from '../ports/role-store.port';
import { AuditLogService } from './audit-log.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';

export const USER_STORE = Symbol('USER_STORE');

@Injectable()
export class UserManagementService {
  constructor(
    @Inject(USER_STORE) private readonly store: UserStorePort,
    @Inject(AGENT_PROFILE_STORE) private readonly agentStore: AgentProfileStorePort,
    @Inject(ROLE_STORE) private readonly roleStore: RoleStorePort,
    private readonly permissionCheck: PermissionCheckService,
    private readonly auditLog: AuditLogService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(userTypes?: UserType[]): Promise<UserEntity[]> {
    if (userTypes && userTypes.length > 0) {
      return this.store.findByUserTypes(userTypes);
    }
    return this.store.findAll();
  }

  async findPaged(filters: {
    userTypes?: UserType[];
    search?: string;
    page?: number;
    limit?: number;
    sortBy?: 'email' | 'firstName' | 'createdAt' | 'lastLoginAt';
    sortDir?: 'asc' | 'desc';
  }): Promise<{ items: UserEntity[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 20), 100);
    const { items, total } = await this.store.findPaged({
      userTypes: filters.userTypes,
      search: filters.search?.trim() || undefined,
      page,
      limit,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findStaff(): Promise<UserEntity[]> {
    return this.store.findStaff();
  }

  async findById(id: string): Promise<UserDetail> {
    const user = await this.store.findById(id);
    if (!user) throw new BusinessError('USER_NOT_FOUND');
    return user;
  }

  async create(data: {
    email: string; password: string; firstName?: string; lastName?: string;
    phone?: string; userType?: UserType; roleId?: string;
  }, actorId?: string, ip?: string, ua?: string): Promise<UserDetail> {
    const existing = await this.store.findByEmail(data.email);
    if (existing) throw new BusinessError('USER_EMAIL_EXISTS');

    const resolvedType = data.userType ?? 'CUSTOMER';
    if (resolvedType === 'STAFF') {
      if (!data.roleId) {
        throw new BusinessError('ROLE_PERMISSIONS_NOT_FOUND', 'Role is required for staff users');
      }
    } else {
      data.roleId = undefined;
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.store.create({
      email: data.email, passwordHash, firstName: data.firstName, lastName: data.lastName,
      phone: data.phone, userType: resolvedType, roleId: data.roleId, createdById: actorId,
    });

    await this.auditLog.log({
      userId: actorId, action: 'CREATE', entity: 'User', entityId: user.id,
      description: `Created ${resolvedType} user ${user.email}`,
      newValue: { id: user.id, email: user.email, roleId: data.roleId, userType: resolvedType } as any,
      ipAddress: ip, userAgent: ua,
    });

    if (resolvedType === 'STAFF') {
      const eventId = randomUUID();
      this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'user.staff.created',
        aggregateType: 'User',
        aggregateId: user.id,
        payload: { userId: user.id, email: user.email, roleId: data.roleId, actorId },
      }).catch(() => {});
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'user.staff.created',
        aggregateType: 'User',
        aggregateId: user.id,
        payload: { userId: user.id, email: user.email, roleId: data.roleId, actorId },
      }).catch(() => {});
    }

    return user;
  }

  async update(id: string, data: {
    firstName?: string; lastName?: string; phone?: string; status?: string;
    userType?: UserType; roleId?: string;
  }, actorId?: string, actorRoleName?: string, ip?: string, ua?: string): Promise<UserDetail> {
    const before = await this.findById(id);

    if (before.roleName === 'super_admin' && data.status === 'INACTIVE' && actorRoleName !== 'super_admin') {
      throw new BusinessError('USER_CANNOT_DEACTIVATE_SUPER_ADMIN');
    }

    const resolvedType = data.userType ?? before.userType;
    if (resolvedType !== 'STAFF') {
      data.roleId = null as any;
    } else {
      const resolvedRoleId = data.roleId ?? before.roleId;
      if (!resolvedRoleId) {
        throw new BusinessError('ROLE_PERMISSIONS_NOT_FOUND', 'Role is required for staff users');
      }
      data.roleId = resolvedRoleId;
    }

    const after = await this.store.update(id, data);

    await this.auditLog.logChange({
      userId: actorId, action: 'UPDATE', entity: 'User', entityId: id,
      description: `Updated user ${after.email}`,
      oldValue: { firstName: before.firstName, lastName: before.lastName, phone: before.phone, status: before.status, roleId: before.roleId } as any,
      newValue: { firstName: after.firstName, lastName: after.lastName, phone: after.phone, status: after.status, roleId: after.roleId } as any,
      ipAddress: ip, userAgent: ua,
    });

    return after;
  }

  async softDelete(id: string, actorId?: string, actorRoleName?: string, ip?: string, ua?: string): Promise<void> {
    const user = await this.findById(id);
    if (user.roleName === 'super_admin' && actorRoleName !== 'super_admin') {
      throw new BusinessError('USER_CANNOT_DELETE_SUPER_ADMIN');
    }
    await this.store.update(id, { deletedAt: new Date() });

    await this.auditLog.log({
      userId: actorId, action: 'DELETE', entity: 'User', entityId: id,
      description: `Soft deleted user ${user.email}`,
      ipAddress: ip, userAgent: ua,
    });

    if (user.userType === 'STAFF') {
      const eventId = randomUUID();
      this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'user.staff.deleted',
        aggregateType: 'User',
        aggregateId: id,
        payload: { userId: id, email: user.email, actorId },
      }).catch(() => {});
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'user.staff.deleted',
        aggregateType: 'User',
        aggregateId: id,
        payload: { userId: id, email: user.email, actorId },
      }).catch(() => {});
    }
  }

  async getAgents(filters?: AgentProfileFilters): Promise<(UserDetail & { agentProfile: AgentProfileEntity | null })[]> {
    // Single join query in the store — no per-agent round trips, filters in DB.
    return this.store.findAgents(filters);
  }

  async getAgentDetail(userId: string): Promise<(UserDetail & { agentProfile: AgentProfileEntity | null }) | null> {
    const detail = await this.store.findById(userId);
    if (!detail || detail.userType !== 'AGENT') return null;
    const profile = await this.agentStore.findByUserId(userId);
    return { ...detail, agentProfile: profile };
  }

  /** Assign an existing Role to an AGENT user via User.roleId */
  async assignAgentRole(agentUserId: string, roleId: string, actorId?: string, ip?: string, ua?: string): Promise<UserDetail> {
    const detail = await this.store.findById(agentUserId);
    if (!detail || detail.userType !== 'AGENT') {
      throw new BusinessError('USER_NOT_FOUND', 'Agent user not found');
    }

    const role = await this.roleStore.findById(roleId);
    if (!role) {
      throw new BusinessError('ROLE_NOT_FOUND', 'Role not found');
    }

    const after = await this.store.update(agentUserId, { roleId });

    await this.auditLog.log({
      userId: actorId, action: 'UPDATE', entity: 'User', entityId: agentUserId,
      description: `Assigned role "${role.name}" to agent ${detail.email}`,
      newValue: { roleId, previousRoleId: detail.roleId } as any,
      ipAddress: ip, userAgent: ua,
    });

    return after;
  }

  /** Set AgentProfile.permissionOverrides (grant/revoke JSON) */
  async setAgentPermissionOverrides(agentUserId: string, overrides: { grant?: string[]; revoke?: string[] } | null, actorId?: string, ip?: string, ua?: string): Promise<void> {
    const detail = await this.store.findById(agentUserId);
    if (!detail || detail.userType !== 'AGENT') {
      throw new BusinessError('USER_NOT_FOUND', 'Agent user not found');
    }

    await this.agentStore.update(agentUserId, { permissionOverrides: overrides });

    await this.auditLog.log({
      userId: actorId, action: 'UPDATE', entity: 'AgentProfile', entityId: agentUserId,
      description: `Updated permission overrides for agent ${detail.email}`,
      newValue: { permissionOverrides: overrides } as any,
      ipAddress: ip, userAgent: ua,
    });
  }

  /** Get the resolved effective permissions for an agent user */
  async getAgentEffectivePermissions(agentUserId: string): Promise<{ roleName: string | null; rolePermissions: string[]; permissionOverrides: { grant?: string[]; revoke?: string[] } | null; effectivePermissions: string[] }> {
    const detail = await this.store.findById(agentUserId);
    if (!detail || detail.userType !== 'AGENT') {
      throw new BusinessError('USER_NOT_FOUND', 'Agent user not found');
    }

    const effectivePermissions = await this.permissionCheck.getEffectivePermissions(agentUserId);

    // Get role permissions separately for the diff view
    let rolePermissions: string[] = [];
    let permissionOverrides: { grant?: string[]; revoke?: string[] } | null = null;

    if (detail.roleId) {
      const role = await this.roleStore.findById(detail.roleId);
      if (role) {
        rolePermissions = role.permissions ?? [];
      }
    }

    // Fetch agent profile separately to read permissionOverrides
    const agentProfile = await this.agentStore.findByUserId(agentUserId);
    if (agentProfile?.permissionOverrides) {
      const raw = agentProfile.permissionOverrides as any;
      permissionOverrides = {
        grant: Array.isArray(raw.grant) ? raw.grant : [],
        revoke: Array.isArray(raw.revoke) ? raw.revoke : [],
      };
    }

    return {
      roleName: detail.roleName,
      rolePermissions,
      permissionOverrides,
      effectivePermissions,
    };
  }
}
