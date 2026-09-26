'use client';
import { useTranslations } from 'next-intl';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { apiRequest } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { useCurrency } from '@/context/CurrencyContext';
import { bookingStatusLabel } from '@/lib/utils/booking-status-label';

// ─── Types ──────────────────────────────────────────────────

interface StatusResponse {
  bookingId: string;
  type: 'flight' | 'hotel';
  status: string;
  statusLabel: string;
  isTerminal: boolean; isFailure: boolean; isPending: boolean; isBooked: boolean;
  paymentStatus?: string | null;
  invoiceNumber?: string | null;
  provider: string; reference: string | null;
  itinerary?: { from: string; to: string; departureDate: string; returnDate?: string };
  hotelConfirmationNumber?: string | null;
  hotel?: Record<string, unknown> | null;
  message?: string | null;
  pricing: { totalAmount: number; currency: string };
  createdAt: string; updatedAt: string;
}

// ─── Constants ──────────────────────────────────────────────

const ease = [0.16, 1, 0.3, 1] as const;

// ─── Icons ──────────────────────────────────────────────────

function CheckIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CopyIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
    </svg>
  );
}

function PlaneIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
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

function MailIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function CalendarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function ShieldIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function XIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Status Hero ────────────────────────────────────────────

function StatusHero({ status, reducedMotion }: { status: StatusResponse; reducedMotion: boolean | null }) {
  const isSuccess = status.isBooked;
  const isPending = status.isPending;
  const isFail = status.isFailure;

  const title = isSuccess
    ? 'Booking confirmed'
    : isPending
    ? 'Processing your booking'
    : 'Booking failed';

  const subtitle = isSuccess
    ? `Your ${status.type === 'flight' ? 'flight' : 'hotel stay'} has been successfully booked. A confirmation has been sent to your email.`
    : isPending
    ? 'We\'re finalizing your reservation. This usually takes a few moments.'
    : 'We were unable to complete your booking. Please try again or contact support.';

  return (
    <div className="mb-10">
      <div className="flex items-start gap-5">
        {/* Status icon */}
        <motion.div
          initial={reducedMotion ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.1 }}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${
            isSuccess
              ? 'bg-zinc-900 text-white'
              : isPending
              ? 'bg-zinc-200 text-zinc-600'
              : 'bg-red-600 text-white'
          }`}
        >
          {isSuccess ? (
            <CheckIcon className="h-7 w-7" />
          ) : isPending ? (
            <ClockIcon className="h-6 w-6" />
          ) : (
            <XIcon className="h-7 w-7" />
          )}
        </motion.div>

        <div className="min-w-0 flex-1">
          {/* Title */}
          <motion.h1
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease, delay: 0.15 }}
            className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900"
          >
            {title}
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease, delay: 0.25 }}
            className="mt-2 text-base text-zinc-500 leading-relaxed max-w-lg"
          >
            {subtitle}
          </motion.p>

          {/* Reference number */}
          {status.reference ? (
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease, delay: 0.35 }}
              className="mt-5 inline-flex items-center gap-3 rounded-lg bg-zinc-100 px-4 py-2.5"
            >
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Ref</span>
              <span className="text-sm font-bold font-mono tracking-wide text-zinc-900">{status.reference}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(status.reference ?? ''); }}
                className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200 transition-colors"
                aria-label="Copy booking reference"
              >
                <CopyIcon />
              </button>
            </motion.div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Journey Timeline ───────────────────────────────────────

const STEPS = [
  { key: 'payment', label: 'Payment' },
  { key: 'booking', label: 'Booking' },
  { key: 'confirmed', label: 'Confirmed' },
];

function JourneyTimeline({ status, reducedMotion }: { status: StatusResponse; reducedMotion: boolean | null }) {
  const currentStep = status.isBooked ? 2 : status.isPending ? 1 : 0;

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease, delay: 0.4 }}
      className="mb-10"
    >
      <div className="flex items-center gap-0">
        {STEPS.map((step, i) => {
          const done = i <= currentStep;
          const active = i === currentStep;
          return (
            <div key={step.key} className="flex-1 flex items-center">
              <div className="flex flex-col items-center gap-2 w-full">
                {/* Bar */}
                <div className="relative w-full h-1 rounded-full overflow-hidden bg-zinc-100">
                  <motion.div
                    initial={reducedMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: done ? 1 : 0 }}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.12, ease }}
                    className="absolute inset-0 bg-zinc-900 origin-left"
                  />
                </div>
                {/* Label */}
                <span className={`text-[11px] font-semibold uppercase tracking-widest ${
                  done ? (active ? 'text-zinc-900' : 'text-zinc-500') : 'text-zinc-300'
                }`}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 ? (
                <div className="flex-1 h-1 mx-1" />
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── Info Grid ──────────────────────────────────────────────

function InfoGrid({ status, reducedMotion }: { status: StatusResponse; reducedMotion: boolean | null }) {
  const { formatPrice } = useCurrency();
  const items = useMemo(() => {
    const base = [
      { label: 'Type', value: status.type === 'flight' ? 'Flight' : 'Hotel', icon: status.type === 'flight' ? <PlaneIcon /> : <HotelIcon /> },
      { label: 'Status', value: status.statusLabel || status.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), icon: <ShieldIcon /> },
      ...(status.paymentStatus ? [{ label: 'Payment', value: status.paymentStatus.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), icon: <ShieldIcon /> }] : []),
      ...(status.invoiceNumber ? [{ label: 'Invoice', value: status.invoiceNumber, icon: <MailIcon /> }] : []),
      { label: 'Booked on', value: status.createdAt ? new Date(status.createdAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—', icon: <CalendarIcon /> },
    ];
    if (status.type === 'flight' && status.itinerary) {
      base.push({ label: 'Route', value: `${status.itinerary.from} → ${status.itinerary.to}`, icon: <PlaneIcon /> });
      base.push({ label: 'Departure', value: status.itinerary.departureDate ? new Date(status.itinerary.departureDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—', icon: <CalendarIcon /> });
    }
    if (status.type === 'hotel') {
      base.push({ label: 'Confirmation #', value: status.hotelConfirmationNumber ?? 'Pending', icon: <HotelIcon /> });
    }
    return base;
  }, [status]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease, delay: 0.5 }}
      className="mb-10"
    >
      <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-4">Booking details</h2>
      <div className="border-t border-zinc-200">
        {items.map((item, i) => (
          <motion.div
            key={i}
            initial={reducedMotion ? false : { opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease, delay: 0.55 + i * 0.05 }}
            className="flex items-center gap-4 py-3 border-b border-zinc-100"
          >
            <span className="text-zinc-300 shrink-0">{item.icon}</span>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-4">
              <span className="text-xs text-zinc-400 uppercase tracking-wider">{item.label}</span>
              <span className="text-sm font-medium text-zinc-900 text-right">{item.value}</span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Total Paid */}
      <div className="flex items-center justify-between py-4 mt-1 border-t-2 border-zinc-900">
        <span className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Total paid</span>
        <span className="text-2xl font-bold text-zinc-900 tracking-tight">
          {formatPrice(status.pricing.totalAmount, status.pricing.currency)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Next Steps ─────────────────────────────────────────────

function NextSteps({ status, reducedMotion }: { status: StatusResponse; reducedMotion: boolean | null }) {
  const steps = useMemo(() => {
    if (status.isBooked) {
      return status.type === 'flight'
        ? [
            { icon: <MailIcon />, title: 'Check your email', desc: 'Your e-ticket and itinerary have been sent.' },
            { icon: <CalendarIcon />, title: 'Check-in online', desc: 'Check-in opens 24-48 hours before departure.' },
            { icon: <PlaneIcon />, title: 'Arrive early', desc: 'Plan to arrive at the airport 2-3 hours before departure.' },
          ]
        : [
            { icon: <MailIcon />, title: 'Check your email', desc: 'Your booking voucher has been sent to your email.' },
            { icon: <HotelIcon />, title: 'Hotel check-in', desc: 'Check-in time is typically from 2:00 PM onward.' },
            { icon: <ShieldIcon />, title: 'Booking protected', desc: 'Your reservation is confirmed and guaranteed.' },
          ];
    }
    if (status.isPending) {
      return [
        { icon: <ClockIcon />, title: 'Processing', desc: 'Your booking is being processed by the supplier.' },
        { icon: <MailIcon />, title: 'Confirmation email', desc: 'You\'ll receive an email once the booking is confirmed.' },
        { icon: <ShieldIcon />, title: 'No charge yet', desc: 'You will only be charged once the booking is confirmed.' },
      ];
    }
    return [
      { icon: <MailIcon />, title: 'Contact support', desc: 'Reach out to our support team for assistance.' },
      { icon: <ShieldIcon />, title: 'Refund processed', desc: 'If payment was taken, a refund will be processed.' },
    ];
  }, [status]);

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease, delay: 0.6 }}
      className="mb-10"
    >
      <h2 className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] mb-5">What to expect next</h2>
      <div className="space-y-5">
        {steps.map((step, i) => (
          <motion.div
            key={i}
            initial={reducedMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease, delay: 0.65 + i * 0.07 }}
            className="flex items-start gap-4"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
              {step.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">{step.title}</p>
              <p className="text-sm text-zinc-500 mt-0.5">{step.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Loading Skeleton ───────────────────────────────────────

function SkeletonLine({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-100 ${className}`} />;
}

