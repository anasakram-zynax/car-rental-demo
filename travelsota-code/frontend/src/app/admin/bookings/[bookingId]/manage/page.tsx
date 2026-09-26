'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { HotelWorkspace } from './hotel-workspace';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useToast } from '@/hooks/useToast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { CancelBookingModal } from '@/components/admin/bookings/cancel-booking-modal';
import type { AdminFlightDetail } from '@/components/admin/bookings/flight-booking-detail-modal';
import {
  adminIssueBooking,
  adminVoidBooking,
  adminRefundRequest,
} from '@/features/admin/api/admin-bookings';
import { bookingStatusLabel } from '@/lib/utils/booking-status-label';
import { formatCurrency } from '@/lib/utils/currency';
import { useCurrencyData } from '@/context/CurrencyContext';
import { cn } from '@/lib/cn';
import { StatusPill } from './status-ui';
import { HoldCountdown } from '@/components/admin/bookings/hold-countdown';
import {
  Armchair,
  ArrowLeft,
  Ban,
  Calendar,
  Check,
  CircleX,
  Clock,
  Copy,
  FileText,
  Globe,
  Loader2,
  Lock,
  Mail,
  Phone,
  Plane,
  ReceiptText,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react';

const TERMINAL = new Set([
  'cancelled',
  'canceled',
  'voided',
  'failed',
  'hold_expired',
  'refunded',
]);
// Held bookings have a PNR but no ticket — void (ticket reversal) does not
// apply until issued. Cancel is the correct pre-issue operation.
const HELD = new Set(['held', 'held_pending_payment', 'pending_payment']);
const ISSUED = new Set(['ticketed', 'booked', 'confirmed']);
const LOCKED = new Set(['refund_pending', 'refund_requested', 'cancellation_requested']);

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
}

function holdCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return 'Expired';
  const d = Math.floor(ms / 86_400_000);
  if (d >= 2) return `${d} days left`;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function TicketBarcode({ code, className }: { code: string; className?: string }) {
  const barPattern = [
    2, 1, 3, 1, 1, 2, 4, 1, 2, 3, 1, 2, 1, 4, 2, 1, 3, 2, 1, 3, 1, 2, 4, 1, 1, 3, 2, 1, 4, 2, 1, 2, 3, 1, 2,
  ];
  let currentPos = 2;

  return (
    <div className={cn('flex flex-col items-center gap-1.5', className)}>
      <svg
        viewBox="0 0 160 32"
        fill="currentColor"
        className="h-8 w-full max-w-[210px] text-foreground/75"
        aria-hidden="true"
      >
        {barPattern.map((width, idx) => {
          const x = currentPos;
          currentPos += width + (idx % 2 === 0 ? 2 : 1);
          if (idx % 2 === 1) return null;
          return (
            <rect
              key={idx}
              x={x}
              y="0"
              width={width}
              height="32"
              rx="0.5"
            />
          );
        })}
      </svg>
      <span className="font-mono text-[10px] font-bold tracking-[0.24em] text-muted-foreground uppercase">
        {code}
      </span>
    </div>
  );
}

