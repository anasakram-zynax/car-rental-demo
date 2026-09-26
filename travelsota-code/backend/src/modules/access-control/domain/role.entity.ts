export interface RoleEntity {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isProtected: boolean;
  priority: number;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithPermissions extends RoleEntity {
  permissions: string[];
}
