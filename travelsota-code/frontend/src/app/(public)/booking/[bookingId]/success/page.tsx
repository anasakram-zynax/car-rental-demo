/* Hallmark · macrostructure: Letter-adapted · genre: editorial · theme: Newsprint
 * audience: travelers who just booked a flight
 * use case: confirm booking + next steps
 * tone: editorial — quiet confidence, typographic, asymmetric
 * states: success · pending · failure · access-denied
 * motion: counter-tick · stagger-in · pulse-once
 */
'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useRef, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import { BookingLayout } from '@/components/booking/booking-layout';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/booking/booking-status-badge';
import { useToast } from '@/hooks/useToast';
import { useHotelBooking, useFlightBooking } from '@/features/bookings/hooks';
import { apiRequest } from '@/lib/api/client';
import { WorkflowProgressBar } from '@/components/workflow';
import { downloadInvoice, downloadVoucher } from '@/features/agent/api/agent-documents';
import { getCustomerInvoiceByBooking, getCustomerInvoicePdfUrl } from '@/features/invoices/api/customer-invoices';
import { clearFlowState, getFlowState } from '@/features/hotels/utils/checkout-flow-state';
import { FlightRateComments, duffelRateComments } from '@/features/flights/components/flight-rate-comments';
import { HotelRateComments } from '@/features/hotels/components/hotel-rate-comments';
import type { AggregatedPolicy } from '@/lib/schema/hotel';
import type { WorkflowProgress } from '@/lib/schema/workflow';
import { SupplierGate } from '@/components/shared/supplier-gate';
import { PriceBreakdownNote } from '@/components/shared/price-breakdown-note';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import { CopyButton } from '@/components/admin/shared/CopyButton';
import { shortInvoiceNumber } from '@/lib/utils/invoice';
import { getLastUrl } from '@/lib/utils/search-cache';
import { getCancellationPolicyView } from '@/lib/utils/cancellation-policy';

const ease = [0.16, 1, 0.3, 1] as const;

const MAX_WAIT = { hotelbeds: 60_000, ratehawk: 90_000, travelport_hold: 90_000, travelport_ticket: 120_000, default: 90_000 };

interface ProgressResponse {
  bookingId: string; module: 'hotels' | 'flights'; provider: string; status: 'running' | 'success' | 'failed' | 'idle';
  percent: number; title: string; message?: string; customerMessage?: string; adminTrace?: Record<string, unknown>;
  steps: Array<{ id: string; label: string; description?: string; status: string; provider?: string; startedAt?: string; completedAt?: string; durationMs?: number; message?: string }>;
}

async function fetchProgress(bookingId: string, isHotel: boolean): Promise<ProgressResponse> {
  return apiRequest<ProgressResponse>(isHotel ? `/hotels/bookings/${bookingId}/progress` : `/flights/bookings/${bookingId}/progress`);
}

/* ── Icons ────────────────────────────────────────────────────────── */

function CheckIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function PlaneIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5L21 12 3.5 4.5 6 12l-2.5 7.5Z" />
    </svg>
  );
}

function HotelIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
    </svg>
  );
}

/* ── Confetti — muted editorial palette ───────────────────────────── */

const CONFETTI_COLORS = ['#033d4a', '#0d9488', '#6b7280', '#d97706', '#059669', '#6366f1'] as const;
const CONFETTI_COUNT = 16;

function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function ConfettiBurst({ reducedMotion }: { reducedMotion: boolean | null }) {
  const particles = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        angle: (i / CONFETTI_COUNT) * 360,
        dist: 40 + seededRandom(i + 1) * 70,
        size: 4 + seededRandom(i + 100) * 5,
        delay: 0.15 + seededRandom(i + 200) * 0.2,
        duration: 0.6 + seededRandom(i + 300) * 0.3,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ left: '12%', top: '50%', width: p.size, height: p.size, backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
          initial={reducedMotion ? false : { x: 0, y: 0, opacity: 0.8, scale: 0 }}
          animate={{ x: Math.cos((p.angle * Math.PI) / 180) * p.dist, y: Math.sin((p.angle * Math.PI) / 180) * p.dist, opacity: 0, scale: 1 }}
          transition={{ duration: p.duration, delay: p.delay, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      ))}
    </div>
  );
}

/* ── Action Row — inline icon + text, left-aligned ────────────────── */

