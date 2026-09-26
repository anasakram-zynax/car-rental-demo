'use client';

import { saveScrollAnchor } from '@/lib/utils/search-cache';

import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode, memo } from 'react';
import { useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { useCurrency } from '@/context/CurrencyContext';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { getPriceBreakdownSetting } from '@/features/admin/api/admin-settings';
import { useToast } from '@/hooks/useToast';
import { storeOffer } from '@/lib/offer-bridge';
import { createFlightSnapshot } from '@/features/flights/api/create-snapshot';
import { cancelSearchJob } from '@/features/search-progress/api/search-jobs';
import { ROUTES } from '@/lib/routes';
import type { FlightOfferView, FlightSegmentView } from '@/lib/schema/flight';
import type { MarkedUpOffer } from '@/features/agent/api/agent-bookings';
import { MarkupButton } from '@/components/search/MarkupTooltip';
import { SupplierGate } from '@/components/shared/supplier-gate';

// ─── Types ──────────────────────────────────────────────────

interface FlightResultCardProps {
  offer: FlightOfferView;
  searchKey?: string;
  searchId?: string;
  adults?: number;
  tripType?: string;
  returnDate?: string;
  from?: string;
  to?: string;
  mode?: 'customer' | 'agent';
  markups?: MarkedUpOffer;
  showMarkupId?: boolean;
  onToggleMarkup?: () => void;
}

type Journey = {
  direction: 'outbound' | 'return' | 'itinerary';
  segments: FlightSegmentView[];
  label: string;
};

// ─── Helpers ────────────────────────────────────────────────

const ease = [0.16, 1, 0.3, 1] as const;
const ACCENT = '#033d4a';

function fmtTime(iso?: string): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDateShort(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(dep?: string, arr?: string): string {
  if (!dep || !arr) return '';
  const d = new Date(arr).getTime() - new Date(dep).getTime();
  if (Number.isNaN(d) || d < 0) return '0m';
  const h = Math.floor(d / 3600000);
  const m = Math.floor((d % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function dayOffset(dep?: string, arr?: string): number {
  if (!dep || !arr) return 0;
  const d1Match = dep.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d2Match = arr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (d1Match && d2Match) {
    const t1 = Date.UTC(Number(d1Match[1]), Number(d1Match[2]) - 1, Number(d1Match[3]));
    const t2 = Date.UTC(Number(d2Match[1]), Number(d2Match[2]) - 1, Number(d2Match[3]));
    return Math.max(0, Math.round((t2 - t1) / 86400000));
  }
  return 0;
}

function carrierCode(carrier?: string): string {
  if (!carrier) return '??';
  return (carrier.match(/[A-Za-z]{2}/)?.[0] ?? carrier.slice(0, 2)).toUpperCase();
}

function iataCode(code: string | undefined): string {
  if (!code) return '';
  const trimmed = code.trim().toUpperCase();
  const match = trimmed.match(/^([A-Z]{3})\b/);
  return match ? match[1] : trimmed;
}

function normalizeSegmentCode(formCode: string | undefined, segs: FlightSegmentView[], matchField: 'from' | 'to'): string {
  if (!formCode || !segs.length) return formCode ?? '';
  const upper = formCode.toUpperCase();
  const directMatch = segs.find((s) => s[matchField]?.toUpperCase() === upper);
  if (directMatch) return directMatch[matchField]!;
  const prefixMatch = segs.find((s) => {
    const code = s[matchField]?.toUpperCase() ?? '';
    return code.startsWith(upper + ' ') || code.startsWith(upper + '(');
  });
  if (prefixMatch) return prefixMatch[matchField]!;
  if (matchField === 'from' && segs[0]?.from) return segs[0].from;
  if (matchField === 'to') {
    const origin = segs[0]?.from;
    const destSeg = segs.find((s) => origin && s.to !== origin);
    if (destSeg?.to) return destSeg.to;
  }
  return formCode;
}

/** "Shanghai (SHA)" → "SHA" — full label otherwise. */
function cityCode(label: string | undefined, fallback: string | undefined): string {
  const m = label?.match(/\(([A-Za-z0-9]{3})\)/);
  return m?.[1] ?? fallback ?? label ?? '—';
}

// ─── Journey Partitioning ───────────────────────────────────

function partitionJourneys(segs: FlightSegmentView[], origin: string, dest: string, tripType: string): Journey[] {
  if (!segs.length) return [];
  if (tripType !== 'round_trip') {
    return [{ direction: 'itinerary', segments: segs, label: 'Flight' }];
  }
  const oCode = iataCode(origin);
  const dCode = iataCode(dest);
  const turnIdx = segs.findIndex((s) => iataCode(s.to) === dCode);
  if (turnIdx >= 0 && turnIdx < segs.length - 1) {
    const retSegs = segs.slice(turnIdx + 1);
    if (retSegs.length > 0 && iataCode(retSegs[0].from) === dCode && iataCode(retSegs[retSegs.length - 1]?.to) === oCode) {
      return [
        { direction: 'outbound', segments: segs.slice(0, turnIdx + 1), label: 'Outbound' },
        { direction: 'return', segments: retSegs, label: 'Return' },
      ];
    }
  }
  const lastSeg = segs[segs.length - 1];
  const firstSeg = segs[0];
  const returnsToStart = iataCode(lastSeg?.to) === iataCode(firstSeg?.from);
  if (returnsToStart && segs.length >= 2) {
    const mid = Math.ceil(segs.length / 2);
    return [
      { direction: 'outbound', segments: segs.slice(0, mid), label: 'Outbound' },
      { direction: 'return', segments: segs.slice(mid), label: 'Return' },
    ];
  }
  return [{ direction: 'itinerary', segments: segs, label: 'Itinerary' }];
}

// ─── Normalized policy labels ───────────────────────────────
// The card never prints raw supplier strings ("Cancel fee: $70 EUR") —
// penalties live in the Fare rules tab where they have room and context.

function refundBadgeLabel(offer: FlightOfferView, t: (key: string) => string): { label: string; positive: boolean } | null {
  const dd = offer.display;
  if (offer.capabilities?.freeCancellation === true) return { label: t('freeCancellation'), positive: true };
  const allowed = dd?.refundPolicy?.allowed ?? offer.refundable;
  if (allowed === true) return { label: t('refundable'), positive: true };
  if (allowed === false) return { label: t('nonRefundable'), positive: false };
  return null;
}

function changeBadgeLabel(offer: FlightOfferView, t: (key: string) => string): { label: string; positive: boolean } | null {
  const allowed = offer.display?.changePolicy?.allowed;
  if (allowed == null) return null;
  return allowed ? { label: t('changeable'), positive: true } : { label: t('nonChangeable'), positive: false };
}

// ─── Hover Popover (the ONLY one per journey) ───────────────

let hoverCapable: boolean | null = null;
function isHoverCapable(): boolean {
  if (hoverCapable === null && typeof window !== 'undefined' && window.matchMedia) {
    hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }
  return hoverCapable ?? true;
}

function JourneyHoverPopover({ children, content }: { children: (open: boolean) => ReactNode; content: ReactNode }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const popoverWidth = Math.min(340, window.innerWidth - 24);

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    if (left < 12) left = 12;
    if (left + popoverWidth > window.innerWidth - 12) left = window.innerWidth - popoverWidth - 12;

    const SPACE_NEEDED = 220;
    const GAP = 10;
    let above = rect.top > SPACE_NEEDED + GAP;
    if (!above && rect.bottom + SPACE_NEEDED + GAP > window.innerHeight - 8) above = true;

    setPos({ top: above ? rect.top - GAP : rect.bottom + GAP, left, above });
  }, []);

  const openNow = useCallback(() => {
    if (!isHoverCapable()) return; // touch devices use the Details drawer
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    if (enterTimer.current) return;
    enterTimer.current = setTimeout(() => {
      enterTimer.current = null;
      updatePosition();
      setShow(true);
    }, 120);
  }, [updatePosition]);

  const closeSoon = useCallback(() => {
    if (enterTimer.current) { clearTimeout(enterTimer.current); enterTimer.current = null; }
    if (leaveTimer.current) return;
    leaveTimer.current = setTimeout(() => {
      leaveTimer.current = null;
      setShow(false);
    }, 80);
  }, []);

  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [show]);

  useEffect(() => {
    if (!show) return;
    const recalc = () => updatePosition();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [show, updatePosition]);

  useEffect(() => () => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
  }, []);

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      onFocus={openNow}
      onBlur={closeSoon}
    >
      {children(show)}
      {show && pos && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ top: pos.top, left: pos.left, width: 'min(340px, calc(100vw - 24px))', transform: pos.above ? 'translateY(-100%)' : undefined }}
        >
          <div
            className="rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xl pointer-events-auto transition-[opacity,transform] duration-150 ease-out"
            style={{
              opacity: show ? 1 : 0,
              transform: show ? 'scale(1)' : 'scale(0.97)',
              translate: pos.above ? '0 -4px' : '0 4px',
            }}
            onMouseEnter={openNow}
            onMouseLeave={closeSoon}
          >
            {content}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Journey Hover Content (important data only) ────────────

function JourneyHoverContent({ journey, offer }: { journey: Journey; offer: FlightOfferView }) {
  const t = useTranslations('Flights');
  const header = journey.direction === 'outbound' ? t('outbound') : journey.direction === 'return' ? t('inbound') : journey.label;
  const distinctAirports = [...new Set(journey.segments.map((s) => iataCode(s.to)).concat([iataCode(journey.segments[0]?.from)]))];
  const baggageLabel = offer.display?.baggage?.summaryLabel ?? offer.display?.baggage?.checkedLabel;

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] font-bold uppercase tracking-wide text-zinc-400">{header}</p>
      {journey.segments.map((seg, i) => {
        const sd = seg.display;
        const layover = i < journey.segments.length - 1
          ? (seg.arrivalAt && journey.segments[i + 1]?.departureAt ? fmtDuration(seg.arrivalAt, journey.segments[i + 1].departureAt) : null)
          : null;
        return (
          <div key={i}>
            <div className="space-y-0.5">
              <p className="text-[13px] font-bold text-zinc-900">
                {sd?.airlineName ?? seg.marketingCarrier ?? 'Airline'} {sd?.flightNumber ?? seg.flightNumber}
              </p>
              <p className="text-[12px] text-zinc-600">
                <span className="font-bold tabular-nums text-zinc-800">{sd?.departureTimeLabel ?? fmtTime(seg.departureAt)}</span>
                {' '}· {sd?.origin?.label ?? seg.from}
                <span className="mx-1.5 text-zinc-300">→</span>
                <span className="font-bold tabular-nums text-zinc-800">{sd?.arrivalTimeLabel ?? fmtTime(seg.arrivalAt)}</span>
                {dayOffset(seg.departureAt, seg.arrivalAt) > 0 && (
                  <span className="ml-1 rounded bg-zinc-100 px-1 text-[9px] font-black text-zinc-500">
                    +{dayOffset(seg.departureAt, seg.arrivalAt)}d
                  </span>
                )}
                {' '}· {sd?.destination?.label ?? seg.to}
              </p>
              <p className="text-[11px] text-zinc-500">
                {sd?.durationLabel ?? fmtDuration(seg.departureAt, seg.arrivalAt)}
                {sd?.cabinLabel && <> · {sd.cabinLabel}</>}
              </p>
            </div>
            {layover && (
              <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">
                {t('layoverInfo', { duration: layover, destination: seg.display?.destination?.label ?? seg.to })}
              </p>
            )}
          </div>
        );
      })}
      {distinctAirports.length > 2 && (
        <p className="border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
          {t('usesAirports', { count: distinctAirports.length, airports: distinctAirports.join(' → ') })}
        </p>
      )}
      {baggageLabel && (
        <p className="border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">{t('baggage')}: {baggageLabel}</p>
      )}
    </div>
  );
}

