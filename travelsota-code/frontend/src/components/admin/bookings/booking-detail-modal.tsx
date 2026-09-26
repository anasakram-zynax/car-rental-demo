"use client";

// Admin booking detail modal — "operations inspector" design.
// Fetches the local snapshot (`/admin/bookings/:id/detail`) for instant
// open. Refresh fans out explicitly: POST sync-supplier, then refetch.
// Provenance badge shows LIVE only after a live fetch succeeded.
//
// Craft notes (impeccable · operate):
// - Slate + indigo inspector palette — distinct from page chrome, calm base,
//   one accent doing all structural work
// - Money/dates/timers in tabular figures — zero layout shift while loading
// - Single-column flow — nothing can clip; tables scroll horizontally
// - Polling card leads with a large countdown: time left in the current
//   4-hour window, with elapsed-window progress underneath

import { useEffect, useState, useCallback, useRef } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import { apiRequest } from "@/lib/api/client";
import {
  X,
  Database,
  RadioTower,
  CalendarDays,
  User,
  Wallet,
  BedDouble,
  ScrollText,
  History,
  RefreshCw,
  Timer,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileClock,
  TimerReset,
} from "lucide-react";
import Image from "next/image";
import { formatPolicyDate } from "@/lib/filters/hotel-filters";
import type { CancelModalBooking } from "./cancel-booking-modal";
import { formatCurrency } from "@/lib/utils/currency";
import { useCurrencyData } from "@/context/CurrencyContext";

interface PollHistoryEntry {
  at: string;
  status: "pending" | "received" | "failed";
  hcn: string | null;
  providerRef: string | null;
  error: string | null;
  nextCheckAt: string | null;
}

export interface AdminBookingDetail {
  bookingId: string;
  reference: string | null;
  provider?: string | null;
  localStatus: string;
  localSupplierStatus: string | null;
  amount: number | null;
  supplierAmount: number | null;
  markupAmount?: number | null;
  customerAmount?: number | null;
  currency: string;
  paymentStatus: string | null;
  createdAt: string;
  holder: { name?: string; surname?: string } | null;
  paxes: Array<{ name?: string; surname?: string; type?: string }> | null;
  hotelName: string | null;
  hotelImage: string | null;
  checkIn: string | null;
  checkOut: string | null;
  rateSnapshot: { cancellationPolicies?: Array<{ amount?: string | number; from?: string; to?: string; percentage?: string | number; numberOfNights?: number }> } | null;
  events: Array<{ type: string; at: string; detail?: unknown }>;
  cancelEstimate: {
    cancellationFee: number;
    refundAmount: number;
    totalAmount: number;
    currency: string;
    isFreeCancellation: boolean;
    policyDescription: string | null;
    upcomingFee?: number;
    upcomingFeeFrom?: string;
    upcomingFeeDescription?: string | null;
  } | null;
  live: {
    reference?: string | null;
    status?: string | null;
    holder?: { name?: string; surname?: string } | null;
    hotel?: {
      hotelId?: number | string;
      name?: string | null;
      checkIn?: string | null;
      checkOut?: string | null;
      destinationName?: string | null;
      zoneName?: string | null;
    } | null;
    rooms?: Array<{
      id?: number | string;
      name?: string;
      status?: string;
      paxes?: Array<{ type?: string; name?: string; surname?: string }>;
      rates?: Array<{
        rateClass?: string;
        net?: string | number;
        boardName?: string;
        cancellationPolicies?: Array<{ amount?: string | number; from?: string; to?: string; percentage?: string | number; numberOfNights?: number }>;
      }>;
    }>;
    price?: { totalNet?: string | number | null; currency?: string | null } | null;
    cancellationAllowed?: boolean;
    modificationAllowed?: boolean;
  } | null;
  liveError: string | null;
  liveSkipped: boolean;
  /** True for fake-reference (demo) bookings that have no supplier order. */
  demoBooking?: boolean;
  liveFetchedAt: string;
  partnerOrderId: string | null;
  supplierOrderId: string | null;
  hotelConfirmationStatus: string | null;
  hotelConfirmationNumber: string | null;
  hotelConfirmationAttempts: number;
  hotelConfirmationLastCheckedAt: string | null;
  hotelConfirmationNextCheckAt: string | null;
  pollHistory: PollHistoryEntry[];
  nightCount: number | null;
}