function ActionRow({ icon, title, desc, onClick, href, disabled }: { icon: React.ReactNode; title: string; desc: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const content = (
    <motion.div
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12, ease }}
      className={`flex items-center gap-3.5 rounded-lg border border-zinc-200/80 bg-white px-4 py-3 transition-all duration-150 hover:border-zinc-300 hover:shadow-[0_1px_8px_rgba(3,61,74,0.04)] ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-zinc-600">{icon}</div>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
      </div>
      <svg className="ml-auto h-4 w-4 shrink-0 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </motion.div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className="w-full text-left">{content}</button>;
}

/* ── Detail Row — clean key/value with hairline ───────────────────── */

/** Admin-only markup visibility on the success page (agents/customers never see it). */
function SuccessMarkupNote({ hotelBooking, flightBooking }: { hotelBooking: any; flightBooking: any }) {
  const t = useTranslations('Checkout');
  const { isAdmin } = useAuth();
  const { ratesMap } = useCurrencyData();
  if (!isAdmin) return null;

  const supplierAmount = hotelBooking?.supplierAmount ?? flightBooking?.supplierAmount ?? null;
  const supplierCurrency = hotelBooking?.supplierCurrency ?? flightBooking?.supplierCurrency ?? null;
  const markupAmount = hotelBooking?.markupAmount ?? flightBooking?.markupAmount ?? null;
  const customerAmount = hotelBooking?.customerAmount ?? flightBooking?.customerAmount ?? null;
  const currency = hotelBooking?.customerCurrency ?? flightBooking?.customerCurrency ?? 'USD';

  // The supplier amount is quoted in the SUPPLIER currency (e.g. RateHawk EUR).
  // Prefer the base persisted in the CHARGE currency at booking creation
  // (markupSnapshot.supplierBaseInChargeCurrency); fall back to converting the
  // raw supplier amount with the current rates. Rendering the raw supplier
  // amount under the customer-currency label made the math not add up.
  const snapshot = hotelBooking?.markupSnapshot ?? flightBooking?.markupSnapshot ?? null;
  let supplierInDisplay: number | null = snapshot?.supplierBaseInChargeCurrency ?? null;
  if (supplierInDisplay == null && supplierAmount != null && supplierCurrency) {
    const fromRate = ratesMap[String(supplierCurrency).toUpperCase()] ?? 1;
    const toRate = ratesMap[String(currency).toUpperCase()] ?? 1;
    if (fromRate > 0 && toRate > 0) {
      supplierInDisplay = Math.round((supplierAmount / fromRate) * toRate * 100) / 100;
    }
  }

  return (
    <div className="pt-1">
      <PriceBreakdownNote
        supplierAmount={supplierInDisplay}
        markupAmount={markupAmount}
        total={customerAmount}
        currency={currency}
        label={t('markupAdminLabel')}
      />
    </div>
  );
}

function DetailRow({ label, value, mono, pulse, copy }: { label: string; value: React.ReactNode; mono?: boolean; pulse?: boolean; copy?: string }) {
  const t = useTranslations('Checkout');
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-zinc-100 last:border-0">
      <span className="text-xs font-medium text-zinc-400 uppercase tracking-widest shrink-0">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium text-zinc-800 text-right min-w-0 ${mono ? 'font-mono text-xs tracking-tight' : ''}`}>
        {pulse ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 animate-pulse" />
            {value}
          </span>
        ) : (
          <span className="truncate">{value}</span>
        )}
        {copy ? <CopyButton value={copy} label={t('copyWithLabel', { label })} /> : null}
      </span>
    </div>
  );
}

/* ── Detail Row — clean key/value with hairline ───────────────────── */

/* ══════════════════════════════════════════════════════════════════════ */

/* ── Price formatting (module-level, shared) ──────────────────────── */

export default function BookingSuccessPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const t = useTranslations('Checkout');
  const [bookingId, setBookingId] = useState('');
  const searchParams = useSearchParams();
  const bookingType = searchParams.get('type');
  const mode = searchParams.get('mode') ?? 'customer';
  const isAgent = mode === 'agent';
  // Manual methods (bank_transfer / pay_later) never ticket on their own —
  // the booking waits held for admin verify/issue or later payment. Polling
  // the supplier progress would spin forever, so manual mode renders the
  // held state directly from the booking record instead.
  const isManual = mode === 'manual';
  const isHotel = bookingType === 'hotel';
  const toast = useToast();
  const reducedMotion = useReducedMotion();
  const { isAuthenticated } = useAuth();
  // Totals render in the viewer's selected display currency (converted from
  // the charge currency).
  const { formatPrice } = useCurrency();

  useEffect(() => { params.then(({ bookingId }) => setBookingId(bookingId)); }, [params]);

  // Capture checkout flow info (room, guest email) BEFORE it gets cleared.
  const [flowInfo] = useState(() => {
    if (typeof window === 'undefined') return null;
    const s = getFlowState();
    return s ? { roomName: s.roomName || null, holderEmail: s.formState?.holderEmail || null } : null;
  });
  useEffect(() => { clearFlowState(); }, []);

  const [progress, setProgress] = useState<ProgressResponse | null>(null);
  const [maxWaitReached, setMaxWaitReached] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const startTimeRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ponytail temp: demo fake fallback settles seconds after transient failed_supplier_booking; one delayed recheck catches flipped fake success. Remove with fake fallback.
  const failureRecheckDoneRef = useRef(false);
  const failureRecheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const { data: flightBooking, refetch: refetchFlight } = useFlightBooking(bookingId, { enabled: !isHotel && !!bookingId });
const { data: hotelBooking, refetch: refetchHotel } = useHotelBooking(bookingId, { enabled: isHotel && !!bookingId });

