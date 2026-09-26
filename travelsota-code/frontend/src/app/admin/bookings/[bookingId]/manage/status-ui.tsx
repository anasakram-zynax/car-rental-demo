'use client';

import { cn } from '@/lib/cn';
import { bookingStatusLabel } from '@/lib/utils/booking-status-label';

/**
 * Single source of truth for booking-status presentation in the workspace.
 * Every status maps to an explicit {label, pill} pair — nothing renders empty,
 * nothing renders white-on-wash. Light pairs are dark-950 text on pale ground
 * (≈10:1); dark mode uses tinted variants of the same hue.
 */

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute';

const TONE_CLASSES: Record<Tone, string> = {
  ok: 'border border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/50 dark:text-emerald-300',
  warn: 'border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-300',
  bad: 'border border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700/60 dark:bg-rose-950/50 dark:text-rose-300',
  info: 'border border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-700/60 dark:bg-sky-950/50 dark:text-sky-300',
  mute: 'border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const DOT_CLASSES: Record<Tone, string> = {
  ok: 'bg-emerald-500 dark:bg-emerald-400',
  warn: 'bg-amber-500 dark:bg-amber-400',
  bad: 'bg-rose-500 dark:bg-rose-400',
  info: 'bg-sky-500 dark:bg-sky-400',
  mute: 'bg-slate-400 dark:bg-slate-500',
};

const STATUS_TONE: Record<string, Tone> = {
  ticketed: 'ok',
  booked: 'ok',
  confirmed: 'ok',
  paid: 'ok',
  completed: 'ok',
  held: 'info',
  held_pending_payment: 'info',
  pending_payment: 'warn',
  pending: 'warn',
  unpaid: 'warn',
  booking_in_progress: 'warn',
  payment_processing: 'warn',
  refund_pending: 'warn',
  refund_requested: 'warn',
  cancellation_requested: 'warn',
  void_requested: 'warn',
  cancelled: 'bad',
  canceled: 'bad',
  failed: 'bad',
  failed_supplier_booking: 'bad',
  failed_payment: 'bad',
  payment_failed: 'bad',
  payment_expired: 'bad',
  hold_expired: 'bad',
  voided: 'mute',
  refunded: 'mute',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status?.toLowerCase?.() ?? ''] ?? 'mute';
}

/** Status pill — guaranteed non-empty label, AA contrast in both modes with indicator dot. */
export function StatusPill({ status, className = '' }: { status: string; className?: string }) {
  const tone = statusTone(status);
  const label = bookingStatusLabel(status) || status?.replace(/_/g, ' ') || 'Unknown';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-xs',
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', DOT_CLASSES[tone])} />
      <span>{label}</span>
    </span>
  );
}

/** Provider pill — clean uppercase badge with clear contrast. */
export function ProviderPill({ provider, icon }: { provider: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
      {icon}
      {provider || 'booking'}
    </span>
  );
}
