'use client';

import type { ReactNode } from 'react';
import { useSupplierAccess } from '@/lib/hooks/use-supplier-access';

/**
 * Renders children only if the current user is an admin with supplier
 * info visibility permission. Use this to gate any supplier-specific UI
 * (badges, names, logos, metadata, internal IDs, diagnostics).
 *
 * @example
 * <SupplierGate>
 *   <span className="badge">Travelport</span>
 * </SupplierGate>
 */
export function SupplierGate({ children }: { children: ReactNode }) {
  const { canViewSupplier } = useSupplierAccess();
  if (!canViewSupplier) return null;
  return <>{children}</>;
}

/**
 * Supplier badge — displays the provider name in a styled chip.
 * Automatically hidden for non-admin users via `SupplierGate`.
 *
 * @example
 * <SupplierBadge name="Hotelbeds" />
 * <SupplierBadge name="Travelport" variant="flight" />
 */
export function SupplierBadge({
  name,
  variant = 'hotel',
  className = '',
}: {
  name: string;
  variant?: 'hotel' | 'flight';
  className?: string;
}) {
  const { canViewSupplier } = useSupplierAccess();
  if (!canViewSupplier || !name) return null;

  return (
    <span
      className={`inline-flex items-center rounded-lg bg-white/85 px-2 py-1 text-[10px] font-semibold text-gray-700 shadow-sm backdrop-blur-sm ${className}`}
    >
      {name}
    </span>
  );
}

/**
 * Supplier count label — e.g. "2 suppliers". Hidden for non-admins.
 */
export function SupplierCount({
  count,
  className = '',
}: {
  count: number;
  className?: string;
}) {
  const { canViewSupplier } = useSupplierAccess();
  // Per-provider cards always have exactly one supplier — only show the
  // count when multiple suppliers share a card.
  if (!canViewSupplier || count <= 1) return null;

  return (
    <span className={`text-[11px] text-gray-400 ${className}`}>
      {count} supplier{count !== 1 ? 's' : ''}
    </span>
  );
}