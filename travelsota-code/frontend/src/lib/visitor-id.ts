/**
 * Anonymous demo-visitor identity.
 *
 * A UUID generated once per browser and persisted in localStorage. This is the
 * PRIMARY identity signal for demo traffic analytics (userId is useless — all
 * demo visitors share the same three accounts; IPs collapse behind NAT).
 *
 * Trade-offs (accepted, documented in DEMO_LEADS_TRACKING_PLAN.md):
 * - dies with localStorage (incognito, cleared storage, other devices)
 * - deliberately NOT fingerprinting — accuracy gain is not worth it
 */

const KEY = 'demo_visitor_id';

export function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage unavailable (private mode, hardened extensions) — session-scoped ID.
    try {
      const sessionKey = `${KEY}:session`;
      const existing = window.sessionStorage.getItem(sessionKey);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      window.sessionStorage.setItem(sessionKey, fresh);
      return fresh;
    } catch {
      return '';
    }
  }
}

export function isUuid(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