/* ── primitives ─────────────────────────────────────────────── */

const POLL_WINDOW_MS = 4 * 60 * 60 * 1000; // 4h — mirrors backend fixed interval

type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

function badgeTone(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  const s = String(status).toUpperCase();
  if (["CONFIRMED", "BOOKED", "PAID", "RECEIVED", "COMPLETED"].includes(s)) return "success";
  if (["CANCELLED", "CANCELED", "FAILED", "ERROR", "REFUNDED"].includes(s)) return "danger";
  if (["PENDING", "PROCESSING", "HELD", "BOOKING_IN_PROGRESS", "AWAITING"].includes(s)) return "warning";
  if (["ACCEPTED", "AUTHORIZED", "RUNNING"].includes(s)) return "info";
  return "neutral";
}

const badgeToneStyles: Record<BadgeTone, { pill: string; dot: string }> = {
  success: {
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/60",
    dot: "bg-emerald-500",
  },
  warning: {
    pill: "bg-amber-50 text-amber-700 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/60",
    dot: "bg-amber-500",
  },
  danger: {
    pill: "bg-rose-50 text-rose-700 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/60",
    dot: "bg-rose-500",
  },
  info: {
    pill: "bg-sky-50 text-sky-700 ring-sky-200/70 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/60",
    dot: "bg-sky-500",
  },
  neutral: {
    pill: "bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700/60",
    dot: "bg-slate-400",
  },
};

/** Pill badge with a leading status dot — one component for every status. */
function Badge({ status, label }: { status: string | null | undefined; label?: string }) {
  if (!status) return <span className="text-sm text-slate-300 dark:text-slate-600">—</span>;
  const tone = badgeToneStyles[badgeTone(status)];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ${tone.pill}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {label ?? status}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
      <span className="text-indigo-400 dark:text-indigo-500">{icon}</span>
      {children}
    </p>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">{value ?? "—"}</span>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  changed: "Booking changed",
  change_simulated: "Change simulated",
  cancel_requested: "Cancellation requested",
  sync: "Supplier synced",
};

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

// Deliberately does NOT convert to the admin's selected display currency —
// this is an operations inspector showing the actual transaction amount/
// currency as recorded, not a converted display value. Only the decimal
// formatting is centralized (was a hardcoded .toFixed(2), wrong for
// 3-decimal currencies like KWD/BHD/OMR).
function Money({ amount, currency, className = "" }: { amount: number | string | null | undefined; currency?: string | null; className?: string }) {
  const { decimalsMap } = useCurrencyData();
  if (amount == null) return <span className="text-slate-400">—</span>;
  return (
    <span className={`tabular-nums ${className}`}>
      {typeof amount === "number" ? formatCurrency(amount, currency ?? "USD", decimalsMap) : amount}
      {currency ? <span className="ml-1 text-[0.85em] font-medium opacity-70">{currency}</span> : null}
    </span>
  );
}

/** H:MM:SS countdown text from milliseconds. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ── RateHawk polling section ───────────────────────────────── */

const MAX_ATTEMPTS = 42; // ~7 days at the default fixed 4h interval

