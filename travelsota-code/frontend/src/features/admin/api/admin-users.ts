import { adminRequest } from '@/lib/api/admin-client';

export interface UserListItem {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: 'STAFF' | 'CUSTOMER' | 'AGENT';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  emailVerified: boolean;
  lastLoginAt: string | null;
  roleId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserDetail extends UserListItem {
  roleName: string | null;
}

export interface RoleEntity {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isProtected: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoleWithPermissions extends RoleEntity {
  permissions: string[];
}

export interface PermissionEntity {
  id: string;
  code: string;
  name: string;
  group: string;
  description: string | null;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionEntity[];
}

export function getUsers() {
  return adminRequest<UserListItem[]>('/admin/users');
}

export interface PagedUsers {
  items: UserListItem[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
}

export function getUsersPaged(params: {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  userTypes?: string[];
}) {
  const qs = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.search) qs.set('search', params.search);
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  if (params.userTypes?.length) qs.set('userTypes', params.userTypes.join(','));
  return adminRequest<PagedUsers>(`/admin/users?${qs.toString()}`);
}

export function getStaffUsers() {
  return adminRequest<UserListItem[]>('/admin/users/staff');
}

export function getUsersByUserTypes(userTypes: string[]) {
  return adminRequest<UserListItem[]>(`/admin/users?userTypes=${userTypes.join(',')}`);
}

export function getUser(id: string) {
  return adminRequest<UserDetail>(`/admin/users/${id}`);
}

export function createUser(data: { email: string; password: string; firstName?: string; lastName?: string; phone?: string; userType?: string; roleId?: string }) {
  return adminRequest<UserDetail>('/admin/users', { method: 'POST', body: data });
}

export function updateUser(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; userType?: string; roleId?: string }) {
  return adminRequest<UserDetail>(`/admin/users/${id}`, { method: 'PATCH', body: data });
}

export function deleteUser(id: string) {
  return adminRequest<{ success: boolean }>(`/admin/users/${id}`, { method: 'DELETE' });
}

export function getRoles() {
  return adminRequest<RoleEntity[]>('/admin/roles');
}

export function getRole(id: string) {
  return adminRequest<RoleWithPermissions>(`/admin/roles/${id}`);
}

export function createRole(data: { name: string; description?: string; isDefault?: boolean; isProtected?: boolean; permissionIds?: string[] }) {
  return adminRequest<RoleWithPermissions>('/admin/roles', { method: 'POST', body: data });
}

export function updateRole(id: string, data: { name?: string; description?: string; isDefault?: boolean; isProtected?: boolean; permissionIds?: string[] }) {
  return adminRequest<RoleWithPermissions>(`/admin/roles/${id}`, { method: 'PATCH', body: data });
}

export function deleteRole(id: string) {
  return adminRequest<{ success: boolean }>(`/admin/roles/${id}`, { method: 'DELETE' });
}

export function getRoleUserCount(id: string) {
  return adminRequest<{ count: number }>(`/admin/roles/${id}/user-count`);
}

export function getPermissions() {
  return adminRequest<PermissionGroup[]>('/admin/permissions');
}
