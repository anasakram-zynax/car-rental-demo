'use client';

import type { ReactNode } from 'react';
import { usePermissions } from './usePermissions';
import { AccessDeniedPage } from './AccessDeniedPage';

interface RequirePagePermissionProps {
  /** One or more permission codes — user needs at least one to access the page */
  permissions: string[];
  /** The page content to render when authorized */
  children: ReactNode;
  /** Optional custom 403 message */
  message?: string;
  /** Back-link target on the 403 page */
  backHref?: string;
  /** Back-link label */
  backLabel?: string;
}

/**
 * Page-level permission guard.
 * Wraps an entire admin page — shows the page content if the user has any of
 * the required permissions, otherwise renders the AccessDeniedPage component.
 */
export function RequirePagePermission({
  permissions,
  children,
  message,
  backHref,
  backLabel,
}: RequirePagePermissionProps) {
  const { hasAnyPermission } = usePermissions();
  const authorized = hasAnyPermission(permissions);

  if (authorized) {
    return <>{children}</>;
  }

  return <AccessDeniedPage message={message} backHref={backHref} backLabel={backLabel} />;
}
