import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dismissLiveEntry,
  pushNotificationToast,
  resetNotificationToastBridge,
  seedSeenNotifications,
  setLiveEntriesPaused,
  subscribeLiveNotifications,
  __testInternals,
} from '../notification-toast-bridge';
import {
  resetActorEventDedupe,
  suppressDuplicateSuccess,
} from '../actor-event-dedupe';
import type { NotificationItem } from '../../api/notification-types';

function makeNotification(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: 'n1',
    type: 'booking.confirmed',
    category: 'booking',
    title: 'Booking Confirmed',
    message: 'A booking was confirmed',
    severity: 'info',
    entityType: 'FlightBooking',
    entityId: 'b-123',
    metadata: null,
    createdAt: new Date().toISOString(),
    readAt: null,
    dismissedAt: null,
    ...overrides,
  };
}

describe('notification-toast-bridge (live store)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    resetNotificationToastBridge();
    resetActorEventDedupe();
  });

  it('shows the first notification as its own card', () => {
    expect(pushNotificationToast(makeNotification())).toBe(true);
    const entries = __testInternals().getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'notification',
      id: 'n1',
      severity: 'info',
      title: 'Booking Confirmed',
    });
  });

  it('notifies subscribers on every change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLiveNotifications(listener);
    // Initial snapshot on subscribe.
    expect(listener).toHaveBeenCalledTimes(1);

    pushNotificationToast(makeNotification({ id: 'a' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    pushNotificationToast(makeNotification({ id: 'b' }));
    // No further calls after unsubscribing.
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('dedupes by id and via seeded ids', () => {
    expect(pushNotificationToast(makeNotification())).toBe(true);
    expect(pushNotificationToast(makeNotification())).toBe(false);

    seedSeenNotifications(['seeded-1']);
    expect(pushNotificationToast(makeNotification({ id: 'seeded-1' }))).toBe(
      false,
    );
  });

  it('suppresses actor-generated events (bell only)', () => {
    suppressDuplicateSuccess('booking.cancelled', 'b-9');
    expect(
      pushNotificationToast(
        makeNotification({ id: 'n-sup', type: 'booking.cancelled', entityId: 'b-9' }),
      ),
    ).toBe(false);
    expect(__testInternals().getEntries()).toHaveLength(0);
  });

  it('groups subsequent events into a summary within the burst window', () => {
    pushNotificationToast(makeNotification({ id: 'lead' }));

    vi.advanceTimersByTime(1_000);
    expect(pushNotificationToast(makeNotification({ id: 'second' }))).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(pushNotificationToast(makeNotification({ id: 'third' }))).toBe(true);

    const entries = __testInternals().getEntries();
    expect(entries).toHaveLength(2); // lead card + summary
    const summary = entries.find((e) => e.kind === 'summary');
    expect(summary).toBeDefined();
    expect(summary?.title).toBe('2 more new notifications');
    expect(summary?.foldedCount).toBe(2);
  });

  it('critical notifications get their own card and anchor a fresh burst', () => {
    pushNotificationToast(makeNotification({ id: 'lead', severity: 'info' }));
    vi.advanceTimersByTime(1_000);
    expect(
      pushNotificationToast(
        makeNotification({ id: 'crit', severity: 'critical' }),
      ),
    ).toBe(true);

    const entries = __testInternals().getEntries();
    expect(entries.filter((e) => e.kind === 'notification')).toHaveLength(2);

    // The critical reset the burst anchor, so a fast-follow event joins a
    // NEW burst as a summary instead of silently starting one later.
    vi.advanceTimersByTime(1_000);
    expect(pushNotificationToast(makeNotification({ id: 'after' }))).toBe(true);
    const summary = __testInternals()
      .getEntries()
      .find((e) => e.kind === 'summary');
    expect(summary).toBeDefined();
    expect(summary?.title).toBe('1 more new notification');
  });

  it('prunes expired entries and stops the ticker when idle', () => {
    pushNotificationToast(makeNotification({ id: 'ttl' }));
    expect(__testInternals().getEntries()).toHaveLength(1);

    vi.advanceTimersByTime(7_000); // info TTL is 6s
    expect(__testInternals().getEntries()).toHaveLength(0);
  });

  it('hover pause holds cards past expiry; resume prunes them', () => {
    pushNotificationToast(makeNotification({ id: 'held' }));

    // Pause BEFORE the TTL elapses, then advance past it.
    setLiveEntriesPaused(true);
    vi.advanceTimersByTime(15_000);
    expect(__testInternals().getEntries()).toHaveLength(1); // held

    setLiveEntriesPaused(false);
    expect(__testInternals().getEntries()).toHaveLength(0); // pruned on resume
  });

  it('dismissLiveEntry removes a card and resets summary state', () => {
    pushNotificationToast(makeNotification({ id: 'lead' }));
    vi.advanceTimersByTime(1_000);
    pushNotificationToast(makeNotification({ id: 'second' }));

    dismissLiveEntry('summary');
    expect(
      __testInternals().getEntries().some((e) => e.kind === 'summary'),
    ).toBe(false);

    dismissLiveEntry('lead');
    expect(__testInternals().getEntries()).toHaveLength(0);
  });

  it('is a no-op during SSR', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - intentionally deleting window for the SSR case
    delete globalThis.window;
    try {
      expect(pushNotificationToast(makeNotification())).toBe(false);
      expect(__testInternals().getEntries()).toHaveLength(0);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
