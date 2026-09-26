export type UserType = 'STAFF' | 'CUSTOMER' | 'AGENT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export interface UserEntity {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: UserType;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt: string | null;
  deletedAt: string | null;
  roleId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithRole extends UserEntity {
  roleName: string | null;
}

export interface UserDetail extends UserWithRole {
  roleName: string | null;
  permissionOverrides?: never;
}
