import { apiRequest } from '@/lib/api/client';
import { getPublicEnv } from '@/lib/env/env';
import { isUuid, getVisitorId } from '@/lib/visitor-id';

/**
 * Demo session tracking API (quick-credentials + session lifecycle).
 * All endpoints are public by design (demo credentials are public) except
 * start/heartbeat which require a demo-account JWT (handled by apiRequest).
 */

export interface QuickCredentials {
  enabled: boolean;
  credentials: {
    admin: { email: string; password: string; dashboardUrl: string };
    agent: { email: string; password: string; dashboardUrl: string };
    user: { email: string; password: string; dashboardUrl: string };
  };
}

export interface StartSessionResponse {
  sessionId: string | null;
  tracked: boolean;
  /** True when an existing live session for this visitor+role was reused. */
  resumed?: boolean;
}

export interface HeartbeatResponse {
  ok: boolean;
  reason?: string;
}

export interface IdentifyResponse {
  leadId: string;
  linkedSessions: number;
}

export async function getQuickCredentials() {
  return apiRequest<QuickCredentials>('/public/demo/quick-credentials', {
    method: 'GET',
    auth: false,
  });
}

export async function startDemoSession(visitorId: string) {
  return apiRequest<StartSessionResponse>('/public/demo/sessions/start', {
    method: 'POST',
    body: { visitorId },
  });
}

export async function recordDemoActivity(
  sessionId: string,
  label: string,
) {
  return apiRequest<{ ok: boolean; throttled?: boolean }>(
    '/public/demo/activities',
    {
      method: 'POST',
      body: { sessionId, type: 'page', label },
    },
  );
}

export async function heartbeatDemoSession(sessionId: string) {
  return apiRequest<HeartbeatResponse>('/public/demo/sessions/heartbeat', {
    method: 'POST',
    body: { sessionId },
    auth: true,
  });
}

/**
 * The API base URL for beacon calls (no Authorization headers possible).
 */
function getBeaconBaseUrl(): string | null {
  try {
    return getPublicEnv().NEXT_PUBLIC_API_BASE_URL ?? null;
  } catch {
    return null;
  }
}

/**
 * End-beacon: fire-and-forget session end via `navigator.sendBeacon`.
 * sendBeacon survives page unload (unlike fetch) and cannot set the
 * Authorization header — the backend accepts it auth-free because the
 * sessionId is an unguessable UUID and the only effect is freezing stats.
 * Returns false when the beacon could not be queued (caller falls back to
 * the keepalive fetch below).
 */
export function endDemoSessionBeacon(sessionId: string): boolean {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return false;
  try {
    const base = getBeaconBaseUrl();
    if (!base) return false;
    const blob = new Blob([JSON.stringify({ sessionId })], {
      type: 'application/json',
    });
    return navigator.sendBeacon(`${base}/public/demo/sessions/end`, blob);
  } catch {
    return false;
  }
}

/** fetch keepalive fallback for browsers without sendBeacon. */
export async function endDemoSession(sessionId: string): Promise<void> {
  const base = getBeaconBaseUrl();
  if (!base) return;
  try {
    await fetch(`${base}/public/demo/sessions/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    });
  } catch {
    /* fire-and-forget — the server-side sweeper is the safety net */
  }
}

export async function identifyDemoVisitor(data: {
  email: string;
  name?: string;
  companyName?: string;
  whatsappNumber?: string;
}) {
  const visitorId = getVisitorId();
  if (!isUuid(visitorId)) {
    throw new Error('Visitor identity unavailable');
  }
  return apiRequest<IdentifyResponse>('/public/demo/identify', {
    method: 'POST',
    body: { visitorId, ...data },
    auth: false,
  });
}

// ── Active demo-session state (localStorage → survives refresh) ────────

const ACTIVE_SESSION_KEY = 'demo_active_session';
export const DEMO_SESSION_STARTED_EVENT = 'demo-session-started';

/** Fired on window when the signed-in user logs out — the tracker ends the session. */
export const DEMO_SESSION_END_EVENT = 'demo-session-end';

export interface ActiveDemoSession {
  sessionId: string;
  role: 'admin' | 'agent' | 'user';
  startedAt: number;
}

export function saveActiveDemoSession(session: ActiveDemoSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
    // The tracker mounts once in the root layout — before any login — so it
    // must be told when a session appears.
    window.dispatchEvent(new Event(DEMO_SESSION_STARTED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getActiveDemoSession(): ActiveDemoSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as ActiveDemoSession;
    // Discard stale sessions (>24h) — matches server-side max age.
    if (!data?.sessionId || Date.now() - data.startedAt > 24 * 3600 * 1000) {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearActiveDemoSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
