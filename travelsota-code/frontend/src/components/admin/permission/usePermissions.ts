'use client';

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';

export function usePermissions() {
  const { permissions, refreshPermissions } = useAuth();

  /**
   * Check if the user has a specific permission.
   * Relies on the actual `permissions` array which is populated from the backend
   * during login. Super-admin / admin roles get ALL permissions from the backend,
   * so the check works correctly without an `isAdmin` bypass.
   */
  const hasPermission = useCallback(
    (code: string) => permissions.includes(code),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((code) => hasPermission(code)),
    [hasPermission],
  );

  const hasAllPermissions = useCallback(
    (codes: string[]) => codes.every((code) => hasPermission(code)),
    [hasPermission],
  );

  return useMemo(
    () => ({
      permissions,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      refreshPermissions,
    }),
    [permissions, hasPermission, hasAnyPermission, hasAllPermissions, refreshPermissions],
  );
}
