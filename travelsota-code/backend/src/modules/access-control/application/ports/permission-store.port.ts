import type { PermissionEntity } from '../../domain/permission.entity';

export interface PermissionStorePort {
  findAll(): Promise<PermissionEntity[]>;
  findByCodes(codes: string[]): Promise<PermissionEntity[]>;
  upsert(data: { code: string; name: string; group: string; description?: string }): Promise<PermissionEntity>;
}
