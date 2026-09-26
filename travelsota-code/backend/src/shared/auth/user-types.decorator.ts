import { SetMetadata } from '@nestjs/common';

/**
 * Route-level user-type guard values.
 *
 * These are NOT RBAC roles — they map directly to the `userType` field
 * on the User entity (STAFF, CUSTOMER, AGENT). `'public'` allows
 * unauthenticated access.
 */
export type UserTypeRoute = 'admin' | 'agent' | 'customer' | 'public';

export const USER_TYPES_KEY = 'user_types';
export const UserTypes = (...userTypes: UserTypeRoute[]) =>
  SetMetadata(USER_TYPES_KEY, userTypes);
