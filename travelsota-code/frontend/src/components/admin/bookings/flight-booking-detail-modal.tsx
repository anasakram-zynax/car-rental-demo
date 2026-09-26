"use client";

// Admin flight booking detail modal — operations-console design.
// Fetches the flight admin detail endpoint which returns the local booking +
// a fresh live supplier retrieve. Shows an explicit LIVE / LOCAL provenance
// badge and a Rate Comments panel built from the booked fare's conditions.

import { useEffect, useMemo } from "react";
import { useApiQuery } from "@/hooks/useApiQuery";
import {
  X,
  RadioTower,
  Database,
  Plane,
  Users,
  ScrollText,
} from "lucide-react";
import {
  FlightRateComments,
  duffelRateComments,
} from "@/features/flights/components/flight-rate-comments";
import { formatCurrency } from "@/lib/utils/currency";
import { useCurrencyData } from "@/context/CurrencyContext";
import { bookingStatusLabel } from "@/lib/utils/booking-status-label";

export interface AdminFlightDetail {
  bookingId: string;
  type: "flight";
  provider: string;
  reference: string | null;
  localStatus: string;
  locatorCode: string | null;
  supplierBookingId: string | null;
  amount: number | null;
  baseAmount?: number | null;
  markupAmount?: number | null;
  currency: string;
  createdAt: string;
  paymentStatus?: string | null;
  travelerSnapshot?: Array<Record<string, unknown>> | null;
  offerSnapshot?: Record<string, any> | null;
  receiptUrl?: string | null;
  holdExpiresAt?: string | null;
  supplierHoldExpiresAt?: string | null;
  /** 'supplier_*' = real Travelport deadline; 'local_estimate' = our 20-min guard. */
  supplierHoldSource?: string | null;
  adminHoldExpiresAt?: string | null;
  message?: string | null;
  workflowSummary?: Record<string, any> | null;
  live: Record<string, unknown> | null;
  liveError: string | null;
  liveFetchedAt: string;
  demoBooking?: boolean;
}

/* ── primitives ─────────────────────────────────────────────── */

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">
      <span className="text-gray-300 dark:text-gray-600">{icon}</span>
      {children}
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">{value ?? "—"}</span>
    </div>
  );
}

