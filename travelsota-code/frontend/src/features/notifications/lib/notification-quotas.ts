'use client';

/**
 * User notification quotas — per-severity mute + snooze for the LIVE stack.
 *
 * - Mute: hides live cards of a severity until unmuted (persisted).
 * - Snooze: temporarily shows nothing in the live stack (persisted with an
 *   expiry; auto-clears).
 *
 * Storage is best-effort: private-mode/quota failures degrade to in-memory.
 * This does NOT touch backend notification delivery — muted/severities and
 * snoozed stacks still receive events and bell counts; only the floating
 * cards are suppressed.
 */

import type { NotificationSeverity } from '../api/notification-types';

const STORAGE_KEY = 'travalq.notification-quotas.v1';

const SNOOZE_MS = 30 * 60 * 1000; // 30 minutes

interface QuotaState {
  muted: NotificationSeverity[];
  snoozedUntil: number | null;
}

let state: QuotaState = { muted: [], snoozedUntil: null };

/* ── Persistence ───────────────────────────────────────────────────── */

const quotaListeners = new Set<() => void>();

function notifyQuotas(): void {
  for (const listener of quotaListeners) listener();
}

function load(): void {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<QuotaState>;
    const muted = Array.isArray(parsed.muted)
      ? parsed.muted.filter(
          (s): s is NotificationSeverity =>
            s === 'info' || s === 'high' || s === 'critical',
        )
      : [];
    const snoozedUntil =
      typeof parsed.snoozedUntil === 'number' ? parsed.snoozedUntil : null;

    const changed =
      muted.join(',') !== state.muted.join(',') ||
      snoozedUntil !== state.snoozedUntil;
    state = { muted, snoozedUntil };
    if (changed) notifyQuotas();
  } catch {
    // Corrupt or unavailable storage — start clean.
  }
}

function save(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private mode / quota — in-memory state still works for this session.
  }
}

/* ── Init ──────────────────────────────────────────────────────────── */

if (typeof window !== 'undefined') {
  load();
}

/* ── Public API ────────────────────────────────────────────────────── */

export function isSeverityMuted(severity: NotificationSeverity): boolean {
  return state.muted.includes(severity);
}

export function setSeverityMuted(
  severity: NotificationSeverity,
  muted: boolean,
): void {
  const next = new Set(state.muted);
  if (muted) next.add(severity);
  else next.delete(severity);
  state.muted = [...next];
  save();
  notifyQuotas();
}

export function isSnoozed(now = Date.now()): boolean {
  return state.snoozedUntil !== null && state.snoozedUntil > now;
}

/** Snooze the live stack for 30 minutes. Returns the expiry epoch ms. */
export function snooze(now = Date.now()): number {
  const until = now + SNOOZE_MS;
  state.snoozedUntil = until;
  save();
  notifyQuotas();
  return until;
}

export function cancelSnooze(): void {
  state.snoozedUntil = null;
  save();
  notifyQuotas();
}

export function getSnoozeUntil(): number | null {
  return state.snoozedUntil;
}

export const SNOOZE_DURATION_MS = SNOOZE_MS;

/** Subscribe to quota changes (mute / snooze). Returns an unsubscribe fn. */
export function subscribeQuotas(listener: () => void): () => void {
  quotaListeners.add(listener);
  return () => quotaListeners.delete(listener);
}

/** Test/reset helper. */
export function __resetQuotas(): void {
  state = { muted: [], snoozedUntil: null };
}
