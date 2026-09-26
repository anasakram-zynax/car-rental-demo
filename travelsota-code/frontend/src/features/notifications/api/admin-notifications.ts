import { adminRequest } from '@/lib/api/admin-client';
import type {
  NotificationListResult,
  UnreadCountResult,
  NotificationItem,
  NotificationPreference,
  NotificationRule,
  NotificationFilters,
} from './notification-types';

function buildQuery(filters?: NotificationFilters): string {
  if (!filters) return '';
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.category) params.set('category', filters.category);
  if (filters.type) params.set('type', filters.type);
  if (filters.read) params.set('read', filters.read);
  if (filters.q) params.set('q', filters.q);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function listNotifications(filters?: NotificationFilters) {
  return adminRequest<NotificationListResult>(`/admin/notifications${buildQuery(filters)}`);
}

export function getUnreadNotificationCount() {
  return adminRequest<UnreadCountResult>('/admin/notifications/unread-count');
}

export function getCriticalNotifications() {
  return adminRequest<NotificationItem[]>('/admin/notifications/critical');
}

export interface NotificationBootstrap {
  unread: UnreadCountResult;
  critical: NotificationItem[];
  recent: NotificationListResult;
  high: NotificationListResult;
}

/** Header bootstrap: count + critical + recent + high feed in ONE round trip. */
export function getNotificationBootstrap() {
  return adminRequest<NotificationBootstrap>('/admin/notifications/bootstrap');
}

export function getNotificationsBySeverity(severity: 'critical' | 'high' | 'info') {
  return adminRequest<NotificationListResult>(`/admin/notifications?severity=${severity}&read=unread&limit=10`);
}

export function markNotificationsRead(ids: string[]) {
  return adminRequest<{ count: number }>('/admin/notifications/read', {
    method: 'PATCH',
    body: { ids },
  });
}

export function markAllNotificationsRead(filters?: NotificationFilters) {
  return adminRequest<{ count: number }>(`/admin/notifications/read-all${buildQuery(filters)}`, {
    method: 'PATCH',
  });
}

export function dismissNotification(id: string) {
  return adminRequest<{ dismissed: boolean }>(`/admin/notifications/${id}/dismiss`, {
    method: 'PATCH',
  });
}

export function deleteNotifications(ids: string[]) {
  return adminRequest<{ count: number }>('/admin/notifications/delete', {
    method: 'POST',
    body: { ids },
  });
}

export function getNotificationPreferences() {
  return adminRequest<NotificationPreference[]>('/admin/notifications/preferences');
}

export function updateNotificationPreference(input: {
  type: string;
  channel: string;
  enabled: boolean;
}) {
  return adminRequest<{ success: boolean }>('/admin/notifications/preferences', {
    method: 'PATCH',
    body: input,
  });
}

export function getNotificationRules() {
  return adminRequest<NotificationRule[]>('/admin/notifications/rules');
}

export function updateNotificationRule(
  id: string,
  input: {
    enabled?: boolean;
    severity?: string;
    critical?: boolean;
    roleIds?: string[];
  },
) {
  return adminRequest<NotificationRule>(`/admin/notifications/rules/${id}`, {
    method: 'PATCH',
    body: input,
  });
}