// ─── Journey Leg (responsive grid cell) ─────────────────────

function JourneyLeg({
  journey,
  offer,
  directionLabel,
  wide,
}: {
  journey: Journey;
  offer: FlightOfferView;
  directionLabel: string;
  wide: boolean;
}) {
  const f = journey.segments[0];
  const l = journey.segments[journey.segments.length - 1];
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const journeyDur = (journey.segments.length === 1 && f?.display?.durationLabel)
    ? f.display.durationLabel
    : fmtDuration(f?.departureAt, l?.arrivalAt);
  const isSingleJourney = (offer.display?.journeys?.length ?? 1) <= 1 && (offer.segments?.length ?? 0) === journey.segments.length;
  const dur = (isSingleJourney ? (offer.display?.durationLabel ?? journeyDur) : journeyDur) || journeyDur;
  const stops = journey.segments.length - 1;
  const stopsLabel = isSingleJourney && offer.display?.stopsLabel
    ? offer.display.stopsLabel
    : (stops === 0 ? tc('direct') : t('stopsCount', { count: stops }));
  const plus = dayOffset(f?.departureAt, l?.arrivalAt);
  const isDirect = stops === 0;

  return (
    <div className="min-w-0">
      {/* Direction label — OUT / RET / Leg n */}
      <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">{directionLabel}</p>

      <JourneyHoverPopover content={<JourneyHoverContent journey={journey} offer={offer} />}>
        {(hovered) => (
          <div className={`group/leg flex cursor-help items-center gap-2 rounded-lg px-1 py-0.5 transition-colors ${hovered ? 'bg-zinc-50' : ''}`}>
            {/* Departure */}
            <div className="min-w-[44px] text-left shrink-0">
              <p className="text-[17px] font-extrabold tabular-nums leading-tight text-zinc-900">
                {f?.display?.departureTimeLabel ?? fmtTime(f?.departureAt)}
              </p>
              <p className="max-w-[64px] truncate text-[11px] font-semibold text-zinc-500">
                {wide ? (f?.display?.origin?.label ?? f?.from) : cityCode(f?.display?.origin?.label, f?.from)}
              </p>
            </div>

            {/* Route line — duration above, stops below */}
            <div className="flex min-w-[64px] flex-1 flex-col items-center gap-1">
              <span className="whitespace-nowrap text-[11px] font-bold text-zinc-600">{dur}</span>
              <div className="relative flex w-full items-center">
                <span className="h-[7px] w-[7px] shrink-0 rounded-full ring-2 ring-zinc-100" style={{ backgroundColor: ACCENT }} />
                <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: ACCENT, opacity: 0.3 }} />
                <svg className="mx-1 h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover/leg:translate-x-0.5" style={{ color: ACCENT }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21.5 12L3.5 4l2.8 8-2.8 8 18-8z" />
                </svg>
                <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: ACCENT, opacity: 0.3 }} />
                <span className="h-[7px] w-[7px] shrink-0 rounded-full ring-2 ring-zinc-100" style={{ backgroundColor: ACCENT }} />
              </div>
              <span
                className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isDirect ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                {isDirect && <span className="h-1 w-1 rounded-full bg-emerald-500" />}
                {stopsLabel}
              </span>
            </div>

            {/* Arrival */}
            <div className="min-w-[44px] text-right shrink-0">
              <p className="flex items-center justify-end gap-1 text-[17px] font-extrabold tabular-nums leading-tight text-zinc-900">
                {l?.display?.arrivalTimeLabel ?? fmtTime(l?.arrivalAt)}
                {plus > 0 && (
                  <span className="rounded bg-zinc-100 px-1 text-[9px] font-black text-zinc-500">+{plus}d</span>
                )}
              </p>
              <p className="ml-auto max-w-[64px] truncate text-[11px] font-semibold text-zinc-500">
                {wide ? (l?.display?.destination?.label ?? l?.to) : cityCode(l?.display?.destination?.label, l?.to)}
              </p>
            </div>
          </div>
        )}
      </JourneyHoverPopover>
    </div>
  );
}

