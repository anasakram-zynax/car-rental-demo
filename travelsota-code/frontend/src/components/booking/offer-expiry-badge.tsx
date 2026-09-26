'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

function remainingMs(iso: string): number {
  return new Date(iso).getTime() - Date.now();
}

function fmtClock(ms: number): string {
  if (ms <= 0) return '0:00';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Fixed offer-validity badge with a live countdown. Hover (or focus) reveals
 * a tooltip with the exact remaining time; on expiry it fires onExpire once
 * so the page can redirect back to search.
 */
export function OfferExpiryBadge({
  expiresAt,
  onExpire,
  label,
}: {
  expiresAt: string;
  onExpire?: () => void;
  label?: string;
}) {
  const tBooking = useTranslations('Booking');
  const [, setTick] = useState(0);
  const [fired, setFired] = useState(false);
  const ms = remainingMs(expiresAt);
  const urgent = ms < 5 * 60_000;
  const resolvedLabel = label ?? tBooking('offerValidLabel');

  const fmtLong = (value: number): string => {
    if (value <= 0) return tBooking('offerTimeExpired');
    const m = Math.floor(value / 60_000);
    const s = Math.floor((value % 60_000) / 1000);
    if (m <= 0) return tBooking('offerSecondsLeft', { count: s });
    return tBooking('offerMinSecLeft', { minutes: m, seconds: String(s).padStart(2, '0') });
  };

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (ms <= 0 && !fired) {
      setFired(true);
      onExpire?.();
    }
  }, [ms, fired, onExpire]);

  return (
    <div
      className="group fixed bottom-5 right-5 z-50"
      role="timer"
      aria-label={tBooking('offerExpiryAria', { label: resolvedLabel, time: fmtLong(ms) })}
      aria-live={urgent ? 'assertive' : 'off'}
    >
      {/* tooltip */}
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 mb-2 w-60 rounded-xl border border-zinc-200 bg-white p-3 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <p className="text-xs font-bold text-zinc-900 dark:text-white">
          {ms <= 0 ? tBooking('offerExpiredTitle') : tBooking('offerTimeLeftHint', { time: fmtLong(ms) })}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {ms <= 0
            ? tBooking('offerExpiredDesc')
            : tBooking('offerConfirmBeforeExpiry')}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onExpire?.()}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-full py-2.5 pl-3.5 pr-4 text-sm font-bold tabular-nums shadow-lg transition-colors',
          ms <= 0
            ? 'bg-red-600 text-white hover:bg-red-700'
            : urgent
              ? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
              : 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200',
        )}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {ms <= 0 ? tBooking('offerExpiredCta') : `${resolvedLabel} ${fmtClock(ms)}`}
      </button>
    </div>
  );
}
