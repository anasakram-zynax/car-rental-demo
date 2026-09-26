import { adminRequest } from '@/lib/api/admin-client';

export interface EmailMessage {
  id: string;
  type: string;
  templateKey: string;
  subject: string;
  html: string;
  text: string | null;
  status: string;
  severity: string;
  aggregateType: string | null;
  aggregateId: string | null;
  idempotencyKey: string;
  retryCount: number;
  metadata: unknown;
  scheduledAt: string;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  recipients: EmailRecipient[];
  deliveryAttempts: EmailDeliveryAttempt[];
}

export interface EmailRecipient {
  id: string;
  emailMessageId: string;
  email: string;
  recipientType: string;
  status: string;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface EmailDeliveryAttempt {
  id: string;
  emailMessageId: string;
  recipientEmail: string;
  provider: string;
  attempt: number;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  response: unknown;
  createdAt: string;
}

export interface EmailStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  deadLetter: number;
}

export interface EmailRule {
  id: string;
  type: string;
  enabled: boolean;
  sendToCustomer: boolean;
  sendToAgent: boolean;
  sendToAdmin: boolean;
  sendToRoles: string[];
  critical: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailListResponse {
  items: EmailMessage[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function getEmails(params: { status?: string; type?: string; page?: number; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.type) qs.set('type', params.type);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  return adminRequest<EmailListResponse>(`/admin/emails${query ? `?${query}` : ''}`);
}

export function getEmail(id: string) {
  return adminRequest<EmailMessage>(`/admin/emails/${id}`);
}

export function getEmailStats() {
  return adminRequest<EmailStats>('/admin/emails/stats');
}

export function retryEmail(id: string) {
  return adminRequest<{ retried: boolean }>(`/admin/emails/${id}/retry`, { method: 'POST' });
}

export function getEmailRules() {
  return adminRequest<EmailRule[]>('/admin/emails/rules');
}

export function updateEmailRule(id: string, data: { enabled?: boolean; sendToCustomer?: boolean; sendToAgent?: boolean; sendToAdmin?: boolean }) {
  return adminRequest<EmailRule>(`/admin/emails/rules/${id}`, { method: 'PUT', body: data });
}

export function sendTestEmail(data: { email: string; subject?: string; message?: string }) {
  return adminRequest<{ queued: boolean; messageId: string | null }>('/admin/emails/test', { method: 'POST', body: data });
}

export function dispatchPendingEmails() {
  return adminRequest<{ dispatched: boolean }>('/admin/emails/dispatch-pending', { method: 'POST' });
}
