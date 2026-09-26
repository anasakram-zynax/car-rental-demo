'use client';

/**
 * Live-notification store — the bridge between the Socket.IO stream and the
 * dedicated LIVE notification stack (bottom-left, see LiveNotificationStack).
 *
 * Separation of concerns (agreed redesign):
 * - Live system events  → this store → LiveNotificationStack (bottom-left,
 *   solid severity colors, LIVE badge). Only for users with
 *   `notifications:read`; permission gating happens in RealtimeNotificationToaster.
 * - Action feedback     → sonner-backed toasts (top-right) via `useToast`.
 *   A live notification never renders as an action toast.
 *
 * Responsibilities:
 * - Enriched body: prefer backend `message`, fall back to a humanized
 *   category label so a card is never blank.
 * - Dedup: LRU window over notification IDs (bootstrap + socket replay safe).
 * - Suppression: actor-generated events (the acting admin already saw the
 *   page's own feedback) go to the bell only.
 * - Burst grouping: the first event of a burst shows as its own card;
 *   further events within the window fold into a single "+N more" summary
 *   card. Critical events always show their own card and open a new burst.
 * - Per-card expiry: a 1s ticker prunes expired entries and notifies the UI.
 *
 * Edge cases handled:
 * - Summary expiry resets the burst anchor so the next event starts fresh.
 * - Manual dismissal of the summary resets counters.
 * - Module state survives HMR/StrictMode double-mounts (module singletons).
 * - No-op when called during SSR.
 */

import type { NotificationItem, NotificationSeverity } from '../api/notification-types';
import { isSuppressed } from './actor-event-dedupe';

/* ── Tunables ──────────────────────────────────────────────────────── */

/** Window during which additional notifications join the current burst. */
const BURST_WINDOW_MS = 8_000;
/** How long each card / the summary stays visible. */
const CARD_TTL_MS = 6_000;
const SUMMARY_TTL_MS = 8_000;
const CRITICAL_TTL_MS = 10_000;
/** Max distinct IDs remembered (prevents unbounded growth). */
const SEEN_MAX = 200;
/** Ticker granularity for pruning expired entries. */
const TICK_MS = 1_000;
/** Max entries handed to the UI at once (UI may cap rendering further). */
const MAX_LIVE_ENTRIES = 5;

/* ── View model ────────────────────────────────────────────────────── */

export type LiveEntryKind = 'notification' | 'summary';

export interface LiveEntry {
  kind: LiveEntryKind;
  /** Notification id, or the synthetic 'summary' id. */
  id: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  /** Epoch ms — drives the "x s ago" label. */
  createdAt: number;
  /** Epoch ms — the UI can drop the entry itself past this point. */
  expiresAt: number;
  /** Full lifetime in ms (expiresAt - createdAt at the last (re)set) — lets the UI drive a progress bar without recomputing it from a growing createdAt. */
  ttlMs: number;
  /** Summary only: how many notifications were folded in. */
  foldedCount?: number;
}

type Listener = (entries: LiveEntry[]) => void;

/* ── Module state ──────────────────────────────────────────────────── */

const seenIds = new Set<string>();
let seenOrder: string[] = [];

const listeners = new Set<Listener>();
let entries: LiveEntry[] = [];

/** Timestamp of the card that anchored the current burst. */
let burstAnchorAt = 0;
/** Whether the current burst already promoted its first member to a card. */
let burstHasLead = false;

let summaryCount = 0;
let lastImportant: NotificationItem | null = null;

let ticker: ReturnType<typeof setInterval> | null = null;
/** When true, the expiry ticker holds entries past their expiry (hover). */
let entriesPaused = false;

/* ── Internals ─────────────────────────────────────────────────────── */

function rememberId(id: string): void {
  if (seenIds.has(id)) return;
  seenIds.add(id);
  seenOrder.push(id);
  if (seenOrder.length > SEEN_MAX) {
    const drop = seenOrder.splice(0, seenOrder.length - SEEN_MAX);
    for (const old of drop) seenIds.delete(old);
  }
}

