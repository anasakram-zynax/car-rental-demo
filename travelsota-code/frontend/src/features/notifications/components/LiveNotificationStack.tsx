'use client';

/**
 * LIVE notification stack — the dedicated home for system events.
 *
 * - Bottom-left position (action toasts stay top-right, see `@/lib/toast`).
 * - Rendered ONLY for users with `notifications:read` — normal users see
 *   toasts only, so the separation is also permission-scoped (enforced by
 *   the parent, `RealtimeNotificationToaster`).
 * - Design (v4): shares `NotificationCard` with the action toasts — white
 *   rectangle, filled severity icon, bottom progress bar. Position is the
 *   ONLY thing that tells a live card apart from a toast — no text badge.
 * - NO fixed on-page controls: mute/snooze live in the Notifications tab
 *   (LiveNotificationSettings card). A small status card only appears while
 *   a snooze is ACTIVE (with a one-click turn-off), and while the socket is
 *   reconnecting — both are statuses, not controls.
 * - Hover pauses auto-expiry (ticker) AND freezes each card's progress bar;
 *   a close button dismisses; clicking the card body opens the feed.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Coffee, RadioTower } from 'lucide-react';
import {
  dismissLiveEntry,
  openNotificationFeed,
  setLiveEntriesPaused,
  subscribeLiveNotifications,
  type LiveEntry,
} from '../lib/notification-toast-bridge';
import {
  cancelSnooze,
  getSnoozeUntil,
  isSeverityMuted,
  subscribeQuotas,
} from '../lib/notification-quotas';
import { NotificationCard, type NotificationTone } from '@/components/ui/notification-card';

/* ── Tunables ──────────────────────────────────────────────────────── */

const MAX_VISIBLE = 3;
const EASE = [0.2, 0, 0, 1] as const; // matches the design system's entrance easing

/* ── Severity → shared card tone ──────────────────────────────────── */

const TONE_BY_SEVERITY: Record<LiveEntry['severity'], NotificationTone> = {
  info: 'info',
  high: 'warning',
  critical: 'critical',
};

/* ── Single card ───────────────────────────────────────────────────── */

function LiveCard({ entry, paused }: { entry: LiveEntry; paused: boolean }) {
  const isSummary = entry.kind === 'summary';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22, ease: EASE }}
      className="pointer-events-auto"
    >
      <NotificationCard
        tone={TONE_BY_SEVERITY[entry.severity] ?? 'info'}
        title={entry.title}
        message={entry.message}
        durationMs={entry.ttlMs}
        barResetKey={entry.expiresAt}
        paused={paused}
        onClick={openNotificationFeed}
        onDismiss={() => dismissLiveEntry(entry.id)}
        action={isSummary ? { label: 'View all', onClick: openNotificationFeed } : undefined}
      />
    </motion.div>
  );
}

/* ── Status cards (reconnecting / active snooze) ──────────────────── */

function StatusCard({ icon: Icon, children }: { icon: typeof Coffee; children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.18, ease: EASE }}
      className="pointer-events-auto flex w-[360px] max-w-[calc(100vw-2rem)] items-center gap-2 rounded-md border border-gray-200 bg-white px-3.5 py-2.5 shadow-md shadow-gray-900/[0.05]"
      role="status"
    >
      <Icon className="h-4 w-4 flex-shrink-0 text-gray-400" aria-hidden="true" />
      <span className="flex-1 text-[13px] text-gray-600">{children}</span>
    </motion.div>
  );
}

function ReconnectingCard() {
  return (
    <StatusCard icon={RadioTower}>
      <span className="inline-flex items-center gap-1.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
        </span>
        Live notifications reconnecting…
      </span>
    </StatusCard>
  );
}

function SnoozeActiveCard({ until, now }: { until: number; now: number }) {
  const totalMin = Math.max(1, Math.ceil((until - now) / 60000));
  const remaining =
    totalMin < 60
      ? `${totalMin}m`
      : `${Math.floor(totalMin / 60)}h${totalMin % 60 === 0 ? '' : ` ${totalMin % 60}m`}`;

  return (
    <StatusCard icon={Coffee}>
      Live notifications snoozed for {remaining}{' '}
      <button
        type="button"
        onClick={() => cancelSnooze()}
        className="font-semibold text-gray-900 hover:underline"
      >
        Turn off
      </button>
    </StatusCard>
  );
}

/* ── Stack ─────────────────────────────────────────────────────────── */

export default function LiveNotificationStack({
  reconnecting = false,
}: {
  reconnecting?: boolean;
}) {
  const [liveEntries, setLiveEntries] = useState<LiveEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [hovered, setHovered] = useState(false);
  const [muted, setMuted] = useState<Record<LiveEntry['severity'], boolean>>({
    info: isSeverityMuted('info'),
    high: isSeverityMuted('high'),
    critical: isSeverityMuted('critical'),
  });
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(() =>
    getSnoozeUntil(),
  );

  useEffect(() => {
    const unsubscribe = subscribeLiveNotifications((next) => {
      setLiveEntries(next);
    });
    return unsubscribe;
  }, []);

  // Settings changed in the Notifications tab → re-read quotas reactively.
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
    return subscribeQuotas(sync);
  }, []);

  const snoozedNow = snoozeUntil !== null && snoozeUntil > now;

  const visible = useMemo(() => {
    const filtered = liveEntries.filter((e) => {
      if (e.kind === 'summary' && snoozedNow) return false;
      if (e.kind === 'notification' && muted[e.severity]) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.slice(0, MAX_VISIBLE);
  }, [liveEntries, muted, snoozedNow]);

  const hasContent = reconnecting || snoozedNow || visible.length > 0;

  // 1s tick keeps the snooze countdown fresh (cards' own progress bars run
  // on CSS animation, not this timer). Perf contract: an idle app must never
  // wake the main thread — the interval EXISTS only while the stack is
  // showing something AND the tab is visible. Pauses on hidden tabs and
  // self-destructs when the stack empties instead of ticking into the void.
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (!hasContent || !tabVisible) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasContent, tabVisible]);

  if (!hasContent) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-[100] flex flex-col-reverse gap-2"
      onMouseEnter={() => {
        setHovered(true);
        setLiveEntriesPaused(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
        setLiveEntriesPaused(false);
      }}
      aria-label="Live notifications"
    >
      <AnimatePresence initial={false}>
        {reconnecting && <ReconnectingCard key="reconnecting" />}
        {snoozedNow && snoozeUntil !== null && (
          <SnoozeActiveCard key="snooze" until={snoozeUntil} now={now} />
        )}
        {visible.map((entry) => (
          <LiveCard key={entry.id} entry={entry} paused={hovered} />
        ))}
      </AnimatePresence>
    </div>
  );
}
