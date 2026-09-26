'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Centralized RBAC hook for supplier information visibility.
 *
 * Supplier information (names, badges, logos, metadata, internal IDs,
 * diagnostics) is confidential business data. Only administrators (STAFF)
 * should ever see it. Agents, customers, and guests must never see which
 * supplier fulfills a booking.
 *
 * Usage:
 *   const { canViewSupplier } = useSupplierAccess();
 *   {canViewSupplier && <SupplierBadge name="Hotelbeds" />}
 */
export function useSupplierAccess() {
  const { isAdmin } = useAuth();

  const canViewSupplier = useMemo(
    () => isAdmin,
    [isAdmin],
  );

  return { canViewSupplier };
}