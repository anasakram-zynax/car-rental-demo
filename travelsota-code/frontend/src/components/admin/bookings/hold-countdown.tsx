'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

function remainingMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : ms;
}

function fmt(ms: number): string {
  if (ms <= 0) return 'Expired';
  const d = Math.floor(ms / 86_400_000);
  if (d >= 2) return `${d} days left`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m left`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s left`;
  return `${s}s left`;
}

/**
 * Live countdown to a hold deadline. Ticks every second under a minute,
 * every 30s otherwise. Red + bold under 5 minutes or past expiry.
 */
export function HoldCountdown({
  expiresAt,
  prefix,
  className = '',
}: {
  expiresAt: string | null | undefined;
  prefix?: string;
  className?: string;
}) {
  const [, setTick] = useState(0);
  const ms = remainingMs(expiresAt);
  const urgent = ms != null && ms < 5 * 60_000;

  useEffect(() => {
    if (ms == null) return;
    const interval = ms < 60_000 ? 1000 : 30_000;
    const id = window.setInterval(() => setTick((t) => t + 1), interval);
    return () => window.clearInterval(id);
  }, [ms == null, ms != null && ms < 60_000]);

  if (ms == null) return <span className={className}>No expiry set</span>;
  return (
    <span
      className={cn(
        'font-bold tabular-nums',
        urgent ? 'text-red-600 dark:text-red-400' : 'text-brand-teal dark:text-teal-300',
        className,
      )}
      aria-live={urgent ? 'assertive' : 'off'}
    >
      {prefix ? `${prefix} ` : ''}
      {fmt(ms)}
    </span>
  );
}
