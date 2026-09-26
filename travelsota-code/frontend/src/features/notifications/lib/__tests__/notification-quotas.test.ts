import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelSnooze,
  getSnoozeUntil,
  isSeverityMuted,
  isSnoozed,
  setSeverityMuted,
  snooze,
  __resetQuotas,
  SNOOZE_DURATION_MS,
} from '../notification-quotas';

const KEY = 'travalq.notification-quotas.v1';

describe('notification quotas (mute + snooze)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetQuotas();
  });

  it('mutes and unmutes individual severities, persisted to localStorage', () => {
    expect(isSeverityMuted('info')).toBe(false);

    setSeverityMuted('info', true);
    expect(isSeverityMuted('info')).toBe(true);
    expect(isSeverityMuted('high')).toBe(false);
    expect(isSeverityMuted('critical')).toBe(false);

    const raw = window.localStorage.getItem(KEY);
    expect(JSON.parse(raw!).muted).toEqual(['info']);

    setSeverityMuted('info', false);
    expect(isSeverityMuted('info')).toBe(false);
  });

  it('restores mute state from localStorage on a fresh module load', async () => {
    setSeverityMuted('critical', true);
    setSeverityMuted('info', true);

    vi.resetModules();
    const fresh = await import('../notification-quotas');
    expect(fresh.isSeverityMuted('critical')).toBe(true);
    expect(fresh.isSeverityMuted('info')).toBe(true);
    expect(fresh.isSeverityMuted('high')).toBe(false);
  });

  it('snoozes for 30 minutes and auto-expires', () => {
    const before = Date.now();
    const until = snooze(before);
    expect(until).toBe(before + SNOOZE_DURATION_MS);
    expect(getSnoozeUntil()).toBe(until);
    expect(isSnoozed(before + 1000)).toBe(true);
    expect(isSnoozed(until + 1)).toBe(false);
  });

  it('restores an active snooze from localStorage, ignores expired ones', async () => {
    // Store an already-expired snooze directly (snooze() always adds 30m).
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ muted: [], snoozedUntil: Date.now() - 1000 }),
    );
    vi.resetModules();
    const fresh = await import('../notification-quotas');
    expect(fresh.isSnoozed()).toBe(false);

    snooze(); // active now
    vi.resetModules();
    const fresh2 = await import('../notification-quotas');
    expect(fresh2.isSnoozed()).toBe(true);
  });

  it('cancelSnooze clears the snooze', () => {
    snooze();
    cancelSnooze();
    expect(getSnoozeUntil()).toBeNull();
    expect(isSnoozed()).toBe(false);
  });

  it('tolerates corrupt localStorage on load', async () => {
    window.localStorage.setItem(KEY, '{not valid json');
    vi.resetModules();
    const fresh = await import('../notification-quotas');
    expect(fresh.isSeverityMuted('info')).toBe(false);
    expect(fresh.isSnoozed()).toBe(false);
  });

  it('filters invalid severity values when loading', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ muted: ['info', 'bogus', 42], snoozedUntil: 'x' }),
    );
    vi.resetModules();
    const fresh = await import('../notification-quotas');
    expect(fresh.isSeverityMuted('info')).toBe(true);
    expect(fresh.isSeverityMuted('high')).toBe(false);
    expect(fresh.isSnoozed()).toBe(false);
  });
});
