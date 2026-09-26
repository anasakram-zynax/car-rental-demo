'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useToast } from '@/hooks/useToast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { CancelBookingModal } from '@/components/admin/bookings/cancel-booking-modal';
import type { AdminBookingDetail } from '@/components/admin/bookings/booking-detail-modal';
import { adminIssueBooking } from '@/features/admin/api/admin-bookings';
import { bookingStatusLabel } from '@/lib/utils/booking-status-label';
import { formatCurrency } from '@/lib/utils/currency';
import { useCurrencyData } from '@/context/CurrencyContext';
import { cn } from '@/lib/cn';
import {
  ArrowLeft,
  BedDouble,
  Building2,
  Calendar,
  Check,
  CircleX,
  Copy,
  FileText,
  Loader2,
  Lock,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  User,
  Users,
  Wallet,
} from 'lucide-react';
import { StatusPill } from './status-ui';

const TERMINAL = new Set(['cancelled', 'canceled', 'failed', 'refunded']);
const LOCKED = new Set(['refund_pending', 'refund_requested', 'cancellation_requested']);

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
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

/**
 * Hotel booking workspace — Option A Operations Command Center (No fake input fields).
 */
export function HotelWorkspace({ bookingId }: { bookingId: string }) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();
  const reducedMotion = useReducedMotion();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const detailKey = ['admin', 'booking-detail', 'full', bookingId] as const;
  const { data, isPending, error, refetch, isFetching } = useApiQuery<AdminBookingDetail>(
    [...detailKey],
    `/admin/bookings/${bookingId}/detail`,
    { requestOptions: { auth: true }, retry: 1 },
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [...detailKey] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
  };

  const issueMutation = useMutation({
    mutationFn: () => adminIssueBooking(bookingId),
    onSuccess: (res: any) => {
      toasts.success('Booking issued', res.reference ? `Ref ${res.reference}` : 'Supplier booking created.');
      invalidate();
    },
    onError: (err: any) => toasts.error('Issue failed', err?.message ?? 'Supplier booking failed.'),
  });
  const busy = issueMutation.isPending;

  const status = (data?.localStatus ?? '').toLowerCase();
  const terminal = TERMINAL.has(status) || status === 'refunded';
  const locked = LOCKED.has(status);
  const issued = status === 'booked' || status === 'confirmed';
  const reference = data?.reference ?? data?.live?.reference ?? null;
  const hasRef = !!reference;

  const issueDisabled = !data || issued || terminal || locked;
  const cancelDisabled = !data || terminal || locked;

  const copyRef = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = reference;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const policies = data?.rateSnapshot?.cancellationPolicies ?? [];
  const paxes = Array.isArray(data?.paxes) ? data.paxes : [];
  const holderName = data?.holder?.name ?? (paxes[0]?.name ?? '');
  const holderSurname = data?.holder?.surname ?? (paxes[0]?.surname ?? '');
  const isPaid = (data?.paymentStatus ?? '').toUpperCase() === 'PAID';
  const invoiceNumber = reference || data?.bookingId || bookingId;
  const firstRoom = data?.live?.rooms?.[0];
  const roomName = (data as any)?.roomName ?? firstRoom?.name ?? 'Standard Room';
  const boardName = (data as any)?.boardName ?? firstRoom?.rates?.[0]?.boardName ?? 'Room Only (RO)';
  const roomsCount = (data as any)?.roomsCount ?? data?.live?.rooms?.length ?? 1;
  const nightsCount = data?.nightCount ?? 1;

  // Compute margin & yield
  const charged = data?.amount ?? 0;
  const base = data?.supplierAmount ?? 0;
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
                Hotel Booking Operations
              </h1>
              <StatusPill status={data?.localStatus ?? 'unknown'} />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Invoice <span className="font-semibold text-foreground">{invoiceNumber}</span>
              {' • '}
              Supplier <span className="font-semibold capitalize text-foreground">{data?.provider ?? 'Hotelbeds'}</span>
              {data?.hotelName && (
                <>
                  {' • '}
                  <span className="font-semibold text-brand-teal dark:text-teal-400">{data.hotelName}</span>
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
          <p className="text-sm font-medium text-foreground">Hotel workspace could not load this record</p>
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
          {/* ── Section 1: Hotel Stay Voucher & Operations Console ── */}
          <section
            aria-label="Hotel Stay Voucher & Operations Console"
            className="overflow-hidden rounded-3xl border border-emerald-900/40 bg-card shadow-md dark:border-emerald-700/40"
          >
            {/* Voucher Top Ribbon */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/40 bg-gradient-to-r from-[#062c21] via-[#022321] to-[#0b1b2b] px-6 py-3.5 text-white sm:px-8">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/40">
                  <BedDouble className="size-4" />
                </span>
                <span className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
                  Official Hotel Stay Voucher • Guest Confirmation Pass
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2.5 py-1 text-emerald-200 ring-1 ring-emerald-700/50">
                  <Calendar className="size-3 text-emerald-300" />
                  {data.nightCount ?? 1} Night{(data.nightCount ?? 1) > 1 ? 's' : ''} Stay
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/80 px-2.5 py-1 text-slate-300 ring-1 ring-slate-700">
                  <Building2 className="size-3 text-slate-400" />
                  {(data.provider ?? 'Hotelbeds').toUpperCase()}
                </span>
              </div>
            </div>

            {/* Voucher Body (Stay Pass + Perforated Stub) */}
            <div className="grid grid-cols-1 divide-y divide-border/60 lg:grid-cols-12 lg:divide-y-0">
              {/* Left Main Voucher: Property & Stay Schedule Deck (8 Cols) */}
              <div className="space-y-6 p-6 sm:p-8 lg:col-span-8">
                {/* Property & Stay Timeline Hero */}
                <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-muted/20 p-5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
                  {/* Check-In */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Check-In
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                        {data.checkIn ? fmtDateTime(data.checkIn).split(',')[0] : '···'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-brand-teal dark:text-teal-400">
                      From 14:00 PM
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Early arrival subject to hotel availability
                    </p>
                  </div>

                  {/* Stay Duration Track & Property Name */}
                  <div className="my-2 flex flex-1 flex-col items-center justify-center px-4 sm:my-0">
                    <div className="flex max-w-[220px] items-center justify-center gap-1.5 text-center text-xs font-extrabold text-foreground">
                      <Building2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate">{data.hotelName ?? 'Hotel Property'}</span>
                    </div>
                    <div className="relative my-2 flex w-full max-w-[180px] items-center justify-center">
                      <div className="h-0.5 w-full border-t-2 border-dashed border-emerald-500/50" />
                      <div className="absolute flex size-8 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 shadow-xs dark:bg-emerald-950 dark:text-emerald-400">
                        <BedDouble className="size-4" />
                      </div>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {data.nightCount ?? 1} Night{(data.nightCount ?? 1) > 1 ? 's' : ''} Stay
                    </span>
                  </div>

                  {/* Check-Out */}
                  <div className="space-y-1 sm:text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Check-Out
                    </span>
                    <div className="flex items-baseline gap-2 sm:justify-end">
                      <span className="font-mono text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                        {data.checkOut ? fmtDateTime(data.checkOut).split(',')[0] : '···'}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-brand-teal dark:text-teal-400">
                      Until 11:00 AM
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Keycard return & express check-out
                    </p>
                  </div>
                </div>

                {/* 4 Stay Spec Grid Cells */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <User className="size-3 text-brand-teal" />
                      Lead Guest
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {[holderName, holderSurname].filter(Boolean).join(' ') || 'Primary Guest'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {paxes.length > 1 ? `+${paxes.length - 1} more guest(s)` : 'Lead Passenger'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <BedDouble className="size-3 text-brand-teal" />
                      Room Type
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {roomName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {roomsCount} Room{roomsCount > 1 ? 's' : ''} Reserved
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Sparkles className="size-3 text-brand-teal" />
                      Board Basis
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {boardName}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Confirmed Meal Plan
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <Users className="size-3 text-brand-teal" />
                      Occupancy
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-foreground">
                      {paxes.length || 1} Guest{paxes.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Adults & Registered Minors
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Tear-Off Stay Pass Stub with Notch (4 Cols) */}
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
                  {/* Voucher Ref Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Confirmation Reference
                      </span>
                      <StatusPill status={data.localStatus} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="font-mono text-3xl font-extrabold tracking-wider text-foreground">
                        {reference ?? 'NOT ISSUED'}
                      </span>
                      {hasRef && (
                        <button
                          type="button"
                          onClick={copyRef}
                          aria-label="Copy reference"
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:bg-accent"
                        >
                          {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                          <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Booking Metadata Card */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-card p-3 shadow-2xs">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Stay Schedule</span>
                      <span className="font-bold text-foreground">
                        {data.nightCount ?? 1} Night{(data.nightCount ?? 1) > 1 ? 's' : ''}
                        {nightsCount} Night{nightsCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-muted-foreground">Rooms & Capacity</span>
                      <span className="font-bold text-foreground">
                        {roomsCount} Room{roomsCount > 1 ? 's' : ''} • {paxes.length || 1} Guest{paxes.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="border-t border-border/60 pt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Booked</span>
                      <span>{fmtDateTime(data.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Stay Voucher Barcode */}
                <div className="mt-5 pt-3 border-t border-dashed border-border/70">
                  <TicketBarcode code={`VCHR • ${reference ?? data.bookingId}`} />
                </div>
              </div>
            </div>

            {/* Attached High-Contrast Operations Console Bar */}
            <div className="border-t border-border/80 bg-muted/40 p-6 sm:px-8">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-teal" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                  Hotel Lifecycle Actions Deck
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 1. Issue Booking */}
                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={issueDisabled || busy}
                    onClick={async () => {
                      if (
                        await confirmDialog({
                          title: 'Issue hotel booking?',
                          message: `Issue hotel booking${reference ? ` ${reference}` : ''}? This confirms with the supplier.`,
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
                      ? 'Already confirmed with supplier'
                      : terminal || locked
                        ? `Locked: ${bookingStatusLabel(data.localStatus)}`
                        : 'Confirm and issue with hotel supplier'}
                  </p>
                </div>

                {/* 2. Cancel Booking (Solid Crimson Red with inline styles to override any ambient CSS) */}
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
                      : 'Cancel booking per rate cancellation rules'}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 2: Financial Intelligence KPI Deck ── */}
          <section aria-label="Financial Intelligence" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

            <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Supplier Base Net
                </span>
                <span className="flex size-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400">
                  <BedDouble className="size-4" />
                </span>
              </div>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-foreground">
                {data.supplierAmount != null ? formatCurrency(data.supplierAmount, data.currency, decimalsMap) : '—'}
                <span className="ml-1.5 text-xs font-semibold text-muted-foreground">{data.currency}</span>
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                <span>Supplier Status</span>
                <span className="font-semibold text-foreground">{data.localSupplierStatus ?? 'CONFIRMED'}</span>
              </div>
            </div>

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
                <span>Nights</span>
                <span className="font-semibold text-foreground">{data.nightCount ?? 1} nights</span>
              </div>
            </div>
          </section>

          {/* ── Section 3: Guests & Policy Deck ── */}
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
            <section
              aria-label="Guests Dossiers"
              className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs lg:col-span-3"
            >
              <header className="flex items-center justify-between border-b border-border/70 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-brand-teal" />
                  <h2 className="text-sm font-bold text-foreground">Guests Dossiers</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                    {paxes.length || 1}
                  </span>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Guest Roster</span>
              </header>

              <div className="p-6 space-y-4">
                {(paxes.length > 0 ? paxes : [{ name: holderName, surname: holderSurname, type: 'ADULT' }]).map(
                  (p: any, i: number) => {
                    const guestType = String(p.type ?? 'ADULT').toUpperCase();
                    const isChild = guestType === 'CHILD' || guestType === 'CHD';
                    const guestTypeLabel = isChild ? 'Child' : 'Adult';
                    const fullName = [p.name, p.surname].filter(Boolean).join(' ') || `Guest ${i + 1}`;

                    return (
                      <div
                        key={i}
                        className="rounded-xl border border-border/80 bg-muted/20 p-5 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between border-b border-border/60 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="flex size-8 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                              {fullName.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <p className="text-sm font-bold text-foreground">{fullName}</p>
                              <p className="text-xs text-muted-foreground">Mr / Ms • {guestTypeLabel}</p>
                            </div>
                          </div>
                          <span className="rounded-full bg-brand-teal/10 px-2.5 py-1 text-xs font-bold text-brand-teal dark:bg-brand-teal/20 dark:text-teal-300">
                            {guestTypeLabel} {i + 1}
                          </span>
                        </div>

                        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">First Name</dt>
                            <dd className="mt-0.5 font-semibold text-foreground">{p.name || '—'}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Last Name</dt>
                            <dd className="mt-0.5 font-semibold text-foreground">{p.surname || '—'}</dd>
                          </div>
                        </dl>
                      </div>
                    );
                  },
                )}
              </div>
            </section>

            {/* Right 2 Columns: Policy & Audit Trail */}
            <div className="space-y-6 lg:col-span-2">
              <section
                aria-label="Cancellation Policy"
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
                      {terminal ? 'Cancelled' : locked ? 'Cancellation Pending' : 'Active / Confirmed'}
                    </span>
                  </div>

                  {data.cancelEstimate && (
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                      <p className="font-bold text-foreground">Estimated Refund:</p>
                      <p className="mt-0.5 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(data.cancelEstimate.refundAmount, data.cancelEstimate.currency, decimalsMap)}
                      </p>
                      {data.cancelEstimate.policyDescription && (
                        <p className="mt-1 text-muted-foreground leading-relaxed">
                          {data.cancelEstimate.policyDescription}
                        </p>
                      )}
                    </div>
                  )}

                  {policies.length > 0 && (
                    <div>
                      <p className="font-bold text-foreground mb-2">Policy Tiers:</p>
                      <ul className="space-y-1.5">
                        {policies.map((p: any, i: number) => (
                          <li key={i} className="rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px]">
                            {p.amount != null && p.amount !== '' ? (
                              <>Penalty: <strong className="tabular-nums">{String(p.amount)}</strong></>
                            ) : (
                              <strong className="text-emerald-600 dark:text-emerald-400">Free cancellation</strong>
                            )}
                            {p.from && <> from {fmtDateTime(String(p.from))}</>}
                            {p.to && <> until {fmtDateTime(String(p.to))}</>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>

              {/* Operations Trail */}
              {data.events.length > 0 && (
                <section
                  aria-label="Operations Trail"
                  className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs"
                >
                  <header className="flex items-center gap-2 border-b border-border/70 px-5 py-3.5">
                    <ShieldCheck className="size-4 text-brand-teal" />
                    <h2 className="text-sm font-bold text-foreground">Operations Trail</h2>
                  </header>

                  <ul className="divide-y divide-border/60 px-5 text-xs">
                    {data.events.slice(-5).reverse().map((e: any, i: number) => (
                      <li key={i} className="flex items-center justify-between py-3">
                        <span className="font-medium text-foreground">{String(e.type).replace(/_/g, ' ')}</span>
                        <span className="text-muted-foreground">{fmtDateTime(e.at)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>

          {cancelOpen && (
            <CancelBookingModal
              booking={{ id: data.bookingId, type: 'hotel', provider: data.provider ?? 'hotelbeds', pnr: data.reference, user: null }}
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
