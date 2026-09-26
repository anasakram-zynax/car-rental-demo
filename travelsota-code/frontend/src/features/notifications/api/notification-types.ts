export type NotificationSeverity = 'info' | 'high' | 'critical';

export type NotificationItem = {
  id: string;
  type: string;
  category?: string | null;
  title: string;
  message?: string | null;
  severity: NotificationSeverity;
  entityType?: string | null;
  entityId?: string | null;
  actor?: {
    id?: string;
    email?: string;
    name?: string;
  } | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  readAt?: string | null;
  dismissedAt?: string | null;
};

export type NotificationListResult = {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
};

export type UnreadCountResult = {
  total: number;
  critical: number;
  high: number;
  info: number;
};

export type NotificationPreference = {
  type: string;
  channel: string;
  enabled: boolean;
};

export type NotificationRule = {
  id: string;
  type: string;
  category?: string | null;
  severity: string;
  enabled: boolean;
  critical: boolean;
  description?: string | null;
  roles: { roleId: string }[];
  createdAt: string;
  updatedAt: string;
};

export type NotificationFilters = {
  page?: number;
  limit?: number;
  severity?: string;
  category?: string;
  type?: string;
  read?: 'all' | 'read' | 'unread';
  q?: string;
  from?: string;
  to?: string;
};