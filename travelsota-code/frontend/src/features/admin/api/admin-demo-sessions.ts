import { apiRequest } from '@/lib/api/client';

// ── Demo traffic analytics (super-admin only, backend-enforced) ─────────

export interface DemoVisitorRow {
  visitorId: string;
  logins: number;
  logins7d: number;
  totalDurationSeconds: number;
  activeDays: number;
  lastSeenAt: string | null;
  lastIpAddress: string | null;
  country: string | null;
  lead: { id: string; email: string; name: string | null; companyName: string | null } | null;
  frequent: boolean;
  activityCount?: number;
  lastActivityAt?: string | null;
}

/** One live session in the "watching right now" feed. */
export interface DemoWatchItem {
  sessionId: string;
  visitorId: string;
  role: string;
  country: string | null;
  ipAddress: string | null;
  durationSeconds: number;
  loginAt: string;
  lastSeenAt: string;
  recent: Array<{ type: 'page' | 'api'; label: string; createdAt: string }>;
}

export interface DemoSummary {
  totals: {
    sessions: number;
    uniqueVisitors: number;
    logins7d: number;
    sessionsToday: number;
    activeNow: number;
    avgDurationSeconds: number;
    totalDurationSeconds: number;
  };
  roles: Array<{ role: string; logins: number; totalDurationSeconds: number }>;
  trend: Array<{ date: string; logins: number; durationSeconds: number }>;
  hours: Array<{ day: number; hour: number; seconds: number }>;
  countries: Array<{
    country: string;
    sessions: number;
    visitors: number;
    totalDurationSeconds: number;
  }>;
  engagement: { under1m: number; oneTo5m: number; fiveTo20m: number; over20m: number };
  topVisitors: DemoVisitorRow[];
}

export async function getDemoSummary() {
  return apiRequest<DemoSummary>('/admin/demo-sessions/summary', {
    method: 'GET',
  });
}

export interface DemoSessionRow {
  id: string;
  visitorId: string;
  leadId: string | null;
  demoRole: string;
  ipAddress: string | null;
  country: string | null;
  userAgent: string | null;
  loginAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  durationSeconds: number;
}

export interface DemoSessionsResponse {
  items: DemoSessionRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DemoActivityRow {
  id: string;
  sessionId: string;
  visitorId: string;
  type: 'page' | 'api';
  label: string;
  createdAt: string;
}

export async function getDemoSessionActivities(sessionId: string) {
  return apiRequest<{ items: DemoActivityRow[] }>(
    `/admin/demo-sessions/${sessionId}/activities`,
    { method: 'GET' },
  );
}

export async function getDemoVisitorActivities(visitorId: string) {
  return apiRequest<{ items: DemoActivityRow[] }>(
    `/admin/demo-sessions/visitor/${visitorId}/activities`,
    { method: 'GET' },
  );
}

export async function getDemoWatchNow() {
  return apiRequest<{ items: DemoWatchItem[]; updatedAt: string }>(
    '/admin/demo-sessions/watch-now',
    { method: 'GET' },
  );
}

export async function getDemoSessions(params: {
  page?: number;
  limit?: number;
  demoRole?: string;
  visitorId?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.demoRole) searchParams.set('demoRole', params.demoRole);
  if (params.visitorId) searchParams.set('visitorId', params.visitorId);

  const qs = searchParams.toString();
  return apiRequest<DemoSessionsResponse>(`/admin/demo-sessions${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}
