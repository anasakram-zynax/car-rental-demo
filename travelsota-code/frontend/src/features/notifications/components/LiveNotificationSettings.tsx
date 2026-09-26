'use client';

/**
 * Live Notification Settings — the management home for the bottom-left
 * LIVE stack controls (moved off the page per the v3 redesign).
 *
 * - Per-severity floating-card visibility: Info / High / Critical toggles.
 *   OFF = that severity's live cards never float on screen. Delivery, the
 *   bell badge, and the notification feed are unaffected — the events are
 *   always received, only the floating cards are suppressed.
 * - Snooze: hides the live stack for 30 minutes, with remaining time and
 *   a one-click turn-off.
 *
 * State lives in notification-quotas.ts (localStorage, best-effort) and is
 * observed via subscribeQuotas, so changes here instantly affect the live
 * stack on any page — no reload needed.
 */

import { useEffect, useState } from 'react';
import { BellRing, Coffee } from 'lucide-react';
import {
  cancelSnooze,
  getSnoozeUntil,
  isSeverityMuted,
  setSeverityMuted,
  snooze,
  subscribeQuotas,
} from '../lib/notification-quotas';
import type { NotificationSeverity } from '../api/notification-types';
import { cn } from '@/lib/cn';

/* ── Severity descriptors ──────────────────────────────────────────── */

const SEVERITY_ROWS: Array<{
  severity: NotificationSeverity;
  label: string;
  description: string;
  dot: string;
}> = [
  {
    severity: 'critical',
    label: 'Critical',
    description: 'Urgent system alerts (payment failures, critical events)',
    dot: 'bg-red-500',
  },
  {
    severity: 'high',
    label: 'High',
    description: 'Important activity (bookings, cancellations, refunds)',
    dot: 'bg-amber-500',
  },
  {
    severity: 'info',
    label: 'Info',
    description: 'General activity and informational events',
    dot: 'bg-blue-500',
  },
];

function formatRemaining(until: number, now: number): string {
  const totalMin = Math.max(1, Math.ceil((until - now) / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/* ── Small toggle switch (matches NotificationRuleManager style) ───── */

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative inline-flex h-[24px] w-[44px] flex-shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-brand-500' : 'bg-gray-300',
      )}
    >
      <span
        className={cn(
          'inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[23px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}

/* ── Card ──────────────────────────────────────────────────────────── */

export default function LiveNotificationSettings() {
  const [muted, setMuted] = useState<Record<NotificationSeverity, boolean>>({
    info: isSeverityMuted('info'),
    high: isSeverityMuted('high'),
    critical: isSeverityMuted('critical'),
  });
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(() =>
    getSnoozeUntil(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Stay in sync with storage events + any other surface that mutates quotas.
  useEffect(() => {
    const sync = () => {
      setMuted({
        info: isSeverityMuted('info'),
        high: isSeverityMuted('high'),
        critical: isSeverityMuted('critical'),
      });
      setSnoozeUntil(getSnoozeUntil());
    };
    sync();
    const unsubscribe = subscribeQuotas(sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'travalq.notification-quotas.v1') sync();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 1s tick keeps the snooze countdown fresh.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const snoozedNow = snoozeUntil !== null && snoozeUntil > now;
  const hiddenCount = SEVERITY_ROWS.filter((r) => muted[r.severity]).length;

  const handleToggle = (severity: NotificationSeverity) => {
    setSeverityMuted(severity, !muted[severity]);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Control which live system events float on screen (bottom-left). These
        settings do not affect notification delivery, the bell badge, or the
        list below — they only hide the floating pop-ups.
      </p>

      {/* Per-severity visibility */}
      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
        {SEVERITY_ROWS.map((row) => {
          const floating = !muted[row.severity];
          return (
            <div
              key={row.severity}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn('mt-1.5 h-2 w-2 flex-shrink-0 rounded-full', row.dot)}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {row.label}{' '}
                    <span
                      className={cn(
                        'ml-1 align-middle text-[10px] font-bold uppercase tracking-wider',
                        floating ? 'text-emerald-600' : 'text-gray-400',
                      )}
                    >
                      {floating ? 'floating on' : 'hidden'}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {row.description}
                  </p>
                </div>
              </div>
              <Toggle
                checked={floating}
                onChange={() => handleToggle(row.severity)}
                label={`${floating ? 'Hide' : 'Show'} ${row.label} live notifications`}
              />
            </div>
          );
        })}
      </div>

      {/* Snooze */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Coffee className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">
              {snoozedNow && snoozeUntil !== null
                ? `Snoozed — ${formatRemaining(snoozeUntil, now)} remaining`
                : 'Snooze live notifications'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {snoozedNow
                ? 'All floating live cards are paused.'
                : 'Hide all live pop-ups for 30 minutes.'}
            </p>
          </div>
        </div>
        {snoozedNow ? (
          <button
            type="button"
            onClick={() => cancelSnooze()}
            className="flex-shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            Turn off
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSnoozeUntil(snooze())}
            className="flex-shrink-0 rounded-md bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Snooze 30 min
          </button>
        )}
      </div>

      {hiddenCount === 3 && !snoozedNow && (
        <p className="flex items-center gap-2 text-xs text-amber-600">
          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
          All severities are hidden — live notifications only appear in the
          bell and this list.
        </p>
      )}
    </div>
  );
}
