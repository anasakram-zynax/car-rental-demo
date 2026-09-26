import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { RoleStorePort } from '../application/ports/role-store.port';
import type { RoleEntity, RoleWithPermissions } from '../domain/role.entity';

@Injectable()
export class DbRoleStore implements RoleStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<RoleEntity[]> {
    const roles = await this.prisma.role.findMany({ orderBy: { priority: 'desc' } });
    return roles.map(this.toEntity);
  }

  async findById(id: string): Promise<RoleWithPermissions | null> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) return null;
    return { ...this.toEntity(role), permissions: role.permissions.map((rp) => rp.permission.code) };
  }

  async findByName(name: string): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findUnique({ where: { name } });
    return role ? this.toEntity(role) : null;
  }

  async findDefault(): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findFirst({ where: { isDefault: true } });
    return role ? this.toEntity(role) : null;
  }

  async create(data: { name: string; description?: string; isDefault?: boolean; isProtected?: boolean; priority?: number; createdById?: string }): Promise<RoleEntity> {
    const role = await this.prisma.role.create({ data });
    return this.toEntity(role);
  }

  async update(id: string, data: { name?: string; description?: string; isDefault?: boolean; isProtected?: boolean; priority?: number; updatedById?: string }): Promise<RoleEntity> {
    const role = await this.prisma.role.update({ where: { id }, data });
    return this.toEntity(role);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }

  async countUsersByRoleId(roleId: string): Promise<number> {
    return this.prisma.user.count({ where: { roleId, deletedAt: null } });
  }

  async setPermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
          skipDuplicates: true,
        });
      }
    }, { timeout: 15000 });
  }

  private toEntity(role: any): RoleEntity {
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      isDefault: role.isDefault,
      isProtected: role.isProtected,
      priority: role.priority,
      createdById: role.createdById ?? null,
      updatedById: role.updatedById ?? null,
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }
}
