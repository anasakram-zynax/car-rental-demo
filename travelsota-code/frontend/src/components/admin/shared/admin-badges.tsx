"use client";

// Shared admin badge system — bold, vibrant Reference-2 colors.
// Use these everywhere in the admin panel for consistent status/type badges.

import { cn } from "@/lib/cn";

// ─── Color Tokens (Reference-2 bold palette) ────────────────
// chart-1 = blue/indigo (info, processing, flights, sent)
// chart-2 = emerald/green (success, confirmed, paid, active, published)
// chart-3 = amber/orange (warning, pending, paused, hold)
// chart-4 = violet/purple (agent, authorized, viewed)
// chart-5 = rose/red (destructive, failed, cancelled, suspended, expired)
// muted  = zinc/neutral (draft, inactive, archived)

export const ADMIN_BADGE_COLORS = {
  // Semantic status
  success:  "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  warning:  "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  info:     "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  error:    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  neutral:  "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400",

  // Module types
  flight:   "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400",
  hotel:    "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-400",

  // Dot colors
  dot: {
    success:  "bg-emerald-500",
    warning:  "bg-amber-500",
    info:     "bg-blue-500",
    error:    "bg-rose-500",
    neutral:  "bg-zinc-400",
    flight:   "bg-blue-500",
    hotel:    "bg-violet-500",
  },
} as const;

// ─── Shared Dot Badge ─────────────────────────────────────
export type AdminBadgeVariant = keyof Omit<typeof ADMIN_BADGE_COLORS, 'dot'>;

export function AdminDotBadge({
  status,
  label,
  variant = "neutral",
  className,
}: {
  status?: string;
  label?: string;
  variant?: AdminBadgeVariant;
  className?: string;
}) {
  const colors = ADMIN_BADGE_COLORS[variant] ?? ADMIN_BADGE_COLORS.neutral;
  const dotColor = ADMIN_BADGE_COLORS.dot[variant] ?? ADMIN_BADGE_COLORS.dot.neutral;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        colors,
        className,
      )}
      title={label ?? status ?? undefined}
    >
      <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dotColor)} />
      <span className="truncate">{label ?? status ?? "—"}</span>
    </span>
  );
}

// ─── Shared Module Badge (Flight / Hotel) ─────────────────
function FlightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
    </svg>
  );
}

function HotelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="17" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M2 7h20"/><path d="M6 11h2"/><path d="M10 11h2"/><path d="M6 15h2"/><path d="M10 15h2"/>
    </svg>
  );
}

export function AdminModuleBadge({
  type,
}: {
  type: "flight" | "hotel";
}) {
  const isFlight = type === "flight";
  const Icon = isFlight ? FlightIcon : HotelIcon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-inset ring-black/5 dark:ring-white/10",
        isFlight ? ADMIN_BADGE_COLORS.flight : ADMIN_BADGE_COLORS.hotel,
      )}
    >
      <Icon className="size-3" />
      {isFlight ? "Flight" : "Hotel"}
    </span>
  );
}

// ─── Booking Status Badge ─────────────────────────────────
// Suppliers settle a completed booking under different internal statuses —
// Travelport leaves it "held", Duffel/default leaves it "ticketed", ATS/hotel
// leaves it "booked"/"CONFIRMED". Internal statuses are unchanged (business
// logic, transitions, and expiry still key off them); this is display-only —
// every dashboard shows one word, "Confirmed", for any of them.
const BOOKING_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  booked:               { label: "Confirmed", variant: "success" },
  ticketed:             { label: "Confirmed", variant: "success" },
  TICKETED:             { label: "Confirmed", variant: "success" },
  CONFIRMED:            { label: "Confirmed", variant: "success" },
  completed:            { label: "Completed", variant: "success" },
  ERROR:                { label: "Failed", variant: "error" },
  held:                 { label: "Confirmed", variant: "success" },
  hold:                 { label: "Hold", variant: "info" },
  HOLD:                 { label: "Hold", variant: "info" },
  pending:              { label: "Pending", variant: "warning" },
  PENDING:              { label: "Pending", variant: "warning" },
  paid:                 { label: "Paid", variant: "success" },
  pending_payment:      { label: "Pending Payment", variant: "warning" },
  held_pending_payment: { label: "Hold — Pending", variant: "warning" },
  awaiting_issue:       { label: "Awaiting Issue", variant: "info" },
  booking_in_progress:  { label: "Processing", variant: "info" },
  failed:               { label: "Failed", variant: "error" },
  cancelled:            { label: "Cancelled", variant: "error" },
  CANCELLED:            { label: "Cancelled", variant: "error" },
  hold_expired:         { label: "Hold Expired", variant: "neutral" },
};