// ─── Meta Chips (bottom bar) ────────────────────────────────

function MetaChips({ offer }: { offer: FlightOfferView }) {
  const t = useTranslations('Flights');
  const dd = offer.display;
  const chips: { icon: ReactNode; label: string; tone: 'pos' | 'neg' | 'neutral' | 'src' }[] = [];

  // Content-channel badge — identifies whether a Travelport offer came from
  // the NDC or GDS channel (both can be merged into one search result).
  if (offer.contentSource === 'NDC' || offer.contentSource === 'GDS') {
    chips.push({
      tone: offer.contentSource === 'NDC' ? 'src' : 'neutral',
      label: offer.contentSource,
      icon: null,
    });
  }

  const baggageLabel = dd?.baggage?.summaryLabel ?? dd?.baggage?.checkedLabel ?? offer.baggageText;
  if (baggageLabel) {
    chips.push({
      tone: 'neutral',
      label: baggageLabel,
      icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.114 48.114 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>,
    });
  }

  const refund = refundBadgeLabel(offer, (k) => t(k));
  if (refund) {
    chips.push({
      tone: refund.positive ? 'pos' : 'neg',
      label: refund.label,
      icon: refund.positive
        ? <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
        : <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
    });
  }

  const change = changeBadgeLabel(offer, (k) => t(k));
  if (change) {
    chips.push({
      tone: change.positive ? 'pos' : 'neg',
      label: change.label,
      icon: <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>,
    });
  }

  if (chips.length === 0) return <span />;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
            c.tone === 'pos'
              ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
              : c.tone === 'src'
                ? 'border-blue-200/80 bg-blue-50 text-blue-700'
                : c.tone === 'neg'
                  ? 'border-zinc-200 bg-white text-zinc-500'
                  : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          {c.icon}
          {c.label}
        </span>
      ))}
    </div>
  );
}