function LoadingState() {
  return (
    <div className="space-y-8">
      <div className="flex items-start gap-5">
        <SkeletonLine className="h-14 w-14 rounded-full shrink-0" />
        <div className="space-y-3 flex-1">
          <SkeletonLine className="h-8 w-64" />
          <SkeletonLine className="h-4 w-80" />
        </div>
      </div>
      <SkeletonLine className="h-12 w-full !rounded-lg" />
      <SkeletonLine className="h-64 w-full !rounded-lg" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 mx-auto mb-5">
        <XIcon className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 mb-2">Booking not found</h2>
      <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">{message}</p>
      <Link href="/"><Button variant="secondary" size="sm">Return home</Button></Link>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function UnifiedBookingStatus({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Checkout');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const reducedMotion = useReducedMotion();
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const data = await apiRequest<StatusResponse>(`/bookings/${bookingId}/status`);
        if (!cancelled && data) setStatus(data);
      } catch {
        if (cancelled) return;
        try {
          const flightData = await apiRequest<any>(`/flights/bookings/${bookingId}`);
          if (!cancelled && flightData) setStatus({
            bookingId: flightData.id ?? bookingId, type: 'flight', status: flightData.status ?? 'unknown',
            statusLabel: bookingStatusLabel(flightData.status), isTerminal: ['booked','ticketed','cancelled','refunded'].includes(flightData.status),
            isFailure: ['failed'].includes(flightData.status), isPending: ['pending_payment','held_pending_payment','booking_in_progress'].includes(flightData.status),
            isBooked: ['booked','ticketed'].includes(flightData.status), provider: flightData.provider ?? 'travelport',
            reference: flightData.locatorCode ?? null,
            itinerary: flightData.offerSnapshot ? { from: flightData.offerSnapshot.from ?? '', to: flightData.offerSnapshot.to ?? '', departureDate: flightData.offerSnapshot.departureDate ?? '' } : undefined,
            pricing: { totalAmount: flightData.totalAmount ?? 0, currency: flightData.currency ?? 'USD' },
            createdAt: flightData.createdAt ?? '', updatedAt: flightData.updatedAt ?? '',
          });
        } catch {
          try {
            const hotelData = await apiRequest<any>(`/hotels/bookings/${bookingId}`);
            if (!cancelled && hotelData) setStatus({
              bookingId: hotelData.id ?? bookingId, type: 'hotel', status: hotelData.status ?? 'unknown',
              statusLabel: hotelData.status, isTerminal: ['booked','cancelled','refunded'].includes(hotelData.status),
              isFailure: ['failed','failed_supplier_booking'].includes(hotelData.status), isPending: ['pending_payment','held_pending_payment','booking_in_progress'].includes(hotelData.status),
              isBooked: ['booked'].includes(hotelData.status), provider: hotelData.provider ?? 'unknown',
              reference: hotelData.supplierReference ?? hotelData.hotelbedsRef ?? null,
              hotelConfirmationNumber: hotelData.hotelConfirmationNumber ?? null,
              pricing: { totalAmount: hotelData.customerAmount ?? hotelData.amount ?? 0, currency: hotelData.customerCurrency ?? hotelData.currency ?? 'EUR' },
              createdAt: hotelData.createdAt ?? '', updatedAt: hotelData.updatedAt ?? '',
            });
          } catch { if (!cancelled) setError('Booking not found.'); }
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [bookingId]);

  const handleCopyRef = useCallback(() => {
    if (!status?.reference) return;
    navigator.clipboard.writeText(status.reference).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [status?.reference]);

  if (loading) return <LoadingState />;
  if (error || !status) return <ErrorState message={error ?? 'Booking not found.'} />;

  return (
    <div>
      {/* Status Hero */}
      <StatusHero status={status} reducedMotion={reducedMotion} />

      {/* Journey Timeline */}
      {!status.isFailure ? <JourneyTimeline status={status} reducedMotion={reducedMotion} /> : null}

      {/* Info Grid */}
      <InfoGrid status={status} reducedMotion={reducedMotion} />

      {/* Next Steps */}
      <NextSteps status={status} reducedMotion={reducedMotion} />

      {/* Actions */}
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease, delay: 0.7 }}
        className="flex flex-wrap items-center gap-3"
      >
        {status.reference ? (
          <Button onClick={handleCopyRef} variant="secondary" size="sm" className="gap-2">
            <CopyIcon className="h-3.5 w-3.5" />
            {copied ? 'Copied!' : 'Copy reference'}
          </Button>
        ) : null}
        <Link href="/my-bookings">
          <Button variant="ghost" size="sm">Manage booking</Button>
        </Link>
        {status.type === 'flight' ? (
          <Link href="/flights/search"><Button variant="ghost" size="sm">Book another flight</Button></Link>
        ) : (
          <Link href="/hotels/search"><Button variant="ghost" size="sm">Book another hotel</Button></Link>
        )}
        <Link href="/">
          <Button variant="ghost" size="sm">Return home</Button>
        </Link>
      </motion.div>
    </div>
  );
}