function RateHawkPollingSection({
  data,
  refetch,
}: {
  data: AdminBookingDetail;
  refetch: () => void;
}) {
  const [polling, setPolling] = useState(false);
  const [pollResult, setPollResult] = useState<string | null>(null);
  // { remainingMs, elapsedPct } — remaining time in the current polling window
  const [timer, setTimer] = useState<{ remainingMs: number; elapsedPct: number } | null>(null);
  const firedRef = useRef(false);

  const nextCheckAt = data.hotelConfirmationNextCheckAt;
  const lastCheckedAt = data.hotelConfirmationLastCheckedAt;
  const attempts = data.hotelConfirmationAttempts;
  const status = data.hotelConfirmationStatus;
  const hcn = data.hotelConfirmationNumber;

  // Live countdown to the next scheduled poll. When the timer expires we
  // auto-refetch once — the backend cron runs every minute, so the new
  // next-check timestamp (and a fresh window) lands on screen.
  useEffect(() => {
    if (!nextCheckAt || status === "received") {
      setTimer(null);
      firedRef.current = false;
      return;
    }
    const target = new Date(nextCheckAt).getTime();
    const start = lastCheckedAt ? new Date(lastCheckedAt).getTime() : target - POLL_WINDOW_MS;
    const span = Math.max(60_000, target - start); // window length; ≥1min guard
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimer({ remainingMs: 0, elapsedPct: 100 });
        if (!firedRef.current) {
          firedRef.current = true;
          setTimeout(() => refetch(), 1500);
        }
        return;
      }
      firedRef.current = false;
      setTimer({
        remainingMs: diff,
        elapsedPct: Math.min(100, Math.max(0, ((span - diff) / span) * 100)),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextCheckAt, lastCheckedAt, status, refetch]);

  const handlePollNow = useCallback(async () => {
    setPolling(true);
    setPollResult(null);
    try {
      const res = await apiRequest<{ data: { status: string; hotelConfirmationNumber: string | null; message: string } }>(
        `/admin/bookings/${data.bookingId}/poll-confirmation`,
        { method: "POST" },
      );
      const result = (res as any)?.data ?? res;
      setPollResult(result.message ?? "Poll completed.");
      refetch();
    } catch (err: any) {
      setPollResult(err?.message ?? "Poll failed.");
    } finally {
      setPolling(false);
    }
  }, [data.bookingId, refetch]);

  const isReceived = status === "received";
  const isFailed = status === "failed";
  const pollHistory = (data.pollHistory ?? []).slice().reverse();

  return (
    <Card className="overflow-hidden">
      {/* Card header band */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
        <SectionLabel icon={<RadioTower className="size-3" />}>Confirmation polling</SectionLabel>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">Fixed 4h window · up to ~7 days</span>
      </div>

      <div className="p-4">
        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
          isReceived
            ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
            : isFailed
              ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
              : "border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/30"
        }`}>
          {isReceived ? (
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : isFailed ? (
            <AlertCircle className="size-5 shrink-0 text-rose-600 dark:text-rose-400" />
          ) : (
            <Timer className="size-5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {isReceived
                ? "Confirmed by hotel"
                : isFailed
                  ? "Check failed"
                  : "Awaiting hotel confirmation"}
            </p>
            {hcn && (
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                HCN: <span className="font-mono font-medium">{hcn}</span>
              </p>
            )}
          </div>
          {!isReceived && (
            <button
              onClick={handlePollNow}
              disabled={polling}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.97] disabled:opacity-50"
            >
              {polling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <TimerReset className="size-3.5" />
              )}
              {polling ? "Polling…" : "Poll now"}
            </button>
          )}
        </div>

        {pollResult && (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {pollResult}
          </div>
        )}

        {/* ── Countdown hero: time left in the current 4h window ── */}
        {isReceived ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/60 px-4 py-4 dark:border-emerald-800/60 dark:bg-emerald-950/20">
            <CheckCircle2 className="size-6 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Polling complete</p>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">Hotel confirmation received — no further polls scheduled.</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-4 dark:border-slate-800 dark:from-slate-800/60 dark:to-slate-900">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Next poll in
                </p>
                <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  {timer ? formatCountdown(timer.remainingMs) : "--:--:--"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Scheduled at</p>
                <p className="mt-1 text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">
                  {nextCheckAt ? formatEventTime(nextCheckAt) : "—"}
                </p>
              </div>
            </div>

            {/* Window progress: elapsed share of the current 4h window */}
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${timer ? timer.elapsedPct : 0}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] font-medium tabular-nums text-slate-400">
                <span>{lastCheckedAt ? `Polled ${formatEventTime(lastCheckedAt)}` : "Window start"}</span>
                <span>{timer ? `${Math.round(timer.elapsedPct)}% of window elapsed` : "—"}</span>
              </div>
            </div>
          </div>
        )}

        {/* Stats — 2 cols mobile, 4 cols desktop, never clipped */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attempts</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {attempts}<span className="text-xs font-normal text-slate-400"> / {MAX_ATTEMPTS}</span>
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Confirmation</p>
            <div className="mt-0.5"><Badge status={status} /></div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partner order</p>
            <p className="mt-0.5 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-300" title={data.partnerOrderId ?? ""}>
              {data.partnerOrderId ?? "—"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">ETG order</p>
            <p className="mt-0.5 truncate font-mono text-xs font-medium text-slate-700 dark:text-slate-300" title={data.supplierOrderId ?? ""}>
              {data.supplierOrderId ?? "—"}
            </p>
          </div>
        </div>

        {/* Poll history */}
        {pollHistory.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              <FileClock className="size-3 text-indigo-400 dark:text-indigo-500" />
              Poll history
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="w-full min-w-[520px] text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:bg-slate-800/50">
                    <th className="px-2.5 py-2 font-semibold">#</th>
                    <th className="px-2.5 py-2 font-semibold">When</th>
                    <th className="px-2.5 py-2 font-semibold">Status</th>
                    <th className="px-2.5 py-2 font-semibold">HCN</th>
                    <th className="px-2.5 py-2 font-semibold">Reference</th>
                    <th className="px-2.5 py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {pollHistory.map((entry, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 dark:border-slate-800/60">
                      <td className="px-2.5 py-2 tabular-nums text-slate-400">{pollHistory.length - i}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-600 dark:text-slate-400">
                        {formatEventTime(entry.at)}
                      </td>
                      <td className="px-2.5 py-2"><Badge status={entry.status} /></td>
                      <td className="max-w-[140px] truncate px-2.5 py-2 font-mono text-slate-700 dark:text-slate-300" title={entry.hcn ?? ""}>
                        {entry.hcn ?? "—"}
                      </td>
                      <td className="max-w-[140px] truncate px-2.5 py-2 font-mono text-slate-500 dark:text-slate-500" title={entry.providerRef ?? ""}>
                        {entry.providerRef ?? "—"}
                      </td>
                      <td className="px-2.5 py-2 text-slate-600 dark:text-slate-400">
                        {entry.status === "received"
                          ? "Confirmed"
                          : entry.status === "failed"
                            ? (entry.error ?? "Failed")
                            : entry.nextCheckAt
                              ? `Next: ${formatEventTime(entry.nextCheckAt)}`
                              : "Pending"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── modal ──────────────────────────────────────────────────── */

export function BookingDetailModal({
  booking,
  onClose,
}: {
  booking: CancelModalBooking;
  onClose: () => void;
}) {
  const { data, isPending, error, refetch, isFetching } = useApiQuery<AdminBookingDetail>(
    ["admin", "booking-detail", "full", booking.id],
    `/admin/bookings/${booking.id}/detail`,
    { requestOptions: { auth: true }, retry: 1 },
  );

  // Refresh fans out explicitly (detail itself is local-only now):
  // sync supplier first, then refetch. Sync failure still falls through
  // to the local snapshot below.
  const handleRefresh = useCallback(async () => {
    try {
      await apiRequest(`/admin/bookings/${booking.id}/sync-supplier`, {
        method: "POST",
        auth: true,
      });
    } catch {
      // Refetch below renders local state regardless.
    }
    await refetch();
  }, [booking.id, refetch]);

  // Escape-to-close (third escape route alongside X and backdrop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const live = data?.live;
  const reference = data?.reference ?? booking.supplierReference ?? booking.pnr;
  const isLive = !!data?.live;
  const est = data?.cancelEstimate ?? null;

  // Hotel name: live supplier → local snapshot. (Backend falls back to the
  // live retrieve's hotel name for RateHawk bookings without a snapshot.)
  const hotelDisplayName = live?.hotel?.name ?? data?.hotelName ?? "Hotel";

  // Authoritative total: customer charge / cancellation booking total, then local amount.
  const totalAmount = est?.totalAmount ?? data?.customerAmount ?? data?.amount ?? null;
  const nights = data?.nightCount ?? 1;
  const perNight = totalAmount != null && nights > 0 ? totalAmount / nights : null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-detail-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-800 dark:bg-slate-950"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header (sticky): identity, provenance, actions ── */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 id="booking-detail-title" className="truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                Booking
              </h3>
              {reference && (
                <span className="inline-flex shrink-0 items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  #{reference}
                </span>
              )}
              {isLive ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800"
                  title={`Fresh data from the supplier · fetched ${formatEventTime(data?.liveFetchedAt ?? "")}`}
                >
                  <RadioTower className="size-3" aria-hidden />
                  Live
                </span>
              ) : (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800"
                  title={data?.demoBooking ? "Demo booking — no supplier order exists; values come from the record and policies stored at booking time" : "Supplier unreachable — values come from the local snapshot stored at booking time"}
                >
                  <Database className="size-3" aria-hidden />
                  Local
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-400 dark:text-slate-500">
              {data?.demoBooking ? "Demo booking — local record, no live supplier order" : ""}
              {isLive && data?.liveFetchedAt ? `Supplier data synced ${formatEventTime(data.liveFetchedAt)}` : ""}
              {!isLive && data?.liveError ? "Supplier retrieve failed — showing the local record" : ""}
              {!isLive && !data?.liveError && data?.liveSkipped ? "Local snapshot — Refresh for live supplier data" : ""}
              {!isLive && !data?.liveError && !data?.liveSkipped ? "Awaiting supplier reference" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => handleRefresh()}
              disabled={isFetching}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              aria-label="Refresh booking detail"
              title="Re-fetch live data from the supplier"
            >
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
              aria-label="Close booking detail"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* ── Body: single-column scroll — nothing can clip ── */}
        {isPending ? (
          <div className="flex justify-center px-6 py-20" role="status" aria-label="Loading booking detail">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
          </div>
        ) : error || !data ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Unable to load this booking&apos;s detail.
            </p>
            {error ? <p className="mx-auto mt-1 max-w-md text-xs text-rose-500">{String(error)}</p> : null}
            <button
              onClick={() => refetch()}
              className="mt-4 cursor-pointer rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-6 pt-4">

            {/* ── Status rail ── */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Supplier</span>
              <Badge status={live?.status ?? data.localSupplierStatus} />
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Local</span>
              <Badge status={data.localStatus} />
              <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Payment</span>
              <Badge status={data.paymentStatus} />
            </div>

            {/* ── Provenance alerts ── */}
            {!isLive && data?.liveError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-800/60 dark:bg-rose-950/30">
                <Database className="mt-0.5 size-4 shrink-0 text-rose-500" aria-hidden />
                <p className="text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                  <strong className="font-semibold">Supplier retrieve failed.</strong>{" "}
                  {data.liveError} — showing the stored local record instead.
                </p>
              </div>
            )}
            {!isLive && !data?.liveError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/60 dark:bg-amber-950/30">
                <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  This booking has no supplier reference yet — payment may still be pending. Live supplier details will appear once confirmation completes.
                </p>
              </div>
            )}

            {/* ── Overview: property, stay, pricing ── */}
            <Card className="overflow-hidden">
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="relative h-40 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-auto sm:w-48 dark:bg-slate-800">
                  {data.hotelImage ? (
                    <Image
                      src={data.hotelImage}
                      alt={hotelDisplayName}
                      fill
                      sizes="(max-width: 640px) 100vw, 192px"
                      className="object-cover"
                      unoptimized
                      priority
                    />
                  ) : null}
                  {!data.hotelImage && (
                    <div className="absolute inset-0 flex items-center justify-center text-4xl font-black text-slate-300 dark:text-slate-600" aria-hidden>
                      {hotelDisplayName[0]}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1 px-4 pb-4 sm:py-4 sm:pl-0 sm:pr-4">
                  <SectionLabel icon={<BedDouble className="size-3" />}>Property</SectionLabel>
                  <h4 className="text-base font-bold leading-snug tracking-tight text-slate-900 dark:text-slate-50">
                    {hotelDisplayName}
                  </h4>
                  {(live?.hotel?.destinationName ?? live?.hotel?.zoneName) && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {[live?.hotel?.zoneName, live?.hotel?.destinationName].filter(Boolean).join(", ")}
                    </p>
                  )}

                  <dl className="mt-2">
                    <Row
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <User className="size-3 text-slate-300 dark:text-slate-600" aria-hidden /> Holder
                        </span>
                      }
                      value={
                        [live?.holder?.name, live?.holder?.surname].filter(Boolean).join(" ") ||
                        [data.holder?.name, data.holder?.surname].filter(Boolean).join(" ") ||
                        null
                      }
                    />
                    <Row
                      label={
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays className="size-3 text-slate-300 dark:text-slate-600" aria-hidden /> Stay
                        </span>
                      }
                      value={
                        (live?.hotel?.checkIn && live?.hotel?.checkOut
                          ? `${live.hotel.checkIn} → ${live.hotel.checkOut}`
                          : null) ??
                        (data.checkIn && data.checkOut ? `${data.checkIn} → ${data.checkOut}` : null)
                      }
                    />
                    <Row label={`Total (${nights > 1 ? `${nights} nights` : "stay"})`} value={<Money amount={totalAmount} currency={data.currency ?? est?.currency} className="font-bold" />} />
                    {nights > 1 && perNight != null && (
                      <Row label="Per night" value={<Money amount={perNight} currency={data.currency ?? est?.currency} />} />
                    )}
                    {(data.markupAmount != null && data.markupAmount > 0) || (data.supplierAmount != null && totalAmount != null && totalAmount > data.supplierAmount) ? (
                      <Row
                        label="Admin earnings (markup)"
                        value={
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            +<Money amount={data.markupAmount ?? (totalAmount ?? 0) - (data.supplierAmount ?? 0)} currency={data.currency} />
                          </span>
                        }
                      />
                    ) : null}
                    <Row label="Payment" value={<Badge status={data.paymentStatus} />} />
                    <Row label="Booked on" value={formatEventTime(data.createdAt)} />
                  </dl>

                  {/* Policy chips */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {live ? (
                      live.cancellationAllowed ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/60">Cancellation allowed</span>
                      ) : (
                        <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800/60">Non-cancellable</span>
                      )
                    ) : est ? (
                      est.isFreeCancellation ? (
                        <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-200/60 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-800/60">Cancellation allowed</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800/60">Cancellation fee applies</span>
                      )
                    ) : null}
                    {live ? (
                      live.modificationAllowed ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800/60">Modification allowed</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200/60 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/60">Not modifiable</span>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>

            {/* ── RateHawk confirmation polling (with window timer) ── */}
            {data.provider === "ratehawk" && (
              <RateHawkPollingSection data={data} refetch={refetch} />
            )}

            {/* ── Cancellation estimate ── */}
            {est && (
              <Card className="p-4">
                <SectionLabel icon={<Wallet className="size-3" />}>If cancelled now</SectionLabel>
                <div className="grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  <div className="bg-slate-50/70 px-3 py-3.5 dark:bg-slate-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Booking total</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <Money amount={est.totalAmount} currency={est.currency} />
                    </p>
                  </div>
                  <div className="bg-slate-50/70 px-3 py-3.5 dark:bg-slate-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fee</p>
                    <p className={`mt-1 text-sm font-semibold ${est.cancellationFee > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {est.cancellationFee > 0 ? <Money amount={-est.cancellationFee} currency={est.currency} /> : "Free"}
                    </p>
                  </div>
                  <div className="bg-indigo-50/50 px-3 py-3.5 dark:bg-indigo-950/20">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Est. refund</p>
                    <p className={`mt-1 text-sm font-bold ${est.refundAmount > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-slate-400"}`}>
                      <Money amount={est.refundAmount} currency={est.currency} />
                    </p>
                  </div>
                </div>
                {(est.policyDescription || (est.isFreeCancellation && est.upcomingFeeDescription)) && (
                  <div className="space-y-1.5 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                    {est.policyDescription && (
                      <p className="text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400">{est.policyDescription}</p>
                    )}
                    {est.isFreeCancellation && est.upcomingFeeDescription && (
                      <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        {est.upcomingFeeDescription}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            )}

            {/* ── Rooms ── */}
            <Card className="p-4">
              <SectionLabel icon={<BedDouble className="size-3" />}>Rooms</SectionLabel>
              <div className="space-y-3">
                {(live?.rooms ?? []).map((room, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{room.name ?? `Room ${room.id ?? i + 1}`}</p>
                      <Badge status={room.status} />
                    </div>
                    {(room.paxes ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(room.paxes ?? []).map((pax, j) => (
                          <span key={j} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {pax.type} · {[pax.name, pax.surname].filter(Boolean).join(" ") || "Guest"}
                          </span>
                        ))}
                      </div>
                    )}
                    {(room.rates ?? []).map((rate, j) => (
                      <div key={j} className="mt-3 border-t border-slate-50 pt-2.5 dark:border-slate-800/60">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500 dark:text-slate-400">{rate.rateClass ?? "Rate"}{rate.boardName ? ` · ${rate.boardName}` : ""}</span>
                          {rate.net != null && (
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              <Money amount={rate.net} currency={live?.price?.currency ?? data.currency} />
                            </span>
                          )}
                        </div>
                        {(rate.cancellationPolicies ?? []).length > 0 && (
                          <div className="mt-2 space-y-1">
                            {rate.cancellationPolicies!.map((policy, k) => {
                              const free = Number(policy.amount ?? 0) === 0 && Number(policy.percentage ?? 0) === 0 && Number(policy.numberOfNights ?? 0) === 0;
                              return (
                                <div key={k} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] tabular-nums dark:bg-slate-800/50">
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {policy.from ? (free ? `Free until ${formatPolicyDate(policy.from)}` : `After ${formatPolicyDate(policy.from)}`) : "Booking"}
                                  </span>
                                  <span className={`font-semibold ${free ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                                    {free ? "Free" : policy.amount != null ? <Money amount={policy.amount} currency={live?.price?.currency ?? data.currency} /> : "Fee"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                {(live?.rooms ?? []).length === 0 && (data.paxes?.length ?? 0) > 0 && (
                  <div className="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Guest(s)</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {data.paxes!.map((pax, i) => (
                        <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {pax.type ?? "Guest"} · {[pax.name, pax.surname].filter(Boolean).join(" ") || "Guest"}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(live?.rooms ?? []).length === 0 && (data.paxes?.length ?? 0) === 0 && (
                  <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-800">
                    No room details returned by the supplier.
                  </p>
                )}
              </div>
            </Card>

            {/* ── Booked-rate policies (snapshot) ── */}
            {(data.rateSnapshot?.cancellationPolicies?.length ?? 0) > 0 && (
              <Card className="p-4">
                <SectionLabel icon={<ScrollText className="size-3" />}>Booked-rate policies</SectionLabel>
                <div className="space-y-1">
                  {data.rateSnapshot!.cancellationPolicies!.map((p, i) => {
                    const free = Number(p.amount ?? 0) === 0 && Number(p.percentage ?? 0) === 0 && Number(p.numberOfNights ?? 0) === 0;
                    return (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-[11px] tabular-nums dark:bg-slate-800/50">
                        <span className="text-slate-500 dark:text-slate-400">
                          {p.from ? (free ? `Free until ${formatPolicyDate(p.from)}` : `After ${formatPolicyDate(p.from)}`) : "Booking"}
                        </span>
                        <span className={`font-semibold ${free ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                          {free ? "Free cancellation" : p.amount != null ? <Money amount={p.amount} currency={data.currency} /> : "Fee applies"}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  Snapshot captured at booking time — the live panel above reflects current supplier terms.
                </p>
              </Card>
            )}

            {/* ── Activity timeline ── */}
            {data.events.length > 0 && (
              <Card className="p-4">
                <SectionLabel icon={<History className="size-3" />}>Activity</SectionLabel>
                <ol className="relative ml-1 space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                  {data.events.map((ev, i) => (
                    <li key={i} className="relative">
                      <span className="absolute -left-[21px] top-1 size-2 rounded-full border-2 border-white bg-indigo-400 dark:border-slate-900" aria-hidden />
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          {EVENT_LABELS[ev.type] ?? ev.type.replace(/_/g, " ")}
                        </span>
                        <time className="shrink-0 text-[10px] tabular-nums text-slate-400">{formatEventTime(ev.at)}</time>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}