// ─── Main Card ──────────────────────────────────────────────

function flightCardPropsAreEqual(prev: FlightResultCardProps, next: FlightResultCardProps): boolean {
  // The offer object is replaced wholesale on every stream merge — compare the
  // cheap identity + display fields so unaffected cards skip re-render (WS4.2).
  const a = prev.offer;
  const b = next.offer;
  const offerEqual =
    a === b ||
    (a.offerId === b.offerId &&
      a.productId === b.productId &&
      a.provider === b.provider &&
      a.price?.total === b.price?.total &&
      a.price?.currency === b.price?.currency);
  if (!offerEqual) return false;
  const scalarKeys: Array<keyof FlightResultCardProps> = [
    "searchKey", "searchId", "adults", "tripType", "returnDate",
    "from", "to", "mode", "markups",
  ];
  for (const key of scalarKeys) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

const FlightResultCardBase = function FlightResultCard(props: FlightResultCardProps) {
  const { offer, searchKey, searchId, adults = 1, tripType = 'one_way', returnDate, from, to, mode = 'customer', markups } = props;
  const router = useRouter();
  const toast = useToast();
  const { formatPrice, selectedCurrency } = useCurrency();
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const { isAdmin, isAgent } = useAuth();
  const { data: breakdownSetting } = useQuery({
    queryKey: ['public', 'settings', 'price-breakdown'],
    queryFn: getPriceBreakdownSetting,
    staleTime: 60_000,
  });
  // Breakdown is admin/staff-only AND respects the Price Breakdown toggle
  // (Settings → General) — mirrors the hotel result card gate.
  const showPriceBreakdown = isAdmin && (breakdownSetting?.showPriceBreakdown ?? false);
  const [showDetails, setShowDetails] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const reducedMotion = useReducedMotion();

  const origin = normalizeSegmentCode(from, offer.segments ?? [], 'from');
  const dest = normalizeSegmentCode(to, offer.segments ?? [], 'to');
  const backendJourneys = offer.display?.journeys;

  const journeys = useMemo(() => {
    if (backendJourneys && backendJourneys.length > 0) {
      const allSegments = offer.segments ?? [];
      let offset = 0;
      return backendJourneys.map((j) => {
        const segs = allSegments.slice(offset, offset + j.segmentCount);
        offset += j.segmentCount;
        return { direction: j.direction, segments: segs, label: j.label };
      });
    }
    if (tripType === 'round_trip') {
      return [{ direction: 'itinerary' as const, segments: offer.segments ?? [], label: t('tripRoundTrip') }];
    }
    return partitionJourneys(offer.segments ?? [], origin, dest, tripType);
  }, [offer.segments, origin, dest, tripType, backendJourneys, t]);

  const hasValidSearchKey = typeof searchKey === 'string' && searchKey.length > 0;
  const isTravelport = (offer.provider ?? 'travelport').toLowerCase() === 'travelport';
  const hasProviderValidOfferId = isTravelport ? offer.offerId.includes(':') : Boolean(offer.offerId);
  const canBook = hasValidSearchKey && hasProviderValidOfferId;

  const pricing = offer.pricing;
  const displayAmount = mode === 'agent' && markups ? markups.markedUpPrice : (pricing?.displayPrice?.amount ?? offer.price?.total ?? 0);
  // `MarkedUpOffer` doesn't carry its own currency — use the user's actual
  // selected currency instead of a hardcoded default, so the label always
  // matches what's shown (previously always hardcoded to 'USD').
  const displayCurrency = mode === 'agent' && markups ? selectedCurrency.code : (pricing?.displayPrice?.currency ?? offer.price?.currency ?? selectedCurrency.code);
  const origPrice = mode === 'agent' && markups ? markups.originalPrice : null;
  // Instant price: when the backend pricing block hasn't landed yet, the raw
  // supplier amount converts client-side into the selected currency on the
  // very first paint (same convertAmount the rest of the app uses) — no
  // skeleton wait. When displayPrice lands it replaces an already-correct
  // number, so there is no flash and no perceived slowness.

  const providerLabel: Record<string, string> = { travelport: 'Travelport', duffel: 'Duffel', amadeus: 'Amadeus' };
  const provider = providerLabel[offer.provider?.toLowerCase() ?? ''] ?? null;

  const handleSelect = useCallback(async () => {
    if (isCreatingSnapshot) return;
    setIsCreatingSnapshot(true);
    try {
      if (searchId) cancelSearchJob(searchId).catch(() => {});
      const snapshot = await createFlightSnapshot({
        offerId: offer.offerId,
        provider: (offer.provider ?? 'travelport') as 'travelport' | 'duffel' | 'amadeus',
        searchKey: searchKey ?? '',
        // The user's actual selected currency — NOT the raw supplier/offer
        // currency. This used to send offer.price.currency (e.g. supplier
        // INR), which got baked into the immutable snapshot and showed as
        // raw INR on the detail page even when the user had USD selected.
        displayCurrency: selectedCurrency.code,
        tripType: tripType as 'one_way' | 'round_trip' | 'multi_city',
        offerData: offer,
      });
      storeOffer(offer, searchKey ?? '');
      saveScrollAnchor('flights', offer.offerId);
      router.push(ROUTES.FLIGHTS.SNAPSHOT_DETAILS(snapshot.snapshotId) + (mode === 'agent' ? '?mode=agent' : ''));
    } catch (err) {
      console.error('[FlightResultCard] Failed to create snapshot:', err);
      toast.error(t('selectFailedTitle'), t('selectFailedDesc'));
    } finally {
      setIsCreatingSnapshot(false);
    }
  }, [offer, searchKey, searchId, tripType, isCreatingSnapshot, router, mode, toast, selectedCurrency.code, t]);

  if (!offer.segments || offer.segments.length === 0) {
    return <SkeletonCard />;
  }

  const isProgressiveLoading = !offer.price?.total || !offer.display?.airlineName;
  if (isProgressiveLoading && !canBook) {
    return <SkeletonCard />;
  }

  const airlineName = offer.display?.airlineName ?? journeys[0]?.segments[0]?.marketingCarrier ?? 'Airline';
  const airlineCode = offer.display?.airlineCode ?? carrierCode(journeys[0]?.segments[0]?.marketingCarrier);
  const logoUrl = offer.display?.airlineLogoUrl;
  const flightNums = offer.display?.flightNumber
    ? [offer.display.flightNumber]
    : [...new Set((journeys[0]?.segments ?? []).map((s) => s.flightNumber).filter(Boolean))];

  const journeyCount = journeys.length;
  const isMultiJourney = journeyCount > 1;

  // Grid layout per trip type — one journey breathes full-width, round-trip
  // splits in two on small screens+, multi-city reflows 2→3 columns.
  const journeysGridClass =
    journeyCount === 1
      ? 'grid grid-cols-1'
      : journeyCount === 2
        ? 'grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2'
        : 'grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3';

  const directionLabel = (j: Journey, i: number): string => {
    if (j.direction === 'outbound') return t('outbound');
    if (j.direction === 'return') return t('inbound');
    return journeyCount > 1 ? t('legLabel', { index: i + 1 }) : (j.label || t('flight'));
  };

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease }}
      className="group relative w-full min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-zinc-300 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)]"
      role="article"
      aria-label={t('cardAriaLabel', { origin, destination: dest, price: formatPrice(displayAmount, displayCurrency) })}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleSelect();
        }
      }}
    >
      {/* ── Row 1: Airline identity · price ── */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={airlineName}
              className="h-10 w-10 shrink-0 rounded-xl border border-zinc-100 bg-white object-contain p-1"
              loading="lazy"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-[12px] font-black tracking-tight text-white">
              {airlineCode}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[14px] font-bold leading-tight text-zinc-900">{airlineName}</p>
            <p className="truncate text-[11px] font-medium text-zinc-400">
              {flightNums.length > 0
                ? flightNums.map((n) => `${airlineCode} ${n}`).join(' · ')
                : fmtDateShort(offer.segments[0]?.departureAt)}
            </p>
          </div>
        </div>

        {/* Price — pinned right, generous space (no more 160px squeeze) */}
        <div className="shrink-0 text-right">
          {origPrice && (
            <p className="text-[11px] text-zinc-400 line-through decoration-2">{formatPrice(origPrice, displayCurrency)}</p>
          )}
          <p className="text-[22px] font-black tabular-nums leading-tight tracking-tight text-zinc-900">{formatPrice(displayAmount, displayCurrency)}</p>
          {adults > 1 && <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{t('perPerson')}</p>}
          {(isAdmin || isAgent) && !origPrice && offer.price?.markupPercent != null && offer.price.markupPercent > 0 && showPriceBreakdown && (
            <div className="mt-1 rounded-lg bg-emerald-50 px-1.5 py-1 text-right">
              {(() => {
                // Prefer display-currency values from the pricing block so
                // supplier/markup/total share ONE currency; fall back to the
                // raw price fields (supplier currency) only if absent.
                const baseInDisplay = offer.pricing?.supplierBaseInDisplay;
                const mkInDisplay = offer.pricing?.markupInDisplay;
                const cur = pricing?.displayPrice?.currency ?? displayCurrency;
                const useDisplay = baseInDisplay != null && pricing?.displayPrice?.amount != null;
                return (
                  <>
                    <p className="text-[9px] text-zinc-500 tabular-nums">
                      {t('supplierPrice', { price: formatPrice(useDisplay ? baseInDisplay! : (offer.price?.supplierPrice ?? 0), cur) })}
                    </p>
                    <p className="text-[9px] font-semibold text-emerald-700 tabular-nums">
                      {t('markupPrice', { markup: useDisplay && mkInDisplay != null ? formatPrice(mkInDisplay, cur) : `${offer.price!.markupPercent.toFixed(1)}%` })}
                    </p>
                  </>
                );
              })()}
            </div>
          )}
          <SupplierGate>
            {provider && <p className="mt-0.5 text-[10px] font-medium text-zinc-400">{provider}</p>}
          </SupplierGate>
        </div>
      </div>

      {/* ── Row 2: Journeys — full card width, responsive grid ── */}
      <div className={`px-4 py-3 ${journeysGridClass}`}>
        {journeys.map((j, i) => (
          <JourneyLeg
            key={`${j.direction}-${i}`}
            journey={j}
            offer={offer}
            directionLabel={directionLabel(j, i)}
            wide={journeyCount === 1}
          />
        ))}
      </div>

      {/* ── Row 3: Chips + actions ── */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <MetaChips offer={offer} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
          >
            {showDetails ? t('hideDetails') : t('showDetails')}
            <svg className={`h-3 w-3 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {canBook ? (
            <button
              onClick={handleSelect}
              disabled={isCreatingSnapshot}
              aria-label={t('selectFlightAria', { price: formatPrice(displayAmount, displayCurrency) })}
              className="group/btn inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#033d4a] px-4 py-2 text-[12.5px] font-extrabold text-white shadow-sm transition-all duration-200 hover:bg-[#02313c] hover:shadow-md active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#033d4a] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-wait"
            >
              {isCreatingSnapshot ? (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  {tc('select')}
                  <svg className="h-3 w-3 transition-transform duration-200 group-hover/btn:translate-x-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          ) : (
            <button disabled className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-200 px-4 py-2 text-[11px] font-extrabold text-zinc-500 cursor-not-allowed">
              {!hasValidSearchKey ? tc('loading') : tc('unavailable')}
            </button>
          )}
        </div>
      </div>

      {/* ── Details Drawer ── */}
      <AnimatePresence initial={false}>
        {showDetails && (
          <motion.div
            key="drawer"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reducedMotion ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className="overflow-hidden border-t border-zinc-100"
          >
            <FlightDetailsDrawer journeys={journeys} offer={offer} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Agent Actions ── */}
      {mode === 'agent' && markups && (
        <div className="border-t border-zinc-100 px-4 py-3 flex items-center justify-between gap-3">
          {props.onToggleMarkup ? (
            <MarkupButton markups={markups} currency={displayCurrency} showMarkup={!!props.showMarkupId} onToggle={props.onToggleMarkup} />
          ) : <span />}
          {canBook && (
            <button
              onClick={() => {
                sessionStorage.setItem(`agent_markup_${offer.offerId}`, JSON.stringify(markups));
                handleSelect();
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#033d4a] px-4 py-2 text-[12px] font-extrabold text-white transition-shadow hover:bg-[#02313c] hover:shadow-md active:scale-[0.97]"
            >
              {t('bookWithWallet')}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};

// ─── Details Drawer ─────────────────────────────────────────

function FlightDetailsDrawer({ journeys, offer }: { journeys: Journey[]; offer: FlightOfferView }) {
  const [tab, setTab] = useState<'flights' | 'baggage' | 'fares'>('flights');
  const { formatPrice } = useCurrency();
  const t = useTranslations('Flights');
  const dd = offer.display;
  const refund = refundBadgeLabel(offer, (k) => t(k));
  const change = changeBadgeLabel(offer, (k) => t(k));

  // Supplier penalties arrive in the supplier currency (e.g. Duffel EUR) —
  // convert into the selected display currency and regenerate the label so
  // the number and its description can never disagree (mirror of the backend
  // convertPolicyCurrency, applied here for any policy the backend left raw).
  const policyFee = (
    p: { label?: string; allowed?: boolean | null; penaltyAmount?: number | null; penaltyCurrency?: string | null } | undefined,
    kind: 'refund' | 'change',
  ): { label?: string; fee: string | null } => {
    if (!p || p.penaltyAmount == null || !p.penaltyCurrency) return { label: p?.label, fee: null };
    const fee = formatPrice(p.penaltyAmount, p.penaltyCurrency);
    const label =
      p.allowed && p.penaltyAmount > 0
        ? kind === 'change'
          ? t('changesFrom', { fee })
          : t('cancellationFrom', { fee })
        : p.label;
    return { label, fee };
  };
  const refundFee = policyFee(dd?.refundPolicy, 'refund');
  const changeFee = policyFee(dd?.changePolicy, 'change');

  return (
    <div className="px-4 pb-4">
      {/* Tabs */}
      <div className="flex border-b border-zinc-100 mb-3" role="tablist">
        {(['flights', 'baggage', 'fares'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`relative px-3 py-2 text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${tab === key ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            {key === 'flights' ? t('flightDetails') : key === 'baggage' ? t('baggage') : t('fareRules')}
            {tab === key && <motion.div layoutId="detail-tab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-zinc-900" />}
          </button>
        ))}
      </div>

      {/* Flight Details Tab */}
      {tab === 'flights' && (
        <div className="space-y-4">
          {journeys.map((journey, ji) => (
            <div key={ji} className="rounded-xl border border-zinc-200 overflow-hidden">
              {/* Journey header */}
              <div className={`px-3 py-2 ${journey.direction === 'return' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                <p className="text-[11px] font-bold text-zinc-700">{journey.direction === 'outbound' ? t('outbound') : journey.direction === 'return' ? t('inbound') : journey.label}</p>
              </div>

              {/* Segments */}
              <div className="divide-y divide-zinc-100">
                {journey.segments.map((seg, si) => {
                  const sd = seg.display;
                  const segAirline = sd?.airlineName ?? seg.marketingCarrier ?? t('flight');
                  const flightNum = sd?.flightNumber ?? seg.flightNumber ?? '';
                  const dur = sd?.durationLabel ?? fmtDuration(seg.departureAt, seg.arrivalAt);
                  const depHour = seg.departureAt ? new Date(seg.departureAt).getHours() : -1;
                  const isNight = depHour >= 22 || depHour < 6;

                  return (
                    <div key={si} className="p-3">
                      {/* Flight number and airline */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-zinc-900">{segAirline}</span>
                          {flightNum && <span className="text-[11px] font-semibold text-zinc-500">{flightNum}</span>}
                        </div>
                        {isNight && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">
                            <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                            </svg>
                            {t('nightBadge')}
                          </span>
                        )}
                      </div>

                      {/* Times and route */}
                      <div className="flex items-center gap-3">
                        {/* Departure */}
                        <div className="min-w-[60px]">
                          <p className="text-[16px] font-black tabular-nums text-zinc-900">{fmtTime(seg.departureAt)}</p>
                          <p className="text-[10px] font-semibold text-zinc-500">{sd?.origin?.label ?? seg.from}</p>
                          {sd?.origin?.terminal && <p className="text-[9px] text-zinc-400">{t('terminalLabel', { terminal: sd.origin.terminal })}</p>}
                        </div>

                        {/* Duration line */}
                        <div className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-[10px] font-semibold text-zinc-400">{dur}</span>
                          <div className="w-full flex items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                            <span className="flex-1 border-t border-dotted border-zinc-300" />
                            <svg className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5L21 12 3.5 4.5 6 12l-2.5 7.5Z" />
                            </svg>
                            <span className="flex-1 border-t border-dotted border-zinc-300" />
                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
                          </div>
                        </div>

                        {/* Arrival */}
                        <div className="min-w-[60px] text-right">
                          <p className="flex items-center justify-end gap-1 text-[16px] font-black tabular-nums text-zinc-900">
                            {fmtTime(seg.arrivalAt)}
                            {dayOffset(seg.departureAt, seg.arrivalAt) > 0 && (
                              <span className="rounded bg-zinc-100 px-1 text-[9px] font-black text-zinc-500">
                                +{dayOffset(seg.departureAt, seg.arrivalAt)}d
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] font-semibold text-zinc-500">{sd?.destination?.label ?? seg.to}</p>
                          {sd?.destination?.terminal && <p className="text-[9px] text-zinc-400">{t('terminalLabel', { terminal: sd.destination.terminal })}</p>}
                        </div>
                      </div>

                      {/* Additional info */}
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                        {sd?.aircraftName && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5L21 12 3.5 4.5 6 12l-2.5 7.5Z" />
                            </svg>
                            {sd.aircraftName}
                          </span>
                        )}
                        {sd?.cabinLabel && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                            {sd.cabinLabel}
                          </span>
                        )}
                        {sd?.baggageLabel && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                            {sd.baggageLabel}
                          </span>
                        )}
                        {sd?.operatingAirlineName && sd.operatingAirlineName !== segAirline && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                            {t('operatedBy', { airline: sd.operatingAirlineName })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Baggage Tab */}
      {tab === 'baggage' && (
        <div className="space-y-3">
          {dd?.baggage ? (
            <>
              {/* Summary */}
              {dd.baggage.summaryLabel && (
                <div className="rounded-xl bg-zinc-50 p-3">
                  <p className="text-[12px] font-bold text-zinc-900">{dd.baggage.summaryLabel}</p>
                </div>
              )}

              {/* Detailed breakdown */}
              <div className="grid grid-cols-2 gap-3">
                {dd.baggage.carryOnLabel && (
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('carryOn')}</p>
                    <p className="text-[11px] text-zinc-600">{dd.baggage.carryOnLabel}</p>
                  </div>
                )}
                {dd.baggage.checkedLabel && (
                  <div className="rounded-xl border border-zinc-200 p-3">
                    <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('checkedBag')}</p>
                    <p className="text-[11px] text-zinc-600">{dd.baggage.checkedLabel}</p>
                  </div>
                )}
              </div>
            </>
          ) : offer.baggageText ? (
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-[12px] text-zinc-600">{offer.baggageText}</p>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-50 p-4 text-center">
              <p className="text-[12px] text-zinc-500">{t('baggagePending')}</p>
            </div>
          )}
        </div>
      )}

      {/* Fare Rules Tab */}
      {tab === 'fares' && (
        <div className="space-y-3">
          {/* Fare brand */}
          {(dd?.fareBrand || offer.brandName) && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('fareClass')}</p>
              <p className="text-[12px] font-semibold text-zinc-900">{dd?.fareBrand ?? offer.brandName}</p>
            </div>
          )}

          {/* Cabin */}
          {(dd?.cabinLabel || offer.cabin) && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('cabinClassLabel')}</p>
              <p className="text-[12px] font-semibold text-zinc-900">{dd?.cabinLabel ?? offer.cabin}</p>
            </div>
          )}

          {/* Cancellation policy — normalized label + supplier penalty with context */}
          {(refund || dd?.refundPolicy) && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('cancellationPolicy')}</p>
              <p className="text-[12px] font-semibold text-zinc-900">
                {refund?.label ?? (offer.refundable ? t('refundable') : t('nonRefundable'))}
              </p>
              {refundFee.label && (
                <p className="mt-1 text-[11px] text-zinc-500">{refundFee.label}</p>
              )}
              {refundFee.fee && (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {t('penaltyLabel', { fee: refundFee.fee })}
                </p>
              )}
            </div>
          )}

          {/* Change policy — normalized label + fee detail */}
          {dd?.changePolicy && (
            <div className="rounded-xl border border-zinc-200 p-3">
              <p className="mb-1 text-[11px] font-bold text-zinc-700">{t('changePolicy')}</p>
              <p className="text-[12px] font-semibold text-zinc-900">{change?.label ?? changeFee.label ?? dd.changePolicy.label}</p>
              {changeFee.fee && (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {t('feeLabel', { fee: changeFee.fee })}
                </p>
              )}
            </div>
          )}

          {/* No fare info */}
          {!dd?.fareBrand && !dd?.cabinLabel && !dd?.refundPolicy && !dd?.changePolicy && (
            <div className="rounded-xl bg-zinc-50 p-4 text-center">
              <p className="text-[12px] text-zinc-500">{t('farePending')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white animate-pulse">
      {/* Row 1: airline + price */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-zinc-100" />
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-zinc-100" />
            <div className="h-2.5 w-16 rounded bg-zinc-100" />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="h-5 w-20 rounded bg-zinc-100" />
          <div className="h-2 w-12 rounded bg-zinc-100" />
        </div>
      </div>
      {/* Row 2: journeys */}
      <div className="flex items-center gap-4 px-4 py-4">
        <div className="min-w-[44px] space-y-1.5">
          <div className="h-4 w-12 rounded bg-zinc-100" />
          <div className="h-2.5 w-8 rounded bg-zinc-100" />
        </div>
        <div className="flex flex-1 flex-col items-center gap-1.5">
          <div className="h-2.5 w-10 rounded bg-zinc-100" />
          <div className="h-[2px] w-full rounded bg-zinc-200" />
          <div className="h-3.5 w-14 rounded-full bg-zinc-100" />
        </div>
        <div className="min-w-[44px] space-y-1.5">
          <div className="h-4 w-12 rounded bg-zinc-100" />
          <div className="h-2.5 w-8 rounded bg-zinc-100" />
        </div>
      </div>
      {/* Row 3: chips + button */}
      <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5">
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-zinc-100" />
          <div className="h-5 w-16 rounded-full bg-zinc-100" />
        </div>
        <div className="h-8 w-24 rounded-xl bg-zinc-200" />
      </div>
    </div>
  );
}

/** Memoized: skips re-render when the card's visible data is unchanged (WS4.2). */
export const FlightResultCard = memo(FlightResultCardBase, flightCardPropsAreEqual);
