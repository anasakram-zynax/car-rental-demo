import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { RoleStorePort } from '../ports/role-store.port';
import type { PermissionStorePort } from '../ports/permission-store.port';
import type { RoleEntity, RoleWithPermissions } from '../../domain/role.entity';
import { PERMISSION_STORE } from './permission.service';
import { AuditLogService } from './audit-log.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';

export const ROLE_STORE = Symbol('ROLE_STORE');

@Injectable()
export class RoleService {
  constructor(
    @Inject(ROLE_STORE) private readonly store: RoleStorePort,
    @Inject(PERMISSION_STORE) private readonly permissionStore: PermissionStorePort,
    private readonly auditLog: AuditLogService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(): Promise<RoleEntity[]> {
    return this.store.findAll();
  }

  async findById(id: string): Promise<RoleWithPermissions> {
    const role = await this.store.findById(id);
    if (!role) throw new BusinessError('ROLE_NOT_FOUND');
    return role;
  }

  async create(data: {
    name: string; description?: string; isDefault?: boolean; isProtected?: boolean;
    priority?: number; permissionIds?: string[];
  }, actorId?: string, ip?: string, ua?: string) {
    const existing = await this.store.findByName(data.name);
    if (existing) throw new BusinessError('ROLE_ALREADY_EXISTS', `Role "${data.name}" already exists`);

    const { permissionIds: _discard, ...createData } = data;
    const role = await this.store.create({ ...createData, createdById: actorId });
    if (data.permissionIds?.length) {
      const permissionIds = await this.resolvePermissionIds(data.permissionIds);
      await this.store.setPermissions(role.id, permissionIds);
    }

    const created = await this.store.findById(role.id);
    if (!created) throw new BusinessError('ROLE_NOT_FOUND', 'Role not found after creation');

    await this.auditLog.log({
      userId: actorId, action: 'CREATE', entity: 'Role', entityId: role.id,
      description: `Created role "${role.name}"`,
      newValue: { name: role.name, isProtected: role.isProtected } as any,
      ipAddress: ip, userAgent: ua,
    });

    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: role.id,
      payload: { roleId: role.id, roleName: role.name, action: 'created', userId: actorId },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: role.id,
      payload: { roleId: role.id, roleName: role.name, action: 'created', userId: actorId },
    }).catch(() => {});

    return created;
  }

  async update(id: string, data: {
    name?: string; description?: string; isDefault?: boolean; isProtected?: boolean;
    priority?: number; permissionIds?: string[];
  }, actorId?: string, actorRoleName?: string, ip?: string, ua?: string) {
    // Fetch role + resolve permissions in parallel
    const [before, resolvedPermissionIds] = await Promise.all([
      this.findById(id),
      data.permissionIds !== undefined
        ? this.resolvePermissionIds(data.permissionIds)
        : Promise.resolve(undefined),
    ]);

    if (before.isProtected && actorRoleName !== 'super_admin') {
      throw new BusinessError('ROLE_PROTECTED', 'Protected roles can only be modified by Super Admin');
    }

    // Apply permission changes + role update in parallel (independent DB writes)
    const { permissionIds: _, ...updateData } = data;
    await Promise.all([
      resolvedPermissionIds !== undefined
        ? this.store.setPermissions(id, resolvedPermissionIds)
        : Promise.resolve(),
      this.store.update(id, { ...updateData, updatedById: actorId }),
    ]);

    const after = await this.store.findById(id);
    if (!after) throw new BusinessError('ROLE_NOT_FOUND', 'Role not found after update');

    // Fire audit log + outbox writes in parallel (independent, non-blocking)
    const auditPromise = this.auditLog.logChange({
      userId: actorId, action: 'UPDATE', entity: 'Role', entityId: id,
      description: `Updated role "${after.name}"`,
      oldValue: { name: before.name, description: before.description, isProtected: before.isProtected } as any,
      newValue: { name: after.name, description: after.description, isProtected: after.isProtected } as any,
      ipAddress: ip, userAgent: ua,
    });

    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: id,
      payload: { roleId: id, roleName: after.name, action: 'updated', userId: actorId },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: id,
      payload: { roleId: id, roleName: after.name, action: 'updated', userId: actorId },
    }).catch(() => {});

    if (data.permissionIds !== undefined) {
      const eventId = randomUUID();
      this.outboxWriter.writeSafe({
        idempotencyKey: eventId,
        eventType: 'role.permission_changed',
        aggregateType: 'Role',
        aggregateId: id,
        payload: { roleId: id, roleName: after.name, userId: actorId },
      });
      this.notifications.notifyDirect({
        idempotencyKey: eventId,
        eventType: 'role.permission_changed',
        aggregateType: 'Role',
        aggregateId: id,
        payload: { roleId: id, roleName: after.name, userId: actorId },
      }).catch(() => {});
    }

    await auditPromise;
    return after;
  }

  async getUserCount(id: string): Promise<number> {
    return this.store.countUsersByRoleId(id);
  }

  async delete(id: string, actorId?: string, actorRoleName?: string, ip?: string, ua?: string): Promise<void> {
    const role = await this.findById(id);

    if (role.isProtected && actorRoleName !== 'super_admin') {
      throw new BusinessError('ROLE_PROTECTED', 'Protected roles can only be deleted by Super Admin');
    }

    const userCount = await this.store.countUsersByRoleId(id);
    if (userCount > 0) {
      throw new BusinessError('ROLE_HAS_USERS', `Cannot delete role "${role.name}": ${userCount} user(s) are assigned to it. Reassign them first.`);
    }

    await this.store.delete(id);

    await this.auditLog.log({
      userId: actorId, action: 'DELETE', entity: 'Role', entityId: id,
      description: `Deleted role "${role.name}"`,
      ipAddress: ip, userAgent: ua,
    });

    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: id,
      payload: { roleId: id, roleName: role.name, action: 'deleted', userId: actorId },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'role.updated',
      aggregateType: 'Role',
      aggregateId: id,
      payload: { roleId: id, roleName: role.name, action: 'deleted', userId: actorId },
    }).catch(() => {});
  }

  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    const permissions = await this.permissionStore.findByCodes(codes);
    const foundCodes = new Set(permissions.map((p) => p.code));
    const missing = codes.filter((c) => !foundCodes.has(c));
    if (missing.length) {
      throw new BusinessError('ROLE_PERMISSIONS_NOT_FOUND', `Permissions not found: ${missing.join(', ')}`);
    }
    return permissions.map((p) => p.id);
  }
}