const flightRatePolicies = useMemo(() => {
  if (isHotel || !flightBooking) return null;
  const snapshot = (flightBooking.offerSnapshot ?? null) as Record<string, any> | null;
  const rawOffer = snapshot?.rawOffer as Record<string, any> | undefined;
  // Duffel: shared builder maps conditions + taxes + expiry in one place
  if (flightBooking.provider === 'duffel' && rawOffer?.conditions) {
    return duffelRateComments(rawOffer as any);
  }
  // Other providers: normalized display policies captured at search time
  const display = snapshot?.display as
    | { refundPolicy?: any; changePolicy?: any }
    | undefined;
  if (display?.refundPolicy || display?.changePolicy) {
    return {
      provider: flightBooking.provider,
      refund: display.refundPolicy ?? null,
      change: display.changePolicy ?? null,
      taxAmount: null,
    };
  }
  return null;
}, [isHotel, flightBooking]);

  const workflowStatus = progress?.status;
  const bookingStatus = hotelBooking?.status ?? flightBooking?.status;
  const customerMsg = progress?.customerMessage;
  const reference = flightBooking?.locatorCode ?? hotelBooking?.reference;
  const bookingDisplayId = flightBooking?.publicRef ?? hotelBooking?.publicRef ?? null;
  const isRatehawk = hotelBooking?.provider === 'ratehawk';
  const isHotelbeds = hotelBooking?.provider === 'hotelbeds';
  const isTravelport = flightBooking?.provider === 'travelport';
  const supplierOrderId = hotelBooking?.supplierOrderId;
  const hotelConfirmationNumber = hotelBooking?.hotelConfirmationNumber;
  const hcnStatus = hotelBooking?.hotelConfirmationStatus;
  const isTicketed = bookingStatus === 'ticketed';
  const supplierStatus = hotelBooking?.supplierStatus;

  const paymentStatus = flightBooking?.paymentStatus ?? hotelBooking?.paymentStatus ?? null;

  // Two independent "held" cases, both shown with the same green template:
  // (1) manual checkout (bank_transfer/pay_later) — the customer's own
  //     payment step isn't done yet, the supplier was never contacted.
  // (2) awaiting_issue — Auto-Issue After Payment is off; payment already
  //     succeeded (see paymentStatus) but an admin must click Issue. This is
  //     a real, backend-driven status now — no more guessing from a PNR
  //     being present or the ?mode= query param.
  const MANUAL_UNPAID_HELD = ['pending_payment', 'held_pending_payment', 'held'];
  const isManualUnpaidHeld = isManual && bookingStatus != null && MANUAL_UNPAID_HELD.includes(bookingStatus);
  const isAwaitingIssue = bookingStatus === 'awaiting_issue';
  const showHeldSection = isManualUnpaidHeld || isAwaitingIssue;
  const isBookingSuccess = bookingStatus && ['booked', 'held', 'confirmed', 'completed', 'ticketed'].includes(bookingStatus) && !showHeldSection;
  // held/booked/ticketed are internal supplier-workflow states — none of them
  // mean anything to a customer. Every success status reads as "Confirmed";
  // the underlying bookingStatus value itself is unchanged.
  const friendlyStatusLabel = isBookingSuccess
    ? t('statusConfirmed')
    : isAwaitingIssue
      ? t('statusHeldForReview')
      : bookingStatus?.replace(/_/g, ' ');
  const isBookingFailure = bookingStatus && ['failed', 'failed_supplier_booking', 'failed_payment'].includes(bookingStatus);
  const isBookingTerminal = isBookingSuccess || isBookingFailure;
  const isWaitingSupplierResponse = bookingStatus === 'booking_in_progress' && supplierStatus === 'processing';
  const isProgressTerminal = progress && ['success', 'failed'].includes(progress.status);
  // Held bookings are terminal-for-display: nothing more will arrive on its
  // own (ticketing needs admin issue). Without this the page spins + shows
  // "Still processing" forever on holds.
  const isPending = !!bookingId && !isBookingTerminal && !isProgressTerminal && !showHeldSection;

  const failureInfo = useMemo(() => {
    if (!isBookingFailure) return null;
    const reason = customerMsg ?? flightBooking?.message ?? hotelBooking?.message ?? '';
    const lower = reason.toLowerCase();

    if (lower.includes('invalid phone') || lower.includes('phone number')) {
      return { title: t('invalidPhoneTitle'), guidance: t('invalidPhoneGuidance'), action: null };
    }
    if (lower.includes('invalid_passenger_title') || (lower.includes('title') && lower.includes('passenger')) || lower.includes('traveler title')) {
      return { title: t('invalidTravelerTitle'), guidance: t('invalidTravelerGuidance'), action: null };
    }
    if (lower.includes('fare is not available') || lower.includes('fare not available') || lower.includes('4110') || lower.includes('no longer available') || lower.includes('offer unavailable') || lower.includes('expired')) {
      return { title: t('fareUnavailableTitle'), guidance: t('fareUnavailableGuidance'), action: 'search' as const };
    }
    if (lower.includes('price changed') || lower.includes('price_changed')) {
      return { title: t('priceChangedTitle'), guidance: t('priceChangedGuidance'), action: 'search' as const };
    }
    if (lower.includes('payment') || bookingStatus === 'failed_payment') {
      return { title: t('paymentIssueTitle'), guidance: t('paymentIssueGuidance'), action: null };
    }
    if (lower.includes('offer') && (lower.includes('unavailable') || lower.includes('not found'))) {
      return { title: t('offerUnavailableTitle'), guidance: t('offerUnavailableGuidance'), action: 'search' as const };
    }
    return { title: t('bookingFailedTitle'), guidance: reason || t('bookingFailedDefaultGuidance'), action: 'search' as const };
  }, [isBookingFailure, customerMsg, flightBooking?.message, hotelBooking?.message, bookingStatus, t]);

  const { data: invoice } = useQuery({
    queryKey: ['invoice', 'by-booking', bookingId],
    queryFn: () => getCustomerInvoiceByBooking(bookingId),
    // Guests have no session — the invoice endpoint is auth-gated, and a 401
    // here triggers a token-refresh failure that bounces guests to /signin
    // right after they paid. Only fetch for authenticated customers.
    enabled: !!bookingId && (!!isBookingSuccess || !!showHeldSection) && !isAgent && isAuthenticated,
    retry: 5,
    retryDelay: 2000,
  });

  const maxWaitMs = useMemo(() => {
    if (isHotel && isHotelbeds) return MAX_WAIT.hotelbeds;
    if (isHotel && isRatehawk) return MAX_WAIT.ratehawk;
    if (!isHotel && isTravelport) return isTicketed ? MAX_WAIT.travelport_ticket : MAX_WAIT.travelport_hold;
    return MAX_WAIT.default;
  }, [isHotel, isHotelbeds, isRatehawk, isTravelport, isTicketed]);

  /* ── Polling Effect ──────────────────────────────────────────────── */
  /* eslint-disable react-hooks/exhaustive-deps -- narrow deps keep the
     poll loop stable; refetch fns + progress + t intentionally excluded. */
  useEffect(() => {
    if (!bookingId) return;
    if (isManual || isAwaitingIssue) {
      // No supplier work will ever arrive — one fresh read, then stop
      // (awaiting_issue waits on an admin clicking Issue, not the supplier).
      if (isHotel) refetchHotel().catch(() => {});
      else refetchFlight().catch(() => {});
      return;
    }
    if (isBookingTerminal) {
      if (progress === null) fetchProgress(bookingId, isHotel).then(setProgress).catch(() => {});
      // A failed status can be transient: the demo fallback settles a failed
      // Travelport booking as a fake success a few seconds later (the backend
      // also reports "processing" for fake-eligible sessions during that
      // window). Keep re-checking every 5s for up to a minute so a stale
      // failure flips to the settled booking; a real failure just stays failed.
      if (isBookingFailure && !failureRecheckDoneRef.current && !failureRecheckRef.current) {
        let ticks = 0;
        const tick = () => {
          ticks += 1;
          fetchProgress(bookingId, isHotel).then(setProgress).catch(() => {});
          if (isHotel) refetchHotel().catch(() => {});
          else refetchFlight().catch(() => {});
          if (ticks < 12) {
            failureRecheckRef.current = setTimeout(tick, 5000);
          } else {
            failureRecheckDoneRef.current = true;
            failureRecheckRef.current = null;
          }
        };
        failureRecheckRef.current = setTimeout(tick, 5000);
      }
      return () => { if (failureRecheckRef.current) { clearTimeout(failureRecheckRef.current); failureRecheckRef.current = null; } };
    }
    if (startTimeRef.current === 0) startTimeRef.current = Date.now();
    let cancelled = false;
    async function poll() {
      try {
        const [data, bookingResult] = await Promise.all([fetchProgress(bookingId, isHotel), isHotel ? refetchHotel() : refetchFlight()]);
        if (cancelled) return; setProgress(data); setProgressError(null); setAccessDenied(false);
        const bs = bookingResult?.data?.status;
        if (['success', 'failed'].includes(data.status) || (bs && ['held', 'booked', 'ticketed', 'failed', 'failed_supplier_booking', 'failed_payment', 'cancelled'].includes(bs))) {
          if (isHotel) await refetchHotel(); else await refetchFlight(); return;
        }
        if (Date.now() - startTimeRef.current > maxWaitMs) { setMaxWaitReached(true); return; }
        pollRef.current = setTimeout(poll, 3000);
      } catch (err: unknown) {
        if (cancelled) return;
        const statusCode = (err as Record<string, unknown>)?.statusCode;
        if (statusCode === 401 || statusCode === 403) {
          setAccessDenied(true);
          setProgressError(t('noAccessError'));
          return;
        }
        setProgressError(err instanceof Error ? err.message : t('loadingFailed'));
        pollRef.current = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { cancelled = true; if (pollRef.current) clearTimeout(pollRef.current); };
  }, [bookingId, isHotel, isBookingTerminal, isAwaitingIssue, maxWaitMs]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const statusNotifiedRef = useRef<string | null>(null);
  useEffect(() => { if (!isBookingTerminal || statusNotifiedRef.current === bookingStatus) return; statusNotifiedRef.current = bookingStatus; if (isBookingSuccess) toast.success(t('bookingConfirmedToast'), t('bookingConfirmedDesc')); else if (isBookingFailure) toast.error(failureInfo?.title ?? t('bookingFailedTitle'), failureInfo?.guidance ?? t('bookingFailedDefaultGuidance')); }, [bookingStatus, isBookingTerminal, isBookingSuccess, isBookingFailure, failureInfo, t]);
  const manualNotifiedRef = useRef(false);
  useEffect(() => {
    if (!showHeldSection || manualNotifiedRef.current) return;
    manualNotifiedRef.current = true;
    toast.success(
      isAwaitingIssue ? t('paymentReceivedTitle') : t('bookingReceivedTitle'),
      isAwaitingIssue
        ? t('awaitingIssueDesc')
        : t('manualHoldDesc'),
    );
  }, [showHeldSection, isAwaitingIssue, toast, t]);

  const hotelName = typeof hotelBooking?.hotel === 'object' && hotelBooking?.hotel !== null ? (hotelBooking.hotel as Record<string, unknown>)?.name : undefined;
  const statusLabel = friendlyStatusLabel;

  // ── Price + traveler/guest data for the redesigned details ────────
  const paidAmount = isHotel
    ? (hotelBooking?.customerAmount ?? hotelBooking?.amount ?? null)
    : (flightBooking?.amount ?? null);
  const paidCurrency = isHotel
    ? (hotelBooking?.customerCurrency ?? hotelBooking?.currency ?? null)
    : (flightBooking?.currency ?? null);

  const travelers = useMemo(() => {
    if (isHotel) return [];
    const snap = flightBooking?.travelerSnapshot ?? [];
    return snap.map((p) => ({
      name: [p.givenName, p.surname].filter(Boolean).join(' '),
      type: p.passengerTypeCode,
    }));
  }, [isHotel, flightBooking]);

  const guests = useMemo(() => {
    if (!isHotel) return [];
    const paxes = (hotelBooking?.paxes ?? []) as Array<{ name?: string; surname?: string; type?: string }>;
    return paxes.map((p) => ({ name: [p.name, p.surname].filter(Boolean).join(' '), type: p.type }));
  }, [isHotel, hotelBooking]);

  const holderName = isHotel && hotelBooking?.holder
    ? [hotelBooking.holder.name, hotelBooking.holder.surname].filter(Boolean).join(' ')
    : null;

  const tripTypeLabel = flightBooking?.offerSnapshot?.tripType === 'round_trip'
    ? t('tripRoundTrip')
    : flightBooking?.offerSnapshot?.tripType === 'one_way'
      ? t('tripOneWay')
      : null;

  const bookingWorkflow = useMemo<WorkflowProgress | null>(() => {
    if (!bookingStatus && !workflowStatus) return null;
    let wfStatus: WorkflowProgress['status']; let title: string; let message: string | undefined; let percent: number;
    if (isBookingSuccess) { wfStatus = 'success'; title = t('workflowConfirmedTitle'); message = isRatehawk && hcnStatus === 'pending' && !hotelConfirmationNumber ? t('workflowHotelConfirmPending') : undefined; percent = 100; }
    else if (isBookingFailure) { wfStatus = 'failed'; title = failureInfo?.title ?? t('workflowBookingFailed'); message = failureInfo?.guidance ?? customerMsg ?? t('workflowUnableToComplete'); percent = 100; }
    else if (isWaitingSupplierResponse) { wfStatus = 'running'; title = t('workflowSubmittingTitle'); percent = progress?.percent ?? 80; }
    else if (bookingStatus === 'booking_in_progress' || workflowStatus === 'running') { wfStatus = 'running'; title = t('workflowProcessingTitle'); percent = progress?.percent ?? 65; }
    else { wfStatus = 'idle'; title = t('workflowBookingTitle'); percent = 0; }
    return { module: isHotel ? 'hotels' : 'flights', status: wfStatus, percent, title, message: message ?? '', steps: [] };
  }, [bookingStatus, workflowStatus, isBookingSuccess, isBookingFailure, isWaitingSupplierResponse, isRatehawk, isHotelbeds, isTravelport, hcnStatus, hotelConfirmationNumber, customerMsg, progress?.percent, isHotel, failureInfo, t]);

  /* ── Sidebar ─────────────────────────────────────────────────────── */
  const sidebar = isBookingSuccess ? (
    <motion.div initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: 0.3 }} className="space-y-4">
      {/* Amount paid card */}
      {paidAmount != null && (
        <div className="rounded-xl border border-brand-teal/20 bg-gradient-to-br from-brand-teal/[0.07] to-transparent p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{t('totalPaid')}</p>
          <p className="mt-1 text-2xl font-black tabular-nums tracking-tight text-charcoal">
            {formatPrice(paidAmount, paidCurrency ?? 'USD')}
          </p>
          {isHotel && flowInfo?.roomName ? (
            <p className="mt-2 truncate text-xs text-zinc-500">{flowInfo.roomName}</p>
          ) : null}
          <SuccessMarkupNote
            hotelBooking={hotelBooking as any}
            flightBooking={flightBooking as any}
          />
        </div>
      )}

      {/* Confirmation card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900">
            <CheckIcon className="h-3.5 w-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-zinc-900">{t('bookingConfirmed')}</h3>
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">{t('status')}</span>
            <span className="text-xs font-bold text-zinc-900 capitalize">{statusLabel}</span>
          </div>
          {bookingDisplayId ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">{t('bookingId')}</span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-zinc-900">
                {bookingDisplayId}
                <CopyButton value={bookingDisplayId} label={t('copyBookingId')} />
              </span>
            </div>
          ) : null}
          {reference ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">{t('reference')}</span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-zinc-900">
                {reference}
                <CopyButton value={reference} label={t('copyBookingReference')} />
              </span>
            </div>
          ) : null}
          {hotelConfirmationNumber ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">{t('confirmationLabel')}</span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-zinc-900">
                {hotelConfirmationNumber}
                <CopyButton value={hotelConfirmationNumber} label={t('copyHotelConfirmation')} />
              </span>
            </div>
          ) : null}
          {invoice?.invoiceNumber ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-zinc-400">{t('invoice')}</span>
              <span className="flex items-center gap-1 font-mono text-xs font-bold text-zinc-900" title={invoice.invoiceNumber}>
                #{shortInvoiceNumber(invoice.invoiceNumber)}
                <CopyButton value={invoice.invoiceNumber} label={t('copyInvoiceNumber')} />
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Trust signals */}
      <div className="rounded-xl border border-zinc-100 bg-white p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
          {t('confirmationSentNote')}
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <svg className="h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          {t('paymentSecureNote')}
        </div>
      </div>
    </motion.div>
  ) : undefined;

  // Back exits the workflow to the search that started it — explicit URL,
  // never router.back() (back into a paid checkout risks double-charge).
  const backToSearch = getLastUrl(isHotel ? 'hotels-search' : 'flights-search')
    ?? (isHotel ? '/hotels/search' : '/flights/search');

  return (
    <BookingLayout title={accessDenied ? t('accessRestricted') : isBookingSuccess ? t('bookingConfirmed') : t('bookingTitle')} backHref={isBookingSuccess ? backToSearch : '/'} backLabel={isBookingSuccess ? t('backToSearch') : t('homeAction')} sidebar={accessDenied ? undefined : sidebar}>

      {/* ── Status Hero ─────────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease }}
        className="relative mb-8"
      >
        {/* Success state */}
        {isBookingSuccess && !accessDenied && (
          <div className="relative">
            <ConfettiBurst reducedMotion={reducedMotion} />

            {/* Status icon — solid circle, no gradient */}
            <motion.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 shadow-[0_0_0_8px_rgba(3,61,74,0.04)]"
            >
              <CheckIcon className="h-6 w-6 text-white" />
            </motion.div>

            {/* Headline — left-aligned, bold, no italic */}
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
            >
              {isHotel ? t('hotelBookingConfirmed') : t('flightBookingConfirmed')}
            </motion.h1>

            {/* Subline + reference — asymmetric, left-biased */}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.3 }}
              className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1"
            >
              <p className="text-sm text-zinc-500">
                {isHotel
                  ? <>{t('hotelStayConfirmed', { hotelName: String(hotelName ?? 'your hotel') })}</>
                  : <>{t('flightConfirmedDesc')}</>
                }
              </p>
              {reference && (
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-900 bg-zinc-100 rounded-md px-2 py-0.5">
                  {reference}
                  <CopyButton value={reference} label={t('copyBookingReference')} />
                </span>
              )}
              {paidAmount != null && (
                <span className="text-sm font-semibold text-charcoal tabular-nums">
                  {formatPrice(paidAmount, paidCurrency ?? 'USD')} <span className="font-normal text-zinc-400">{t('paidSuffix')}</span>
                </span>
              )}
            </motion.div>
          </div>
        )}

        {/* E-Ticket hero — ticket numbers are the most important artifact
            on a ticketed booking: big, copyable, above the details */}
        {!isHotel &&
        !accessDenied &&
        Array.isArray((flightBooking as any)?.workflowSummary?.ticketNumbers) &&
        (flightBooking as any).workflowSummary.ticketNumbers.length > 0 ? (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease, delay: 0.2 }}
            className="mb-8 rounded-2xl bg-zinc-900 p-5 sm:p-6"
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
                {t('eTicketIssued')}
                {(flightBooking as any).workflowSummary.ticketNumbers.length > 1
                  ? ` ${t('eTicketTravelerCount', { count: (flightBooking as any).workflowSummary.ticketNumbers.length })}`
                  : ''}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {((flightBooking as any).workflowSummary.ticketNumbers as string[]).map(
                (ticket: string, i: number) => (
                  <div key={ticket} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-xl font-extrabold tracking-wider text-white sm:text-2xl">
                      {ticket}
                    </span>
                    <CopyButton value={ticket} label={t('copyTicket', { n: i + 1 })} />
                    {flightBooking?.locatorCode ? (
                      <span className="font-mono text-xs font-semibold text-zinc-400">
                        {t('pnrWithCode', { code: flightBooking.locatorCode })}
                      </span>
                    ) : null}
                  </div>
                ),
              )}
            </div>
            <p className="mt-3 text-xs text-zinc-400">
              {t('eTicketCheckinNote')}
            </p>
          </motion.div>
        ) : null}

        {/* Held state: payment received (auto-issue off) or manual checkout still awaiting the customer own payment. Same visual language as the confirmed-success state above. */}
        {showHeldSection && !accessDenied && (
          <div>
            <motion.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900 shadow-[0_0_0_8px_rgba(3,61,74,0.04)]"
            >
              {isAwaitingIssue ? (
                <CheckIcon className="h-6 w-6 text-white" />
              ) : (
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              )}
            </motion.div>
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
            >
              {isAwaitingIssue ? t('bookingReceivedTitle') : t('bookingOnHoldTitle')}
            </motion.h1>
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.3 }}
              className="mt-2 text-sm text-zinc-500 max-w-md"
            >
              {isAwaitingIssue
                ? t('heldAwaitingIssueDesc')
                : invoice
                ? t('heldWithInvoiceDesc')
                : t('heldWaitingDesc')}
            </motion.p>
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.35 }}
              className="mt-5 rounded-2xl border border-zinc-200/70 bg-white p-5"
            >
              <DetailRow label={t('bookingStatusLabel')} value={<BookingStatusBadge status={bookingStatus ?? ''} />} />
              <DetailRow label={t('paymentStatusLabel')} value={<PaymentStatusBadge status={paymentStatus} />} />
              {invoice?.invoiceNumber ? (
                <DetailRow label={t('invoiceNumberLabel')} value={invoice.invoiceNumber} mono copy={invoice.invoiceNumber} />
              ) : (
                <DetailRow label={t('invoiceNumberLabel')} value={t('generatingStatus')} pulse />
              )}
              {reference ? (
                <DetailRow label={t('reference')} value={reference} mono copy={reference} />
              ) : invoice?.invoiceNumber ? (
                <DetailRow label={t('reference')} value={invoice.invoiceNumber} mono copy={invoice.invoiceNumber} />
              ) : null}
            </motion.div>
          </div>
        )}

        {/* Pending state */}
        {isPending && !showHeldSection && !accessDenied && (
          <div>
            <motion.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="relative mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-teal/[0.07]"
            >
              <span className="absolute inset-0 rounded-full border-2 border-brand-teal/20 animate-ping" />
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-brand-teal" />
            </motion.div>
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
            >
              {t('finalizingBooking')}
            </motion.h1>
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.3 }}
              className="mt-2 text-sm text-zinc-500 max-w-md"
            >
              {isWaitingSupplierResponse ? t('pendingSupplierDesc') : t('pendingGenericDesc')}
            </motion.p>
            {paidAmount != null && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease, delay: 0.35 }}
                className="mt-5 inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
              >
                <svg className="h-4 w-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-left">
                  <p className="text-xs font-semibold text-zinc-700 tabular-nums">{t('paymentReceivedAmount', { amount: formatPrice(paidAmount, paidCurrency ?? 'USD') })}</p>
                  <p className="text-[11px] text-zinc-400">{t('paymentSafeNote')}</p>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Failure state */}
        {isBookingFailure && !accessDenied && (
          <div>
            <motion.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 shadow-[0_0_0_8px_rgba(220,38,38,0.04)]"
            >
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </motion.div>
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
            >
              {failureInfo?.title ?? t('bookingFailedTitle')}
            </motion.h1>
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.3 }}
              className="mt-2 text-sm text-zinc-500 max-w-md"
            >
              {failureInfo?.guidance ?? customerMsg ?? t('failureGuidanceFallback')}
            </motion.p>
            {failureInfo?.guidance && (
              <motion.div
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease, delay: 0.35 }}
                className="mt-5 max-w-md rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-800"
              >
                <p className="mb-1 font-bold uppercase tracking-wide">{t('whatYouCanDo')}</p>
                {failureInfo.action === 'search'
                  ? t('searchAgainGuidance')
                  : t('supportGuidance')}
              </motion.div>
            )}
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.4 }}
              className="mt-5 max-w-xs rounded-xl border border-zinc-200/70 bg-white p-4"
            >
              <DetailRow label={t('bookingStatusLabel')} value={<BookingStatusBadge status={bookingStatus ?? ''} />} />
              <DetailRow label={t('paymentStatusLabel')} value={<PaymentStatusBadge status={paymentStatus} />} />
            </motion.div>
          </div>
        )}

        {/* Access denied */}
        {accessDenied && (
          <div>
            <motion.div
              initial={reducedMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50"
            >
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </motion.div>
            <motion.h1
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900"
            >
              {t('accessRestrictedTitle')}
            </motion.h1>
            <motion.p
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.3 }}
              className="mt-2 text-sm text-zinc-500 max-w-md"
            >
              {t('accessDeniedDesc')}
            </motion.p>
            <motion.div
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.4 }}
              className="mt-5"
            >
              <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors">
                {t('goHomeAction')}
              </Link>
            </motion.div>
          </div>
        )}
      </motion.div>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      {!maxWaitReached && !accessDenied && !showHeldSection && bookingWorkflow && (isPending || isBookingSuccess || isBookingFailure) ? (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.25 }}
          className="mb-8"
        >
          <div className={`rounded-xl border p-4 ${bookingWorkflow.status === 'running' ? 'border-zinc-200 bg-white' : bookingWorkflow.status === 'success' ? 'border-zinc-200 bg-white' : 'border-red-200 bg-red-50/50'}`}>
            <WorkflowProgressBar progress={bookingWorkflow} showPercent={bookingWorkflow.status !== 'failed'} />
          </div>
        </motion.div>
      ) : null}

      {/* ── Booking Details ──────────────────────────────────────────── */}
      {(isBookingSuccess || showHeldSection) && !accessDenied && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-3">
            {isHotel ? <HotelIcon className="h-4 w-4 text-zinc-400" /> : <PlaneIcon className="h-4 w-4 text-zinc-400" />}
            <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{isHotel ? t('hotelDetails') : t('flightDetails')}</h2>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-5">
            {/* Price first — what the customer cares about most */}
            {paidAmount != null && (
              <div className="flex items-center justify-between py-4 border-b border-zinc-100">
                <span className="text-xs font-bold uppercase tracking-widest text-brand-teal">{t('totalPaid')}</span>
                <span className="text-right">
                  <span className="text-lg font-black tabular-nums tracking-tight text-charcoal">
                    {formatPrice(paidAmount, paidCurrency ?? 'USD')}
                  </span>
                </span>
              </div>
            )}
            <DetailRow label={t('bookingId')} value={bookingDisplayId || bookingId || '...'} mono copy={bookingDisplayId ?? bookingId} />
            <DetailRow label={t('bookingStatusLabel')} value={<BookingStatusBadge status={bookingStatus ?? ''} />} />
            <DetailRow label={t('paymentStatusLabel')} value={<PaymentStatusBadge status={paymentStatus} />} />
            {reference ? <DetailRow label={t('reference')} value={reference} mono copy={reference} /> : null}

            {isHotel ? (
              <>
                {hotelName ? <DetailRow label={t('propertyLabel')} value={<span className="font-bold">{String(hotelName)}</span>} /> : null}
                {flowInfo?.roomName ? <DetailRow label={t('roomLabel')} value={flowInfo.roomName} /> : null}
                {holderName ? <DetailRow label={t('leadGuestLabel')} value={holderName} /> : null}
                {guests.length > 0 ? (
                  <DetailRow
                    label={t('guestsLabel')}
                    value={`${t('guestsCount', { count: guests.length })}${guests.some((g) => g.type === 'CH') ? ` ${t('guestsChildSuffix', { childCount: guests.filter((g) => g.type === 'CH').length })}` : ''}`}
                  />
                ) : null}
                <SupplierGate>
                  {supplierOrderId ? <DetailRow label={t('supplierOrderIdLabel')} value={supplierOrderId} mono copy={supplierOrderId} /> : null}
                </SupplierGate>
                {isRatehawk ? <DetailRow label={t('hotelConfirmationLabel')} value={hotelConfirmationNumber ?? t('pendingValue')} mono pulse={!hotelConfirmationNumber} copy={hotelConfirmationNumber ?? undefined} /> : null}
              </>
            ) : (
              <>
                {flightBooking?.offerSnapshot?.from ? (
                  <DetailRow label={t('route')} value={<span className="font-bold">{flightBooking.offerSnapshot.from} → {flightBooking.offerSnapshot.to}</span> } />
                ) : null}
                {tripTypeLabel ? <DetailRow label={t('tripTypeLabel')} value={tripTypeLabel} /> : null}
                {flightBooking?.offerSnapshot?.departureDate ? (
                  <DetailRow label={t('departure')} value={new Date(flightBooking.offerSnapshot.departureDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} />
                ) : null}
                {flightBooking?.offerSnapshot?.returnDate ? (
                  <DetailRow label={t('returnLabel')} value={new Date(flightBooking.offerSnapshot.returnDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} />
                ) : null}
                {flightBooking?.locatorCode ? <DetailRow label={t('pnrLocator')} value={flightBooking.locatorCode} mono copy={flightBooking.locatorCode} /> : null}
                {Array.isArray((flightBooking as any)?.workflowSummary?.ticketNumbers) && (flightBooking as any).workflowSummary.ticketNumbers.length > 0
                  ? ((flightBooking as any).workflowSummary.ticketNumbers as string[]).map((ticketNumber: string) => (
                    <DetailRow key={ticketNumber} label={t('eTicketLabel')} value={ticketNumber} mono copy={ticketNumber} />
                  ))
                  : null}
              </>
            )}

            {(isHotel ? guests.length > 0 : travelers.length > 0) && (
              <div className="py-3 border-b border-zinc-100 last:border-0">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-400">
                  {isHotel ? t('guestNamesTitle') : t('passengersTitle')}
                </p>
                <ul className="space-y-1.5">
                  {(isHotel ? guests : travelers).map((p, i) => (
                    <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-sm text-zinc-700">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[9px] font-bold text-zinc-500">
                        {(isHotel ? p.type?.[0] : p.type) || (i + 1)}
                      </span>
                      {p.name || '—'}
                      {!isHotel && p.type ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          {p.type === 'ADT' ? t('travelerAdult') : p.type === 'CHD' || p.type === 'CH' ? t('travelerChild') : p.type === 'INF' ? t('travelerInfant') : p.type}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {invoice?.invoiceNumber ? <DetailRow label={t('invoiceNumberLabel')} value={invoice.invoiceNumber} mono copy={invoice.invoiceNumber} /> : null}
            {(() => {
              const anx = ((flightBooking as any)?.offerSnapshot?.ancillaries ?? {}) as Record<string, any[]>;
              const prettySeat = (v: any): string => {
                const raw = String(v?.seatNumber ?? v?.ancillaryProductId ?? '');
                if (!raw.startsWith('seat:')) return raw;
                try {
                  const d = JSON.parse(decodeURIComponent(raw.slice(5))) as { seat?: unknown };
                  return d.seat ? t('seatFallbackLabel', { seat: String(d.seat) }) : raw;
                } catch {
                  return raw;
                }
              };
              const rows: string[] = [
                ...(Array.isArray(anx.seats) ? anx.seats : []).map((s: any) => prettySeat(s)),
                ...(Array.isArray(anx.baggage) ? anx.baggage : []).map((b: any) => String(b.label ?? t('extraBaggageFallback'))),
                ...(Array.isArray(anx.meals) ? anx.meals : []).map((m: any) => t('mealFallbackLabel', { name: String(m.mealName ?? m.mealCode ?? '') }).trim()),
                ...(Array.isArray(anx.services) ? anx.services : []).map((s: any) => String(s.label ?? t('serviceFallbackLabel'))),
              ].filter(Boolean);
              if (rows.length === 0) return null;
              return <DetailRow label={t('extraServicesLabel')} value={rows.join(' · ')} />;
            })()}
          </div>
        </motion.div>
      )}

      {/* ── Flight Rate Comments ──────────────────────────────── */}
      {flightRatePolicies && (isBookingSuccess || showHeldSection) && <FlightRateComments data={flightRatePolicies} />}

      {/* ── Hotel Rate Comments (only for successful bookings) ── */}
      {isHotel && isBookingSuccess && hotelBooking && (() => {
        const rateSnapshot = (hotelBooking.rateSnapshot ?? {}) as Record<string, any>;
        const policies = rateSnapshot.cancellationPolicies ?? [];

        // Use the terms stored at booking time (received from the supplier
        // BEFORE confirmation). The shared view handles amount/percentage/
        // nights tiers and unknown terms — no local guessing here.
        const view = getCancellationPolicyView({
          refundable: rateSnapshot.refundable ?? undefined,
          cancellationPolicies: policies,
          cancellationPolicyText: rateSnapshot.cancellationPolicyText ?? undefined,
        });
        const firstDeadline = [...policies]
          .map((p: any) => p.from ?? p.deadline)
          .filter(Boolean)
          .sort()[0];
        const aggregatedPolicy: AggregatedPolicy = {
          refundable: view.isFree,
          freeCancellationUntil: view.isFree ? firstDeadline ?? null : null,
          cancellationFee: null,
          feeType: null,
          modificationAllowed: true,
          displayText: view.description ?? view.label,
          rateComments: rateSnapshot.rateComments ?? '',
          rawPolicies: policies,
          supplier: hotelBooking.provider ?? 'hotelbeds',
        };

        return (
          <HotelRateComments
            data={{
              provider: hotelBooking.provider,
              boardName: undefined,
              roomName: undefined,
              refundable: rateSnapshot.refundable ?? undefined,
              cancellationPolicies: policies,
              cancellationPolicyText: rateSnapshot.cancellationPolicyText ?? undefined,
              rateComments: rateSnapshot.rateComments ?? undefined,
              modificationAllowed: true,
              aggregatedPolicy,
            }}
          />
        );
      })()}

      {/* ── Max Wait ─────────────────────────────────────────────────── */}
      {maxWaitReached && isPending && !accessDenied && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-8 rounded-xl border border-zinc-200 bg-white p-6"
        >
          <h3 className="text-sm font-bold text-zinc-900 mb-1">{t('stillProcessingTitle')}</h3>
          <p className="text-xs text-zinc-500 mb-4 max-w-sm">
            {t('stillProcessingDesc')}
          </p>
          <button
            onClick={() => { setMaxWaitReached(false); setProgress(null); startTimeRef.current = Date.now(); }}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
            {t('refreshStatusAction')}
          </button>
        </motion.div>
      )}

      {/* ── Next Steps ───────────────────────────────────────────────── */}
      {(isBookingSuccess || showHeldSection) && !accessDenied && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease, delay: 0.35 }}
          className="mb-8"
        >
          <h2 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">{isAgent ? t('agentActionsTitle') : t('whatsNext')}</h2>
          <div className="space-y-2">
            {isAgent ? (
              <>
                <ActionRow
                  icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>}
                  title={t('voucherTitle')}
                  desc={t('voucherDesc')}
                  onClick={() => downloadVoucher(bookingId)}
                />
                <ActionRow
                  icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
                  title={t('invoice')}
                  desc={t('invoicePdfDesc')}
                  onClick={() => downloadInvoice(bookingId)}
                />
                <ActionRow
                  icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zm0 9.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zm0 9.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>}
                  title={t('dashboardTitle')}
                  desc={t('dashboardDesc')}
                  href="/agent/bookings"
                />
              </>
            ) : (
              <>
                {invoice ? (
                  <a href={getCustomerInvoicePdfUrl(invoice.id)} target="_blank" rel="noopener noreferrer">
                    <ActionRow
                      icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
                      title={t('invoice')}
                      desc={invoice.invoiceNumber ? t('invoiceWithNumber', { number: invoice.invoiceNumber }) : t('invoicePdfDesc')}
                    />
                  </a>
                ) : (
                  <ActionRow
                    icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>}
                    title={t('invoice')}
                    desc={t('invoiceGenerating')}
                    disabled
                  />
                )}
                <ActionRow
                  icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
                  title={t('myBookingsAction')}
                  desc={t('viewAllBookingsDesc')}
                  href="/my-bookings"
                />
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* ── Bottom Actions ───────────────────────────────────────────── */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.45 }}
        className="flex flex-wrap items-center gap-2.5 pt-2"
      >
        {(isBookingSuccess || showHeldSection) && !accessDenied && (
          <>
            {isAgent ? (
              <button
                onClick={() => downloadVoucher(bookingId)}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {t('downloadVoucherAction')}
              </button>
            ) : invoice ? (
              <a href={getCustomerInvoicePdfUrl(invoice.id)} target="_blank" rel="noopener noreferrer">
                <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {t('downloadInvoice')}
                </span>
              </a>
            ) : null}
            <Link href="/my-bookings">
              <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                {t('myBookingsAction')}
              </span>
            </Link>
            <Link href={isHotel ? '/hotels/search' : '/flights/search'}>
              <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                {isHotel ? <HotelIcon /> : <PlaneIcon />}
                {isHotel ? t('searchHotelsAction') : t('searchFlights')}
              </span>
            </Link>
          </>
        )}

        {isBookingFailure && !accessDenied && (
          <>
            {failureInfo?.action === 'search' && (
              <Link href={isHotel ? '/hotels/search' : '/flights/search'}>
                <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 transition-colors">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  {t('searchAgainAction')}
                </span>
              </Link>
            )}
            <Link href="/my-bookings">
              <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                {t('myBookingsAction')}
              </span>
            </Link>
            <Link href="/">
              <span className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                {t('homeAction')}
              </span>
            </Link>
          </>
        )}
      </motion.div>
    </BookingLayout>
  );
}
