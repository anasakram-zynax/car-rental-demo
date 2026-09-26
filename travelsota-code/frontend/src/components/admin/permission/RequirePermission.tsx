'use client';

import type { ReactNode } from 'react';
import { usePermissions } from './usePermissions';

interface RequirePermissionProps {
  permissions: string[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequirePermission({ permissions: required, children, fallback = null }: RequirePermissionProps) {
  const { hasAnyPermission } = usePermissions();

  if (hasAnyPermission(required)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