function ManagePageInner() {
  const params = useParams();
  const bookingId = params.bookingId as string;
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();
  const reducedMotion = useReducedMotion();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedSupplierId, setCopiedSupplierId] = useState(false);

  const detailKey = ['admin', 'flight-booking-detail', bookingId] as const;
  const { data, isPending, error, refetch, isFetching } = useApiQuery<AdminFlightDetail>(
    [...detailKey],
    `/admin/flights/bookings/${bookingId}/detail`,
    { requestOptions: { auth: true }, retry: 1 },
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...detailKey] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  };

  const issueMutation = useMutation({
    mutationFn: () => adminIssueBooking(bookingId),
    onSuccess: (res) => {
      toasts.success('Booking issued', res.locatorCode ? `PNR ${res.locatorCode}` : 'Ticket created.');
      invalidate();
    },
    onError: (err: any) => toasts.error('Issue failed', err?.message ?? 'Supplier ticketing failed.'),
  });
  const voidMutation = useMutation({
    mutationFn: () => adminVoidBooking(bookingId, 'Void by admin'),
    onSuccess: () => {
      toasts.success('Booking voided', 'Ticket reversal recorded.');
      invalidate();
    },
    onError: (err: any) => toasts.error('Void failed', err?.message ?? 'Supplier void failed.'),
  });
  const refundMutation = useMutation({
    mutationFn: () => adminRefundRequest(bookingId, 'Refund by admin'),
    onSuccess: () => {
      toasts.success('Refund requested', 'Refund will follow supplier charges.');
      invalidate();
    },
    onError: (err: any) => toasts.error('Refund failed', err?.message ?? 'Refund request failed.'),
  });
  const busy = issueMutation.isPending || voidMutation.isPending || refundMutation.isPending;

  const status = (data?.localStatus ?? '').toLowerCase();
  const terminal = TERMINAL.has(status);
  const locked = LOCKED.has(status);
  const issued = ISSUED.has(status);
  const held = HELD.has(status);
  const hasPnr = !!data?.locatorCode;
  const provider = data?.provider ?? '';
  const supportsVoid = provider === 'travelport' || provider === 'manual';

  const issueDisabled = !data || issued || terminal || locked;
  const voidDisabled = !data || !hasPnr || terminal || locked || !supportsVoid || held || !issued;
  const cancelDisabled = !data || terminal || locked;
  const refundDisabled = !data || !hasPnr || terminal || locked;

  const travelers = Array.isArray(data?.travelerSnapshot) ? data.travelerSnapshot : [];
  const summary = (data?.workflowSummary ?? {}) as Record<string, any>;
  const snap = (data?.offerSnapshot ?? {}) as Record<string, any>;
  const criteria = (snap?.searchCriteria ?? {}) as Record<string, any>;
  const routeFrom = criteria.from ?? snap.from ?? null;
  const routeTo = criteria.to ?? snap.to ?? null;
  const routeDate = criteria.departureDate ?? snap.departureDate ?? null;
  const countdown = holdCountdown(data?.holdExpiresAt);

  const firstSlice = snap?.slices?.[0];
  const firstSegment = firstSlice?.segments?.[0];
  const flightNumber =
    firstSegment?.marketingCarrierFlightNumber ??
    firstSegment?.flightNumber ??
    snap?.flightNumber ??
    null;
  const carrierCode =
    firstSegment?.marketingCarrier?.iataCode ??
    firstSegment?.operatingCarrier?.iataCode ??
    snap?.carrierCode ??
    null;
  const carrierName =
    firstSegment?.marketingCarrier?.name ??
    firstSegment?.operatingCarrier?.name ??
    snap?.carrierName ??
    (provider ? provider.toUpperCase() : 'Airline');
  const cabinClass =
    snap?.cabinClass ?? firstSegment?.cabinClass ?? 'Economy';
  const primaryTraveler = travelers[0] as Record<string, any> | undefined;
  const primaryPassengerName = primaryTraveler
    ? [primaryTraveler.givenName ?? primaryTraveler.firstName, primaryTraveler.surname ?? primaryTraveler.lastName]
        .filter(Boolean)
        .join(' ') || ((data as any)?.customerName ?? 'Primary Passenger')
    : ((data as any)?.customerName ?? 'Primary Passenger');
  const departureTimeStr = firstSegment?.departingAt
    ? fmtDateTime(firstSegment.departingAt)
    : routeDate
      ? fmtDateTime(String(routeDate))
      : 'Scheduled';
  const arrivalTimeStr = firstSegment?.arrivingAt
    ? fmtDateTime(firstSegment.arrivingAt)
    : snap?.arrivingAt
      ? fmtDateTime(String(snap.arrivingAt))
      : 'Scheduled';

  const copyPnr = async () => {
    if (!data?.locatorCode) return;
    try {
      await navigator.clipboard.writeText(data.locatorCode);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = data.locatorCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const copySupplierId = async (id: string) => {    try {
      await navigator.clipboard.writeText(id);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = id;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedSupplierId(true);
    window.setTimeout(() => setCopiedSupplierId(false), 1600);
  };

  const invoiceNumber = data?.supplierBookingId || data?.bookingId || bookingId;
  const isPaid = (data?.paymentStatus ?? '').toUpperCase() === 'PAID';

  // Compute actual platform margin & yield percentage
  const charged = data?.amount ?? 0;
  const base = data?.baseAmount ?? 0;
  const computedMargin =
    data?.markupAmount != null && data.markupAmount > 0
      ? data.markupAmount
      : charged > 0 && base > 0 && charged >= base
        ? Number((charged - base).toFixed(2))
        : (data?.markupAmount ?? 0);

  const marginPercentage =
    base > 0 && computedMargin > 0
      ? ((computedMargin / base) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          <Link
            href="/admin/bookings"
            aria-label="Back to bookings"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-xs transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Flight Booking Operations
              </h1>
              <StatusPill status={data?.localStatus ?? 'unknown'} />
              {data?.demoBooking && (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  Demo
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Invoice <span className="font-semibold text-foreground">{invoiceNumber}</span>
              {' • '}
              Supplier <span className="font-semibold capitalize text-foreground">{provider || 'Duffel'}</span>
              {(routeFrom || routeTo) && (
                <>
                  {' • '}
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-teal dark:text-teal-400">
                    <Plane className="size-3 rotate-45" />
                    {routeFrom ?? '···'} → {routeTo ?? '···'}
                  </span>
                  {routeDate && <span className="ml-1 text-muted-foreground">({fmtDateTime(String(routeDate))})</span>}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Top Quick Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {isFetching && !isPending && (
            <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-brand-teal" />
              Live Sync
            </span>
          )}

          {data?.receiptUrl && (
            <a
              href={data.receiptUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-xs transition-colors hover:bg-accent"
            >
              <ReceiptText className="size-3.5 text-brand-teal" />
              <span>Payment Receipt</span>
            </a>
          )}
        </div>
      </div>

      {isPending ? (
        <div className="space-y-4" aria-busy="true">
          <div className="h-44 animate-pulse rounded-2xl bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="h-28 animate-pulse rounded-2xl bg-muted" />
            <div className="h-28 animate-pulse rounded-2xl bg-muted" />
            <div className="h-28 animate-pulse rounded-2xl bg-muted" />
            <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          </div>
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : error || !data ? (
        <section className="overflow-hidden rounded-2xl border border-border/70 bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">Flight workspace could not load this record</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-4 cursor-pointer text-sm font-semibold text-brand-teal hover:underline"
          >
            Try again
          </button>
        </section>
      ) : (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="space-y-6"
        >
          {/* ── Section 1: Airline Boarding Pass & Operations Console ── */}
          <section
            aria-label="Airline Boarding Pass & Operations Console"
            className="overflow-hidden rounded-3xl border border-teal-900/40 bg-card shadow-md dark:border-teal-700/40"
          >
            {/* Boarding Pass Top Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-900/40 bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 px-6 py-3.5 text-white sm:px-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/40">
                  <Plane className="size-4" />
                </span>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-teal-200">
                  Airline Boarding Pass • Passenger Ticket & Baggage Check
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-900/60 px-2.5 py-1 text-teal-200 ring-1 ring-teal-700/50">
                  <Armchair className="size-3 text-teal-300" />
                  {cabinClass}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-300 ring-1 ring-slate-700">
                  <Globe className="size-3 text-slate-400" />
                  {provider ? provider.toUpperCase() : 'GDS / NDC'}
                </span>
              </div>
            </div>

            {/* Boarding Pass Body (Ticket + Perforated Stub) */}
            <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-12 lg:divide-y-0">
              {/* Left Ticket Main: Flight Path & Specification Deck (8 Cols) */}
              <div className="space-y-6 p-6 sm:p-8 lg:col-span-8">
                {/* Flight Route Trajectory Hero */}
                <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-muted/20 p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
                  {/* Origin */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Departure
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                        {routeFrom ?? 'DEP'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {departureTimeStr}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {firstSegment?.departureAirport?.name ?? 'Origin Terminal'}
                    </p>
                  </div>

                  {/* Flight Track Badge & Trajectory */}
                  <div className="my-2 flex flex-1 flex-col items-center justify-center px-4 sm:my-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-teal dark:text-teal-400">
                      <Ticket className="size-3.5" />
                      <span>{flightNumber ? `${carrierCode ?? ''} ${flightNumber}` : carrierName}</span>
                    </div>
                    <div className="relative my-2 flex w-full max-w-[200px] items-center justify-center">
                      <div className="h-0.5 w-full border-t-2 border-dashed border-teal-500/50" />
                      <div className="absolute flex size-8 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/10 text-brand-teal shadow-xs dark:bg-teal-950 dark:text-teal-400">
                        <Plane className="size-4 rotate-90" />
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {firstSlice?.duration ? `${firstSlice.duration} • Direct` : 'Non-Stop Flight'}
                    </span>
                  </div>

                  {/* Destination */}
                  <div className="space-y-1 sm:text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Arrival
                    </span>
                    <div className="flex items-baseline gap-2 sm:justify-end">
                      <span className="font-mono text-3xl font-black tracking-tight text-foreground sm:text-4xl">
                        {routeTo ?? 'ARR'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-foreground">
                      {arrivalTimeStr}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {firstSegment?.arrivalAirport?.name ?? 'Destination Terminal'}
                    </p>
                  </div>
                </div>

                {/* 4 Boarding Spec Grid Cells */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <User className="size-3 text-brand-teal" />
                      Passenger
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {primaryPassengerName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {travelers.length > 1 ? `+${travelers.length - 1} more guest(s)` : 'Primary Traveler'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Plane className="size-3 text-brand-teal" />
                      Operator
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {carrierName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {carrierCode ? `IATA Code: ${carrierCode}` : 'Scheduled Flight'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Calendar className="size-3 text-brand-teal" />
                      Flight Date
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {routeDate ? fmtDateTime(String(routeDate)).split(',')[0] : departureTimeStr.split(',')[0]}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Boarding Gate Closes T-20
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Armchair className="size-3 text-brand-teal" />
                      Class / Cabin
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {cabinClass}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Confirmed Seat Class
                    </p>
                  </div>
                </div>

                {/* Extra services booked with this PNR (seats/meals/baggage/services) */}
                {(() => {
                  const anx = (snap?.ancillaries ?? {}) as Record<string, any[]>;
                  // Older bookings stored raw `seat:<urlencoded JSON>` ids —
                  // decode for display so a seat renders as "25F", not a blob.
                  const prettySeat = (v: any): string => {
                    const raw = String(v?.seatNumber ?? v?.ancillaryProductId ?? 'Seat');
                    if (!raw.startsWith('seat:')) return raw;
                    try {
                      const d = JSON.parse(decodeURIComponent(raw.slice(5))) as { seat?: unknown };
                      return d.seat ? String(d.seat) : raw;
                    } catch {
                      return raw;
                    }
                  };
                  const rows: { kind: string; label: string }[] = [
                    ...(Array.isArray(anx.seats) ? anx.seats : []).map((s: any) => ({
                      kind: 'Seat',
                      label: prettySeat(s),
                    })),
                    ...(Array.isArray(anx.baggage) ? anx.baggage : []).map((b: any) => ({
                      kind: 'Baggage',
                      label: b.label ?? b.ancillaryProductId ?? 'Baggage',
                    })),
                    ...(Array.isArray(anx.meals) ? anx.meals : []).map((m: any) => ({
                      kind: 'Meal',
                      label: m.mealName ?? m.mealCode ?? 'Meal',
                    })),
                    ...(Array.isArray(anx.services) ? anx.services : []).map((s: any) => ({
                      kind: 'Service',
                      label: s.label ?? s.ancillaryProductId ?? 'Service',
                    })),
                  ];
                  if (rows.length === 0) return null;
                  return (
                    <div className="mt-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Extra Services · {rows.length}
                      </div>
                      <ul className="mt-1.5 space-y-1">
                        {rows.map((r, i) => (
                          <li key={`${r.kind}-${i}`} className="flex items-center gap-2 text-xs">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                              {r.kind}
                            </span>
                            <span className="font-semibold text-foreground">{r.label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                {/* Fare policy from the booked snapshot (live estimate lives in Cancel) */}
                {(() => {
                  const display = (snap?.display ?? {}) as Record<string, any>;
                  const refund = display.refundPolicy as any;
                  const change = display.changePolicy as any;
                  if (!refund && !change) return null;
                  const fee = (p: any): string =>
                    p == null
                      ? '—'
                      : p.free === true
                        ? 'Free'
                        : p.penaltyAmount != null
                          ? `${p.penaltyAmount} ${p.penaltyCurrency ?? ''}`.trim()
                          : (p.label ?? 'See rules');
                  return (
                    <div className="mt-3 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Cancellation Policy · booked fare
                      </div>
                      <div className="mt-1.5 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-muted-foreground">Refund</span>
                          <span className="font-bold text-foreground">{fee(refund)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-muted-foreground">Change</span>
                          <span className="font-bold text-foreground">{fee(change)}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Live figures are quoted in Cancel before any action.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Right Tear-Off Boarding Pass Stub with Notch (4 Cols) */}
              <div className="relative flex flex-col justify-between border-t border-dashed border-border/80 bg-muted/25 p-6 sm:p-8 lg:col-span-4 lg:border-t-0 lg:border-l">
                {/* Circular Perforation Punch Notches (visible on desktop) */}
                <div
                  aria-hidden="true"
                  className="absolute -top-3.5 -left-3.5 hidden size-7 rounded-full border border-border/80 bg-background shadow-inner lg:block"
                />
                <div
                  aria-hidden="true"
                  className="absolute -bottom-3.5 -left-3.5 hidden size-7 rounded-full border border-border/80 bg-background shadow-inner lg:block"
                />

                <div className="space-y-4">
                  {/* PNR Ref Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Booking PNR / Locator
                      </span>
                      <StatusPill status={data.localStatus} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-3xl font-extrabold tracking-wider text-foreground">
                        {data.locatorCode ?? 'NOT ISSUED'}
                      </span>
                      {hasPnr && (
                        <button
                          type="button"
                          onClick={copyPnr}
                          aria-label="Copy PNR"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-accent"
                        >
                          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* E-Ticket numbers (stored at ticketing; absent on holds) */}
                  {Array.isArray((summary as Record<string, any>)?.ticketNumbers) &&
                  ((summary as Record<string, any>).ticketNumbers as string[]).length > 0 ? (
                    <div className="rounded-xl bg-zinc-900 p-4 shadow-2xs">
                      <div className="flex items-center gap-1.5">
                        <Ticket className="size-3.5 text-emerald-400" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                          E-Ticket{(summary.ticketNumbers as string[]).length > 1 ? 's' : ''} · issued
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {((summary as Record<string, any>).ticketNumbers as string[]).map((t: string) => (
                          <div key={t} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono text-xl font-extrabold tracking-wider text-white">
                              {t}
                            </span>
                            <button
                              type="button"
                              onClick={() => copySupplierId(t)}
                              aria-label={`Copy ticket ${t}`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-200 transition-colors hover:bg-zinc-700"
                            >
                              {copiedSupplierId ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                              <span>{copiedSupplierId ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Dual hold windows: supplier deadline vs our deadline.
                      Effective = earlier of the two; the expiry cron sweeps on it. */}
                  <div className="space-y-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-muted-foreground">Supplier deadline · Travelport</span>
                        <span className="font-bold text-foreground">
                          <HoldCountdown expiresAt={data.supplierHoldExpiresAt ?? data.holdExpiresAt} />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {data.supplierHoldExpiresAt || data.holdExpiresAt
                          ? fmtDateTime(data.supplierHoldExpiresAt ?? data.holdExpiresAt ?? '')
                          : 'No supplier window'}
                      </p>
                      <span
                        className={
                          data.supplierHoldSource && data.supplierHoldSource !== 'local_estimate'
                            ? 'mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-950'
                            : 'mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600'
                        }
                      >
                        {data.supplierHoldSource && data.supplierHoldSource !== 'local_estimate'
                          ? 'Real expiry from supplier'
                          : 'Our 20-min guard (no supplier date yet)'}
                      </span>
                      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                        Ticket by this time or the airline releases the seats.
                      </p>
                    </div>
                    <div className="border-t border-border/60 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-muted-foreground">Our deadline · Admin</span>
                        <span className="font-bold text-foreground">
                          <HoldCountdown expiresAt={data.adminHoldExpiresAt} />
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {data.adminHoldExpiresAt ? fmtDateTime(data.adminHoldExpiresAt) : '—'}
                      </p>
                      <span className="mt-1 inline-block rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-950">
                        Pay-later / bank-transfer window
                      </span>
                      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                        Our system auto-cancels past this time, even if seats remain.
                      </p>
                    </div>
                    <div className="border-t border-border/60 pt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Booked</span>
                      <span>{fmtDateTime(data.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Ticket Barcode */}
                <div className="mt-5 pt-3 border-t border-dashed border-border/70">
                  <TicketBarcode code={`ETKT • ${data.locatorCode ?? data.bookingId}`} />
                </div>
              </div>
            </div>

            {/* Attached High-Contrast Operations Console Bar */}
            <div className="border-t border-border/80 bg-muted/40 p-6 sm:px-8">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-teal" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                  Ticketing & Lifecycle Actions Deck
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Issue Booking */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={issueDisabled || busy}
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Issue booking?',
                          message: `Issue booking${data.locatorCode ? ` ${data.locatorCode}` : ''}? This confirms with supplier and generates ticket.`,
                          confirmLabel: 'Issue',
                          destructive: false,
                        })
                      ) {
                        issueMutation.mutate();
                      }
                    }}
                    className={cn(
                      'w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2',
                      issueDisabled || busy
                        ? 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-[#059669] hover:bg-[#047857] text-white border border-[#047857] shadow-sm',
                    )}
                  >
                    {issueMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : issueDisabled ? (
                      <Lock className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <Check className="size-4 shrink-0" />
                    )}
                    <span>Issue Booking</span>
                  </button>
                  <p className="px-1 text-center text-[11px] font-medium text-muted-foreground">
                    {issued
                      ? 'Already confirmed & ticketed'
                      : terminal || locked
                        ? `Locked: ${bookingStatusLabel(data.localStatus)}`
                        : 'Tickets held PNR with airline'}
                  </p>
                </div>

                {/* 2. Void Ticket (Solid Deep Indigo) */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={voidDisabled || busy}
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Void ticket?',
                          message: `Void ticket ${data.locatorCode}? Pre-issue reversal with no fare penalties.`,
                          confirmLabel: 'Void',
                        })
                      ) {
                        voidMutation.mutate();
                      }
                    }}
                    className={cn(
                      'w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2',
                      voidDisabled || busy
                        ? 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-[#4338ca] hover:bg-[#3730a3] text-white border border-[#3730a3] shadow-sm',
                    )}
                  >
                    {voidMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : voidDisabled ? (
                      <Lock className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <Ban className="size-4 shrink-0" />
                    )}
                    <span>Void Ticket</span>
                  </button>
                  <p className="px-1 text-center text-[11px] font-medium text-muted-foreground">
                    {!hasPnr
                      ? 'Requires active PNR'
                      : !supportsVoid
                        ? `${provider || 'Supplier'} has no void window`
                        : terminal || locked
                          ? 'Locked'
                          : held || !issued
                            ? 'Available after issue (held PNRs use Cancel)'
                            : 'Cancel pre-issue (no fare penalty)'}
                  </p>
                </div>

                {/* 3. Cancel Booking (Solid Crimson Red with inline styles to override any ambient CSS) */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={cancelDisabled || busy}
                    onClick={() => setCancelOpen(true)}
                    style={
                      cancelDisabled || busy
                        ? undefined
                        : { backgroundColor: '#dc2626', color: '#ffffff' }
                    }
                    className={cn(
                      'w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2',
                      cancelDisabled || busy
                        ? 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-[#dc2626] hover:bg-[#b91c1c] text-white border border-[#b91c1c] shadow-sm',
                    )}
                  >
                    {cancelDisabled ? (
                      <Lock className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <CircleX className="size-4 shrink-0" />
                    )}
                    <span>Cancel Booking</span>
                  </button>
                  <p className="px-1 text-center text-[11px] font-medium text-muted-foreground">
                    {terminal || locked
                      ? `Locked: ${bookingStatusLabel(data.localStatus)}`
                      : 'Fare rule cancellation & refund calculation'}
                  </p>
                </div>

                {/* 4. Refund Request (Solid Amber with inline styles to override any ambient CSS) */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={refundDisabled || busy}
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Request refund?',
                          message: 'Request supplier refund for this booking?',
                          confirmLabel: 'Request refund',
                          destructive: false,
                        })
                      ) {
                        refundMutation.mutate();
                      }
                    }}
                    style={
                      refundDisabled || busy
                        ? undefined
                        : { backgroundColor: '#d97706', color: '#ffffff' }
                    }
                    className={cn(
                      'w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2',
                      refundDisabled || busy
                        ? 'cursor-not-allowed border border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        : 'bg-[#d97706] hover:bg-[#b45309] text-white border border-[#b45309] shadow-sm',
                    )}
                  >
                    {refundMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : refundDisabled ? (
                      <Lock className="size-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <RefreshCcw className="size-4 shrink-0" />
                    )}
                    <span>Refund Request</span>
                  </button>
                  <p className="px-1 text-center text-[11px] font-medium text-muted-foreground">
                    {!hasPnr ? 'Requires active PNR' : terminal || locked ? 'Locked' : 'Initiate supplier refund claim'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Financial Intelligence KPI Deck ── */}
          <section aria-label="Financial Intelligence" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Tile 1: Charged Total */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Charged Total
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <Wallet className="size-4" />
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {data.amount != null ? formatCurrency(data.amount, data.currency, decimalsMap) : '—'}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{data.currency}</span>
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
                <span className="text-muted-foreground">Payment Status</span>
                <span
                  className={cn(
                    'font-bold',
                    isPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {data.paymentStatus ?? 'UNPAID'}
                </span>
              </div>
            </div>

            {/* Tile 2: Supplier Base Cost */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Supplier Base Fare
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <Plane className="size-4" />
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {data.baseAmount != null ? formatCurrency(data.baseAmount, data.currency, decimalsMap) : '—'}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{data.currency}</span>
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                <span>Cost Provider</span>
                <span className="font-semibold capitalize text-foreground">{provider || 'Supplier'}</span>
              </div>
            </div>

            {/* Tile 3: Platform Margin / Markup (Computed correctly from charged - base) */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Platform Margin
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400">
                  <TrendingUp className="size-4" />
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {computedMargin > 0
                  ? formatCurrency(computedMargin, data.currency, decimalsMap)
                  : data.markupAmount != null
                    ? formatCurrency(data.markupAmount, data.currency, decimalsMap)
                    : '0.00'}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{data.currency}</span>
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs">
                <span className="text-muted-foreground">Markup Yield</span>
                <span className="font-bold text-violet-600 dark:text-violet-400">
                  {marginPercentage != null ? `+${marginPercentage}% net margin` : 'Standard markup'}
                </span>
              </div>
            </div>

            {/* Tile 4: Booking Status */}
            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Lifecycle Status
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                  <ShieldCheck className="size-4" />
                </span>
              </div>
              <div className="mt-2">
                <StatusPill status={data.localStatus} />
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                <span>Hold State</span>
                <span className="font-semibold text-foreground">{countdown ?? 'Normal'}</span>
              </div>
            </div>
          </section>

          {/* ── Section 3: Passenger Dossiers & Policy Ledger ── */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
            {/* Left 3 Columns: Passenger Dossiers (Zero Form Inputs) */}
            <section
              aria-label="Passenger Dossiers"
              className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs lg:col-span-3"
            >
              <header className="flex items-center justify-between border-b border-border/70 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-brand-teal" />
                  <h2 className="text-sm font-bold text-foreground">Passenger Dossiers</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    {travelers.length || 1}
                  </span>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Verified Travel Snapshot</span>
              </header>

              <div className="p-6 space-y-4">
                {travelers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No passenger snapshot stored for this booking.</p>
                ) : (
                  travelers.map((t: Record<string, any>, i: number) => {
                    const isChild = t.passengerTypeCode === 'CHD' || t.passengerTypeCode === 'child';
                    const isInfant = t.passengerTypeCode === 'INF' || t.passengerTypeCode === 'infant';
                    const passengerTypeLabel = isChild ? 'Child' : isInfant ? 'Infant' : 'Adult';
                    const fullName =
                      [t.givenName ?? t.firstName, t.surname ?? t.lastName].filter(Boolean).join(' ') ||
                      `Passenger ${i + 1}`;
                    const titleLabel =
                      t.gender === 'male' || t.gender === 'M'
                        ? 'Mr'
                        : t.gender === 'female' || t.gender === 'F'
                          ? 'Ms'
                          : (t.title ?? 'Mr');

                    return (
                      <div
                        key={i}
                        className="rounded-xl border border-border/80 bg-muted/20 p-5 shadow-2xs"
                      >
                        {/* Passenger Card Header */}
                        <div className="flex flex-wrap items-center justify-between border-b border-border/60 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-9 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white shadow-2xs">
                              {fullName.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-foreground">{fullName}</p>
                              <p className="text-xs text-muted-foreground">
                                {titleLabel} • {passengerTypeLabel}
                              </p>
                            </div>
                          </div>
                          <span className="rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-bold text-brand-teal dark:bg-brand-teal/20 dark:text-teal-300">
                            {passengerTypeLabel} {i + 1}
                          </span>
                        </div>

                        {/* Structured Display Grid with Helpful Icons */}
                        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2 text-xs">
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <FileText className="size-3.5 text-muted-foreground/70" />
                              <span>Document / Passport ID</span>
                            </dt>
                            <dd className="mt-1 font-mono font-semibold text-foreground">
                              {t.passportNumber ?? t.documentNumber ?? t.idNumber ?? '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="size-3.5 text-muted-foreground/70" />
                              <span>Passport Expiry</span>
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                              {t.passportExpiry ? fmtDateTime(t.passportExpiry).split(',')[0] : (t.documentExpiry ?? '—')}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="size-3.5 text-muted-foreground/70" />
                              <span>Date of Birth</span>
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                              {t.birthDate ? fmtDateTime(t.birthDate).split(',')[0] : (t.dob ?? '—')}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <Globe className="size-3.5 text-muted-foreground/70" />
                              <span>Nationality</span>
                            </dt>
                            <dd className="mt-1 font-semibold text-foreground">
                              {t.nationality ?? t.countryCode ?? '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="size-3.5 text-muted-foreground/70" />
                              <span>Contact Email</span>
                            </dt>
                            <dd className="mt-1 font-medium text-foreground truncate">
                              {t.email ?? '—'}
                            </dd>
                          </div>
                          <div>
                            <dt className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="size-3.5 text-muted-foreground/70" />
                              <span>Contact Phone</span>
                            </dt>
                            <dd className="mt-1 font-medium text-foreground">
                              {t.phoneNumber ?? t.phone ?? '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {/* Right 2 Columns: Policy, Cancellation & Audit Ledger */}
            <div className="space-y-6 lg:col-span-2">
              {/* Cancellation Details & Notes Card */}
              <section
                aria-label="Cancellation & Policy"
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
              >
                <header className="border-b border-border/70 px-5 py-3.5">
                  <h2 className="text-sm font-bold text-foreground">Cancellation &amp; Policy</h2>
                </header>

                <div className="p-5 space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-border/60 pb-3">
                    <span className="text-muted-foreground">Cancellation Status</span>
                    <span
                      className={cn(
                        'font-bold',
                        terminal
                          ? 'text-rose-600 dark:text-rose-400'
                          : locked
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-foreground',
                      )}
                    >
                      {status === 'cancelled' || status === 'canceled'
                        ? 'Cancelled'
                        : status === 'voided'
                          ? 'Voided'
                          : status === 'cancellation_requested'
                            ? 'Cancellation Pending'
                            : status === 'refund_requested'
                              ? 'Refund Pending'
                              : 'Active / No Cancellation'}
                    </span>
                  </div>

                  {data.message && (
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                      <p className="font-bold text-foreground">Latest Supplier / System Note:</p>
                      <p className="mt-1 leading-relaxed text-muted-foreground">{data.message}</p>
                    </div>
                  )}

                  {summary.cancellationReason && (
                    <div>
                      <span className="text-muted-foreground">Recorded Reason:</span>
                      <p className="mt-0.5 font-medium text-foreground">{String(summary.cancellationReason)}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* Audit & Verification Card */}
              <section
                aria-label="Audit & Verification"
                className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
              >
                <header className="flex items-center gap-2 border-b border-border/70 px-5 py-3.5">
                  <ShieldCheck className="size-4 text-brand-teal" />
                  <h2 className="text-sm font-bold text-foreground">Audit &amp; Operations Trail</h2>
                </header>

                <dl className="divide-y divide-border/60 px-5 text-xs">
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">Supplier Booking ID</dt>
                    <dd className="flex items-center gap-1.5 font-mono font-medium text-foreground">
                      <span className="truncate max-w-[140px] sm:max-w-[180px]">
                        {data.supplierBookingId ?? '—'}
                      </span>
                      {data.supplierBookingId && (
                        <button
                          type="button"
                          onClick={() => copySupplierId(data.supplierBookingId!)}
                          aria-label="Copy Supplier Booking ID"
                          className="inline-flex cursor-pointer items-center text-muted-foreground hover:text-foreground"
                        >
                          {copiedSupplierId ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      )}
                    </dd>
                  </div>
                  {summary.adminIssuedBy && (
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Admin Issuer</dt>
                      <dd className="font-mono text-[11px] text-foreground">{String(summary.adminIssuedBy).slice(0, 10)}…</dd>
                    </div>
                  )}
                  {summary.adminIssuedAt && (
                    <div className="flex items-center justify-between py-3">
                      <dt className="text-muted-foreground">Issued Timestamp</dt>
                      <dd className="text-foreground">{fmtDateTime(String(summary.adminIssuedAt))}</dd>
                    </div>
                  )}
                  {summary.realFailure && (
                    <div className="py-3">
                      <dt className="text-rose-600 dark:text-rose-400 font-semibold">Supplier Failure Notice</dt>
                      <dd className="mt-1 text-muted-foreground">
                        {String((summary.realFailure as Record<string, unknown>)?.message ?? 'See system logs')}
                      </dd>
                    </div>
                  )}
                  <div className="flex items-center justify-between py-3">
                    <dt className="text-muted-foreground">Last Supplier Sync</dt>
                    <dd className="text-foreground">{fmtDateTime(data.liveFetchedAt)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>

          {cancelOpen && (
            <CancelBookingModal
              booking={{ id: data.bookingId, type: 'flight', provider: data.provider, pnr: data.locatorCode, user: null }}
              onClose={() => {
                setCancelOpen(false);
                invalidate();
              }}
            />
          )}
        </motion.div>
      )}
    </div>
  );
}

function ManageRouter() {
  const params = useParams();
  const search = useSearchParams();
  const bookingId = params.bookingId as string;
  if (search.get('type') === 'hotel') {
    return <HotelWorkspace bookingId={bookingId} />;
  }
  return <ManagePageInner />;
}

export default function BookingManagePage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.BOOKINGS_READ]}>
      <Suspense fallback={<div className="h-44 animate-pulse rounded-2xl bg-muted" />}>
        <ManageRouter />
      </Suspense>
    </RequirePagePermission>
  );
}