function humanizeCategory(n: NotificationItem): string {
  const label = n.category ?? n.type;
  return label
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildMessage(n: NotificationItem): string {
  return n.message || humanizeCategory(n);
}

function ttlFor(severity: NotificationSeverity): number {
  if (severity === 'critical') return CRITICAL_TTL_MS;
  if (severity === 'high') return CARD_TTL_MS + 2_000;
  return CARD_TTL_MS;
}

function ensureTicker(): void {
  if (ticker !== null) return;
  ticker = setInterval(() => {
    if (entriesPaused) return;
    const now = Date.now();
    const next = entries.filter((e) => e.expiresAt > now);
    if (next.length !== entries.length) {
      entries = next;
      if (summaryCount > 0 && !entries.some((e) => e.kind === 'summary')) {
        // Summary expired visually — reset the burst accounting with it.
        summaryCount = 0;
        lastImportant = null;
      }
      emit();
    }
    if (entries.length === 0 && ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }, TICK_MS);
}

function emit(): void {
  const snapshot = [...entries];
  for (const listener of listeners) listener(snapshot);
}

function upsertSummary(now: number): void {
  const title =
    summaryCount > 0
      ? `${summaryCount} more new ${summaryCount === 1 ? 'notification' : 'notifications'}`
      : 'New notifications';
  const message = lastImportant ? `Latest: ${lastImportant.title}` : '';
  const expiresAt = now + SUMMARY_TTL_MS;

  const existing = entries.find((e) => e.kind === 'summary');
  if (existing) {
    existing.title = title;
    existing.message = message;
    existing.severity = lastImportant?.severity ?? existing.severity;
    existing.expiresAt = expiresAt;
    existing.ttlMs = SUMMARY_TTL_MS;
    existing.foldedCount = summaryCount;
  } else {
    entries = [
      ...entries,
      {
        kind: 'summary',
        id: 'summary',
        severity: lastImportant?.severity ?? 'info',
        title,
        message,
        createdAt: now,
        expiresAt,
        ttlMs: SUMMARY_TTL_MS,
        foldedCount: summaryCount,
      },
    ];
  }
}

/** Hard cap on stored entries — drops the oldest non-summary cards. */
function capEntries(): void {
  if (entries.length <= MAX_LIVE_ENTRIES) return;
  const overflow = entries.length - MAX_LIVE_ENTRIES;
  let removed = 0;
  entries = entries.filter((e) => {
    if (removed < overflow && e.kind === 'notification') {
      removed += 1;
      return false;
    }
    return true;
  });
}

/* ── Public API ────────────────────────────────────────────────────── */

/**
 * Route a live notification to the LIVE stack (with dedup + suppression +
 * burst grouping). Returns true if the notification was displayed.
 */
export function pushNotificationToast(n: NotificationItem): boolean {
  if (typeof window === 'undefined') return false;
  if (seenIds.has(n.id)) return false;
  rememberId(n.id);

  // Actor-generated events: the acting admin already saw (or explicitly
  // suppressed) the local feedback for their own action — bell only.
  if (isSuppressed(n.type, n.entityId ?? undefined)) return false;

  const now = Date.now();

  // Critical events always show their own card and open a NEW burst.
  if (n.severity === 'critical') {
    burstAnchorAt = now;
    burstHasLead = true;
    summaryCount = 0;
    lastImportant = null;
    entries = [
      ...entries,
      {
        kind: 'notification',
        id: n.id,
        severity: n.severity,
        title: n.title,
        message: buildMessage(n),
        createdAt: now,
        expiresAt: now + ttlFor(n.severity),
        ttlMs: ttlFor(n.severity),
      },
    ];
    capEntries();
    ensureTicker();
    emit();
    return true;
  }

  const inBurst = burstHasLead && now - burstAnchorAt < BURST_WINDOW_MS;

  // First non-critical item of a burst → its own card as the lead.
  if (!inBurst) {
    burstAnchorAt = now;
    burstHasLead = true;
    summaryCount = 0;
    lastImportant = null;

    entries = [
      ...entries,
      {
        kind: 'notification',
        id: n.id,
        severity: n.severity,
        title: n.title,
        message: buildMessage(n),
        createdAt: now,
        expiresAt: now + ttlFor(n.severity),
        ttlMs: ttlFor(n.severity),
      },
    ];
    capEntries();
    ensureTicker();
    emit();
    return true;
  }

  // Subsequent items → fold into the summary card.
  summaryCount += 1;
  if (n.severity !== 'info') lastImportant = n;
  upsertSummary(now);
  capEntries();
  ensureTicker();
  emit();
  return true;
}

/** Seed dedup state after bootstrap so socket replays don't double-show. */
export function seedSeenNotifications(ids: string[]): void {
  for (const id of ids) rememberId(id);
}

/**
 * Subscribe to the live entries list. Returns an unsubscribe function.
 * Listeners receive a fresh snapshot array on every change.
 */
export function subscribeLiveNotifications(listener: Listener): () => void {
  listeners.add(listener);
  listener([...entries]);
  return () => {
    listeners.delete(listener);
  };
}

/** Pause/resume auto-expiry pruning (used by hover-to-pause in the UI). */
export function setLiveEntriesPaused(paused: boolean): void {
  entriesPaused = paused;
  if (!paused) {
    // Resume: prune anything that expired while paused.
    const now = Date.now();
    const next = entries.filter((e) => e.expiresAt > now);
    if (next.length !== entries.length) {
      entries = next;
      emit();
    }
  }
}

/** Remove a specific entry (user dismissed a card / the summary). */
export function dismissLiveEntry(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  if (id === 'summary') {
    summaryCount = 0;
    lastImportant = null;
  }
  emit();
}

/** Open the notification feed via the bell, falling back to the page. */
export function openNotificationFeed(): void {
  window.dispatchEvent(new CustomEvent('travalq:open-notifications'));
  setTimeout(() => {
    if (!document.querySelector('[data-notification-bell]')) {
      window.location.assign('/admin/notifications');
    }
  }, 350);
}

/** Reset all module state (logout / user switch). */
export function resetNotificationToastBridge(): void {
  seenIds.clear();
  seenOrder = [];
  entries = [];
  summaryCount = 0;
  lastImportant = null;
  burstAnchorAt = 0;
  burstHasLead = false;
  entriesPaused = false;
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
  emit();
}

/** Test-only: expose internals for unit assertions. */
export function __testInternals() {
  return {
    seenIds,
    getEntries: () => [...entries],
    getBurstState: () => ({
      summaryCount,
      burstHasLead,
      burstAnchorAt,
    }),
  };
}