function StatusChip({ status }: { status: string | null | undefined }) {
  if (!status || status === "—") return <span className="text-sm text-gray-300 dark:text-gray-600">—</span>;
  const s = String(status).toUpperCase();
  const isCancelled = s === "CANCELLED" || s === "FAILED";
  const isConfirmed = s === "BOOKED" || s === "CONFIRMED" || s === "TICKETED" || s === "HELD" || s === "PAID";
  const color = isCancelled
    ? "bg-error-50 text-error-700 ring-1 ring-error-200/60 dark:bg-error-900/20 dark:text-error-400 dark:ring-error-800/50"
    : isConfirmed
      ? "bg-success-50 text-success-700 ring-1 ring-success-200/60 dark:bg-success-900/20 dark:text-success-400 dark:ring-success-800/50"
      : "bg-gray-100 text-gray-600 ring-1 ring-gray-200/60 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700/50";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide tabular-nums ${color}`}>{bookingStatusLabel(status)}</span>;
}

// Deliberately does NOT convert to the admin's selected display currency —
// shows the actual transaction amount/currency as recorded. Only decimal
// formatting is centralized (was a hardcoded .toFixed(2)).
function Money({ amount, currency, className = "" }: { amount: number | string | null | undefined; currency?: string | null; className?: string }) {
  const { decimalsMap } = useCurrencyData();
  if (amount == null) return <span className="text-gray-400">—</span>;
  return (
    <span className={`tabular-nums ${className}`}>
      {typeof amount === "number" ? formatCurrency(amount, currency ?? "USD", decimalsMap) : amount}
      {currency ? <span className="ml-1 text-[0.85em] font-medium opacity-70">{currency}</span> : null}
    </span>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── modal ──────────────────────────────────────────────────── */

export function FlightBookingDetailModal({
  bookingId,
  onClose,
}: {
  bookingId: string;
  onClose: () => void;
}) {
  const { data, isPending, error, refetch } = useApiQuery<AdminFlightDetail>(
    ["admin", "flight-booking-detail", bookingId],
    `/admin/flights/bookings/${bookingId}/detail`,
    { requestOptions: { auth: true }, retry: 1 },
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Provider-agnostic live envelope:
  //   Duffel     → live.data (Duffel order)
  //   Travelport → live.ReservationResponse.Reservation (native JSON API)
  //   Amadeus    → live.data
  const rawOrder =
    (data?.live as any)?.data ??
    (data?.live as any)?.ReservationResponse?.Reservation ??
    (data?.live as any)?.Reservation ??
    null;
  const order: any =
    rawOrder && rawOrder.id
      ? rawOrder
      : rawOrder && (rawOrder.Offer || rawOrder.Traveler || rawOrder.Identifier)
        ? rawOrder
        : null;
  const reference =
    data?.reference ??
    order?.associatedRecords?.[0]?.reference ??
    (order?.Receipt ?? [])
      .map((r: any) => r?.Confirmation?.Locator)
      .find((l: any) => l?.locatorType === "PNR Locator")?.value ??
    (order?.Receipt ?? [])[0]?.Confirmation?.Locator?.value ??
    null;
  const isDemo = !!data?.demoBooking;
  // LIVE only when the supplier payload actually carries content — a bare
  // envelope with no order id renders nothing and misleads admins.
  const hasLiveContent = Boolean(
    order &&
      (order.id ||
        order.Identifier?.value ||
        order.Offer?.length ||
        order.Traveler?.length ||
        order.associatedRecords?.length ||
        order.flightOffers?.length),
  );
  const isLive = !!data?.live && !data?.liveError && hasLiveContent && !isDemo;

  // Rate comments from the BOOKED fare — Duffel conditions via the shared
  // builder; other providers fall back to normalized display policies that
  // were captured in the snapshot at search time.
  const rateComments = useMemo(() => {
    const snap = data?.offerSnapshot;
    if (!snap) return null;
    const rawOffer = snap.rawOffer as Record<string, any> | undefined;
    if (data?.provider === 'duffel' && rawOffer?.conditions) {
      return duffelRateComments(rawOffer as any);
    }
    const display = snap.display as
      | { refundPolicy?: any; changePolicy?: any }
      | undefined;
    if (display?.refundPolicy || display?.changePolicy) {
      return {
        provider: data?.provider,
        refund: display.refundPolicy ?? null,
        change: display.changePolicy ?? null,
        taxAmount: null as number | null,
      };
    }
    return null;
  }, [data?.provider, data?.offerSnapshot]);

  // Travelers: prefer live supplier list, fall back to stored snapshot.
  // Duffel → order.travelers; Travelport → Reservation.Traveler.
  const travelers =
    order?.travelers ??
    (order?.Traveler ?? []).map((t: any) => ({
      name: {
        firstName: t?.PersonName?.Given,
        lastName: t?.PersonName?.Surname,
      },
      dateOfBirth: t?.birthDate,
      id: t?.id ?? t?.Identifier?.value ?? String(t?.passengerTypeCode ?? ""),
    })) ??
    (data?.travelerSnapshot ?? []).map((t: any, i: number) => ({
      name: { firstName: t.givenName ?? t.firstName, lastName: t.surname ?? t.lastName },
      dateOfBirth: t.birthDate ?? t.dateOfBirth,
      id: String(i),
    }));

  // Itinerary segments: prefer live, fall back to snapshot legs.
  // Travelport → each Offer.Product[].FlightSegment[], ordered by sequence.
  const itineraryOffers =
    order?.flightOffers ??
    ((order?.Offer ?? []) as any[]).map((offer: any) => ({
      itineraries: [
        {
          segments: ((offer?.Product ?? []) as any[])
            .flatMap((p: any) => (p?.FlightSegment ?? []).map((s: any) => ({ ...s, seq: s?.sequence ?? 0 })))
            .sort((a: any, b: any) => a.seq - b.seq)
            .map((s: any) => ({
              departure: {
                iataCode: s?.Flight?.Departure?.location,
                at: s?.Flight?.Departure?.date && s?.Flight?.Departure?.time
                  ? `${s.Flight.Departure.date}T${s.Flight.Departure.time}`
                  : undefined,
              },
              arrival: { iataCode: s?.Flight?.Arrival?.location },
              carrierCode: s?.Flight?.carrier,
              number: s?.Flight?.number,
            })),
        },
      ],
    })) ??
    ((data?.offerSnapshot?.legs as any[] | undefined)?.length
      ? [
          {
            itineraries: [
              {
                segments: (data!.offerSnapshot!.legs as any[]).map((leg: any) => ({
                  departure: { iataCode: leg.from ?? leg.origin, at: leg.departureAt },
                  arrival: { iataCode: leg.to ?? leg.destination },
                  carrierCode: leg.carrierCode,
                  number: leg.flightNumber ?? leg.number,
                })),
              },
            ],
          },
        ]
      : []);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="flight-detail-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 id="flight-detail-title" className="truncate text-lg font-semibold text-gray-900 dark:text-white">
                Flight Booking Detail
              </h3>
              {isLive ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
                  title={`Fresh data from the supplier · fetched ${fmt(data?.liveFetchedAt ?? "")}`}
                >
                  <RadioTower className="size-3" aria-hidden />
                  Live
                </span>
              ) : isDemo ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-700 ring-1 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800"
                  title="Demo booking — no real supplier order. Data comes from the local record; cancellation is free."
                >
                  <Database className="size-3" aria-hidden />
                  Demo
                </span>
              ) : (
                <span
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
                  title="Supplier retrieve unavailable — values come from the local record"
                >
                  <Database className="size-3" aria-hidden />
                  Local
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-gray-400">
              {reference ? `#${reference}` : `#${bookingId.slice(0, 8)}`}
              {isLive ? ` · synced ${fmt(data!.liveFetchedAt)}` : ""}
              {isDemo ? " · demo booking — local record" : ""}
              {!isLive && !isDemo && data?.liveError ? " · supplier retrieve failed" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500 dark:hover:bg-gray-800"
            aria-label="Close flight booking detail"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* ── Body ── */}
        {isPending ? (
          <div className="flex justify-center px-6 py-16" role="status" aria-label="Loading flight booking detail">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-brand-teal-500" />
          </div>
        ) : error || !data ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Unable to load flight booking detail.</p>
            {error ? <p className="mx-auto mt-1 max-w-md text-xs text-error-500">{String(error)}</p> : null}
            <button
              onClick={() => refetch()}
              className="mt-4 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="max-h-[calc(92vh-73px)] space-y-6 overflow-y-auto px-6 pb-6 pt-5">

            {/* Status rail */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <StatusChip status={order ? "booked" : undefined} />
              {order && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">supplier</span>
              )}
              <span className="h-1 w-1 rounded-full bg-gray-200 dark:bg-gray-700" />
              <StatusChip status={data.localStatus} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">local</span>
              <span className="h-1 w-1 rounded-full bg-gray-200 dark:bg-gray-700" />
              <StatusChip status={data.paymentStatus ?? undefined} />
              {(data.paymentStatus ?? undefined) && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">payment</span>
              )}
            </div>

            {data.liveError && !isDemo && (
              <div className="flex items-start gap-2.5 rounded-xl border border-error-200 bg-error-50 px-4 py-3 dark:border-error-800/60 dark:bg-error-950/30">
                <Database className="mt-0.5 size-4 shrink-0 text-error-500" aria-hidden />
                <p className="text-xs leading-relaxed text-error-700 dark:text-error-300">
                  <strong className="font-semibold">Supplier retrieve failed.</strong> {data.liveError} — showing the stored local record.
                </p>
              </div>
            )}

            {/* Facts */}
            <section aria-label="Booking facts">
              <SectionLabel icon={<Plane className="size-3" />}>Booking</SectionLabel>
              <dl className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-gray-50/70 px-4 dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-800/40">
                <Row label="Reference (PNR)" value={reference} />
                <Row label="Supplier order id" value={data.supplierBookingId ?? order?.id ?? order?.Identifier?.value ?? null} />
                <Row label="Provider" value={<span className="capitalize">{data.provider}</span>} />
                <Row label="Amount" value={<Money amount={data.amount} currency={data.currency} />} />
                {(data.baseAmount != null && data.amount != null && data.amount > data.baseAmount) || (data.markupAmount != null && data.markupAmount > 0) ? (
                  <Row
                    label="Admin earnings (markup)"
                    value={
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        +<Money amount={data.markupAmount ?? data.amount! - data.baseAmount!} currency={data.currency} />
                      </span>
                    }
                  />
                ) : null}
                <Row label="Booked on" value={fmt(data.createdAt)} />
              </dl>
            </section>

            {/* Rate comments — fare conditions of the booked offer */}
            {rateComments && (
              <section aria-label="Rate comments">
                <SectionLabel icon={<ScrollText className="size-3" />}>Fare conditions</SectionLabel>
                <FlightRateComments data={rateComments} />
                <p className="mt-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                  Conditions captured when this fare was booked.
                </p>
              </section>
            )}

            {/* Travelers */}
            {(travelers.length ?? 0) > 0 && (
              <section aria-label="Travelers">
                <SectionLabel icon={<Users className="size-3" />}>Travelers</SectionLabel>
                <div className="space-y-1.5">
                  {travelers.map((t: any, i: number) => (
                    <div key={t.id ?? i} className="rounded-lg bg-gray-50 px-3 py-2 text-xs tabular-nums text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
                      {[t.name?.firstName, t.name?.lastName].filter(Boolean).join(" ") || `Traveler ${i + 1}`}
                      {t.dateOfBirth ? ` · ${t.dateOfBirth}` : ""}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Itinerary */}
            {(itineraryOffers.length ?? 0) > 0 && (
              <section aria-label="Itinerary">
                <SectionLabel icon={<Plane className="size-3" />}>Itinerary</SectionLabel>
                <div className="space-y-2">
                  {itineraryOffers.flatMap((offer: any, oi: number) =>
                    (offer.itineraries ?? []).map((itin: any, ii: number) => (
                      <div key={`${oi}-${ii}`} className="rounded-xl border border-gray-100 p-3.5 dark:border-gray-800">
                        {(itin.segments ?? []).map((seg: any, si: number) => (
                          <div
                            key={si}
                            className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-xs text-gray-600 dark:text-gray-400 ${
                              si > 0 ? "border-t border-gray-50 pt-1.5 dark:border-gray-800/60" : ""
                            }`}
                          >
                            <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                              {seg.departure?.iataCode} → {seg.arrival?.iataCode}
                            </span>
                            <span>{seg.carrierCode} {seg.number}</span>
                            {seg.departure?.at ? <span className="tabular-nums text-gray-400">{fmt(seg.departure.at)}</span> : null}
                          </div>
                        ))}
                      </div>
                    )),
                  )}
                </div>
              </section>
            )}

            {!data.live && !order && !data.liveError && (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400 dark:border-gray-800">
                No live supplier details returned.
              </p>
            )}

            {/* Footer */}
            <div className="flex justify-end border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                onClick={onClose}
                className="min-h-[44px] cursor-pointer rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
