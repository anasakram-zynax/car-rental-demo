'use client';

type BookingStatus =
  | 'pending_payment'
  | 'payment_processing'
  | 'booking_in_progress'
  | 'held_pending_payment'
  | 'awaiting_issue'
  | 'held'
  | 'booked'
  | 'ticketed'
  | 'cancelled'
  | 'cancellation_requested'
  | 'failed'
  | 'failed_supplier_booking'
  | 'failed_payment'
  | 'hold_expired'
  | 'refund_pending'
  | 'refunded';

const STATUS_CONFIG: Record<BookingStatus, { label: string; color: string }> = {
  pending_payment:           { label: 'Awaiting Payment', color: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' },
  payment_processing:        { label: 'Processing Payment', color: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60' },
  booking_in_progress:       { label: 'Booking in Progress', color: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/60' },
  held_pending_payment:      { label: 'Hold — Awaiting Payment', color: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200/60' },
  // Auto-Issue After Payment is off: payment is verified (see the separate
  // payment-status badge) but the booking itself waits for an admin to
  // click Issue — not a failure, not yet confirmed with the supplier.
  awaiting_issue:            { label: 'Held for Review', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  // held/booked/ticketed are all internal supplier-workflow states — none of
  // them mean anything to a customer or should read as "not quite done" in
  // the admin table. All three read as "Confirmed" (display-only; the
  // underlying status column is unchanged and still drives crons/refunds).
  held:                      { label: 'Confirmed', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  booked:                    { label: 'Confirmed', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  ticketed:                  { label: 'Confirmed', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  cancelled:                 { label: 'Cancelled', color: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/60' },
  hold_expired:              { label: 'Hold Expired', color: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/60' },
  cancellation_requested:    { label: 'Cancellation Requested', color: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/60' },
  failed:                    { label: 'Failed', color: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
  failed_supplier_booking:   { label: 'Supplier Failed', color: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
  failed_payment:            { label: 'Payment Failed', color: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
  refund_pending:            { label: 'Refund Pending', color: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/60' },
  refunded:                  { label: 'Refunded', color: 'bg-green-50 text-green-700 ring-1 ring-green-200/60' },
};

interface BookingStatusBadgeProps {
  status: string;
  className?: string;
}

export function BookingStatusBadge({ status, className = '' }: BookingStatusBadgeProps) {
  const config = STATUS_CONFIG[status as BookingStatus];
  const label = config?.label ?? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const color = config?.color ?? 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/60';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${color} ${className}`}>
      {label}
    </span>
  );
}

/**
 * Payment status is independent of booking status — a booking can be
 * "Held for Review" (auto-issue off) while payment already shows "Paid".
 * Customer-facing sibling of the admin PAYMENT_STATUS_MAP in admin-badges.tsx.
 */
const PAYMENT_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  PAID:            { label: 'Paid', color: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60' },
  PENDING:         { label: 'Pending', color: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60' },
  AUTHORIZED:      { label: 'Authorized', color: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/60' },
  REFUNDED:        { label: 'Refunded', color: 'bg-zinc-100 text-zinc-600 ring-1 ring-zinc-200/60' },
  CANCELLED:       { label: 'Cancelled', color: 'bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200/60' },
  FAILED:          { label: 'Failed', color: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
  REQUIRES_ACTION: { label: 'Action Needed', color: 'bg-red-50 text-red-700 ring-1 ring-red-200/60' },
};

export function PaymentStatusBadge({ status, className = '' }: { status?: string | null; className?: string }) {
  const key = (status ?? '').toUpperCase();
  // No payment row yet (e.g. bank transfer before receipt upload) reads as Pending, not blank.
  const config = PAYMENT_STATUS_CONFIG[key] ?? PAYMENT_STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.color} ${className}`}>
      {config.label}
    </span>
  );
}