export function AdminBookingStatusBadge({ status }: { status: string }) {
  const entry = BOOKING_STATUS_MAP[status] ?? { label: status.replace(/_/g, " "), variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Supplier Status Badge ─────────────────────────────────
const SUPPLIER_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  CONFIRMED: { label: "Supplier Confirmed", variant: "info" },
  CANCELLED: { label: "Supplier Cancelled", variant: "neutral" },
  PENDING:   { label: "Supplier Pending", variant: "warning" },
  REJECTED:  { label: "Supplier Rejected", variant: "error" },
};

export function AdminSupplierStatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const entry = SUPPLIER_STATUS_MAP[status] ?? { label: status.replace(/_/g, " "), variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Payment Status Badge ─────────────────────────────────
const PAYMENT_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  PAID:            { label: "Paid", variant: "success" },
  PENDING:         { label: "Pending", variant: "warning" },
  PROCESSING:      { label: "Processing", variant: "info" },
  AUTHORIZED:      { label: "Authorized", variant: "info" },
  FAILED:          { label: "Failed", variant: "error" },
  CANCELLED:       { label: "Cancelled", variant: "neutral" },
  REFUNDED:        { label: "Refunded", variant: "warning" },
  REQUIRES_ACTION: { label: "Action Needed", variant: "error" },
};

export function AdminPaymentStatusBadge({ status }: { status: string }) {
  const entry = PAYMENT_STATUS_MAP[status] ?? { label: status.replace(/_/g, " "), variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Invoice Status Badge ─────────────────────────────────
const INVOICE_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  generated: { label: "Generated", variant: "warning" },
  sent:      { label: "Sent", variant: "info" },
  viewed:    { label: "Viewed", variant: "info" },
  paid:      { label: "Paid", variant: "success" },
  refunded:  { label: "Refunded", variant: "warning" },
  void:      { label: "Void", variant: "error" },
};

export function AdminInvoiceStatusBadge({ status }: { status: string }) {
  const entry = INVOICE_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── User Status Badge ────────────────────────────────────
const USER_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  ACTIVE:              { label: "Active", variant: "success" },
  INACTIVE:            { label: "Inactive", variant: "neutral" },
  SUSPENDED:           { label: "Suspended", variant: "error" },
  PENDING:             { label: "Pending", variant: "warning" },
  PENDING_VERIFICATION:{ label: "Pending Verification", variant: "warning" },
};

export function AdminUserStatusBadge({ status }: { status: string }) {
  const entry = USER_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── User Type Badge ──────────────────────────────────────
const USER_TYPE_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  STAFF:    { label: "Staff", variant: "info" },
  AGENT:    { label: "Agent", variant: "info" },
  CUSTOMER: { label: "Customer", variant: "neutral" },
};

export function AdminUserTypeBadge({ type }: { type: string }) {
  const entry = USER_TYPE_MAP[type] ?? { label: type, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Promo Code Status Badge ──────────────────────────────
const PROMO_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  DRAFT:    { label: "Draft", variant: "neutral" },
  ACTIVE:   { label: "Active", variant: "success" },
  PAUSED:   { label: "Paused", variant: "warning" },
  EXPIRED:  { label: "Expired", variant: "error" },
  ARCHIVED: { label: "Archived", variant: "neutral" },
};

export function AdminPromoStatusBadge({ status }: { status: string }) {
  const entry = PROMO_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Blog Status Badge ────────────────────────────────────
const BLOG_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  DRAFT:     { label: "Draft", variant: "neutral" },
  PUBLISHED: { label: "Published", variant: "success" },
};

export function AdminBlogStatusBadge({ status }: { status: string }) {
  const entry = BLOG_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Email Status Badge ───────────────────────────────────
const EMAIL_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  queued:     { label: "Queued", variant: "neutral" },
  processing: { label: "Processing", variant: "info" },
  sent:       { label: "Sent", variant: "success" },
  delivered:  { label: "Delivered", variant: "success" },
  failed:     { label: "Failed", variant: "error" },
  bounced:    { label: "Bounced", variant: "error" },
  opened:     { label: "Opened", variant: "info" },
  clicked:    { label: "Clicked", variant: "info" },
};

export function AdminEmailStatusBadge({ status }: { status: string }) {
  const entry = EMAIL_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Agent Status Badge ───────────────────────────────────
const AGENT_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  PENDING:  { label: "Pending Approval", variant: "warning" },
  APPROVED: { label: "Approved", variant: "success" },
  REJECTED: { label: "Rejected", variant: "error" },
};

export function AdminAgentStatusBadge({ status }: { status: string }) {
  const entry = AGENT_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Commission Status Badge ──────────────────────────────
const COMMISSION_STATUS_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  pending:  { label: "Pending", variant: "warning" },
  paid:     { label: "Paid", variant: "success" },
  reversed: { label: "Reversed", variant: "error" },
};

export function AdminCommissionStatusBadge({ status }: { status: string }) {
  const entry = COMMISSION_STATUS_MAP[status] ?? { label: status, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} />;
}

// ─── Audit Action Badge ───────────────────────────────────
const AUDIT_ACTION_MAP: Record<string, { label: string; variant: AdminBadgeVariant }> = {
  create:  { label: "Create", variant: "success" },
  update:  { label: "Update", variant: "info" },
  delete:  { label: "Delete", variant: "error" },
  login:   { label: "Login", variant: "neutral" },
  logout:  { label: "Logout", variant: "neutral" },
  export:  { label: "Export", variant: "info" },
};

export function AdminAuditActionBadge({ action }: { action: string }) {
  const normalized = action.toLowerCase();
  const entry = AUDIT_ACTION_MAP[normalized] ?? { label: action, variant: "neutral" as const };
  return <AdminDotBadge label={entry.label} variant={entry.variant} className="border-0 px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ring-black/5 dark:ring-white/10" />;
}
