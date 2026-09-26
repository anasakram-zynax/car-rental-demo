import type { RoleEntity, RoleWithPermissions } from '../../domain/role.entity';

export interface RoleStorePort {
  findAll(): Promise<RoleEntity[]>;
  findById(id: string): Promise<RoleWithPermissions | null>;
  findByName(name: string): Promise<RoleEntity | null>;
  findDefault(): Promise<RoleEntity | null>;
  create(data: { name: string; description?: string; isDefault?: boolean; isProtected?: boolean; priority?: number; createdById?: string }): Promise<RoleEntity>;
  update(id: string, data: { name?: string; description?: string; isDefault?: boolean; isProtected?: boolean; priority?: number; updatedById?: string }): Promise<RoleEntity>;
  delete(id: string): Promise<void>;
  setPermissions(roleId: string, permissionIds: string[]): Promise<void>;
  countUsersByRoleId(roleId: string): Promise<number>;
}
