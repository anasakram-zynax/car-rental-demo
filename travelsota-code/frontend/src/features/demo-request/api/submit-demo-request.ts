import { apiRequest } from '@/lib/api/client';

export interface DemoCredentials {
  admin: { email: string; password: string; dashboardUrl: string };
  agent: { email: string; password: string; dashboardUrl: string };
  user: { email: string; password: string; dashboardUrl: string };
}

export interface SubmitDemoResponse {
  requestId: string;
  credentials: DemoCredentials;
  message: string;
}

export interface CredentialsResponse {
  credentials: DemoCredentials;
}

export async function submitDemoRequest(data: {
  email: string;
  name?: string;
  companyName?: string;
  whatsappNumber?: string;
}) {
  return apiRequest<SubmitDemoResponse>('/public/demo-request', {
    method: 'POST',
    body: data,
    auth: false,
  });
}

export async function getCredentials(requestId: string) {
  return apiRequest<CredentialsResponse>(`/public/demo-request/credentials/${requestId}`, {
    method: 'GET',
    auth: false,
  });
}

const SESSION_KEY = 'demo_lead_session';
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export interface LeadSession {
  requestId: string;
  email: string;
  name?: string;
  companyName?: string;
  whatsappNumber?: string;
  expiresAt: number;
}

export function saveLeadSession(session: Omit<LeadSession, 'expiresAt'>) {
  const data: LeadSession = {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }
}

export function getLeadSession(): LeadSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as LeadSession;
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return data;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearLeadSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
  }
}
