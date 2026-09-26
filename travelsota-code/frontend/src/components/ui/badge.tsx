import type { CSSProperties, ReactNode } from 'react';
import { bookingStatusLabel } from '@/lib/utils/booking-status-label';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-zinc-100 text-zinc-700',
  secondary: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

const STATUS_MAP: Record<string, BadgeVariant> = {
  booked: 'success',
  confirmed: 'success',
  completed: 'success',
  pending_payment: 'warning',
  held_pending_payment: 'info',
  pending: 'warning',
  previewed: 'info',
  failed: 'error',
  cancelled: 'error',
  expired: 'error',
  active: 'success',
  paid: 'success',
  reversed: 'error',
  deposit: 'success',
  deduct: 'error',
  held: 'success',
  ticketed: 'success',
  TICKETED: 'success',
  HOLD: 'warning',
  PENDING: 'warning',
  CONFIRMED: 'success',
  CANCELLED: 'error',
  ERROR: 'error',
  booking_in_progress: 'warning',
  AUTHORIZED: 'info',
  hold_expired: 'error',
};

export function Badge({ variant = 'default', children, className = '', style }: BadgeProps) {
  return (
    <span
      style={style}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_MAP[status] ?? 'default';
  return <Badge variant={variant}>{bookingStatusLabel(status)}</Badge>;
}
