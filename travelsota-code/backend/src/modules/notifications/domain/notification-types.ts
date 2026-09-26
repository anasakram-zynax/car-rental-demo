import { NotificationSeverity } from './notification-severity.enum';

export interface NotificationItem {
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
}

export interface NotificationListResult {
  data: NotificationItem[];
  total: number;
  page: number;
  limit: number;
}

export interface UnreadCountResult {
  total: number;
  critical: number;
  high: number;
  info: number;
}

export interface NotificationPreference {
  type: string;
  channel: string;
  enabled: boolean;
}

export interface NotificationRule {
  id: string;
  type: string;
  category?: string | null;
  severity: string;
  enabled: boolean;
  critical: boolean;
  description?: string | null;
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** Maps business event types to notification types */
export const NOTIFICATION_EVENT_MAP: Record<string, { type: string; severity: NotificationSeverity; category: string; critical: boolean }> = {
  'booking.flight.created': {
    type: 'booking.flight.created',
    severity: NotificationSeverity.INFO,
    category: 'booking',
    critical: false,
  },
  'booking.hotel.created': {
    type: 'booking.hotel.created',
    severity: NotificationSeverity.INFO,
    category: 'booking',
    critical: false,
  },
  'booking.confirmed': {
    type: 'booking.confirmed',
    severity: NotificationSeverity.HIGH,
    category: 'booking',
    critical: false,
  },
  'booking.issued': {
    type: 'booking.issued',
    severity: NotificationSeverity.HIGH,
    category: 'booking',
    critical: false,
  },
  'booking.awaiting_issue': {
    type: 'booking.awaiting_issue',
    severity: NotificationSeverity.INFO,
    category: 'booking',
    critical: false,
  },
  'booking.failed': {
    type: 'booking.failed',
    severity: NotificationSeverity.CRITICAL,
    category: 'booking',
    critical: true,
  },
  'booking.cancelled': {
    type: 'booking.cancelled',
    severity: NotificationSeverity.HIGH,
    category: 'booking',
    critical: false,
  },
  'payment.succeeded': {
    type: 'payment.succeeded',
    severity: NotificationSeverity.INFO,
    category: 'payment',
    critical: false,
  },
  'payment.failed': {
    type: 'payment.failed',
    severity: NotificationSeverity.CRITICAL,
    category: 'payment',
    critical: true,
  },
  'refund.requested': {
    type: 'refund.requested',
    severity: NotificationSeverity.CRITICAL,
    category: 'refund',
    critical: true,
  },
  'refund.completed': {
    type: 'refund.completed',
    severity: NotificationSeverity.HIGH,
    category: 'refund',
    critical: false,
  },
  'wallet.topup.requested': {
    type: 'wallet.topup.requested',
    severity: NotificationSeverity.HIGH,
    category: 'wallet',
    critical: true,
  },
  'wallet.topup.completed': {
    type: 'wallet.topup.completed',
    severity: NotificationSeverity.INFO,
    category: 'wallet',
    critical: false,
  },
  'wallet.withdrawal.requested': {
    type: 'wallet.withdrawal.requested',
    severity: NotificationSeverity.HIGH,
    category: 'wallet',
    critical: true,
  },
  'agent.credit.near_limit': {
    type: 'agent.credit.near_limit',
    severity: NotificationSeverity.HIGH,
    category: 'agent_credit',
    critical: false,
  },
  'agent.credit.exceeded': {
    type: 'agent.credit.exceeded',
    severity: NotificationSeverity.HIGH,
    category: 'agent_credit',
    critical: false,
  },
  'user.staff.created': {
    type: 'user.staff.created',
    severity: NotificationSeverity.INFO,
    category: 'user',
    critical: false,
  },
  'user.staff.deleted': {
    type: 'user.staff.deleted',
    severity: NotificationSeverity.CRITICAL,
    category: 'user',
    critical: true,
  },
  'role.updated': {
    type: 'role.updated',
    severity: NotificationSeverity.CRITICAL,
    category: 'role',
    critical: true,
  },
  'role.permission_changed': {
    type: 'role.permission_changed',
    severity: NotificationSeverity.CRITICAL,
    category: 'role',
    critical: true,
  },
  'settings.provider_credentials_updated': {
    type: 'settings.provider_credentials_updated',
    severity: NotificationSeverity.CRITICAL,
    category: 'settings',
    critical: true,
  },
  'settings.payment_gateway_updated': {
    type: 'settings.payment_gateway_updated',
    severity: NotificationSeverity.HIGH,
    category: 'settings',
    critical: false,
  },
  'provider.travelport.failure': {
    type: 'provider.travelport.failure',
    severity: NotificationSeverity.CRITICAL,
    category: 'provider',
    critical: true,
  },
  'provider.duffel.failure': {
    type: 'provider.duffel.failure',
    severity: NotificationSeverity.CRITICAL,
    category: 'provider',
    critical: true,
  },
  'provider.hotelbeds.failure': {
    type: 'provider.hotelbeds.failure',
    severity: NotificationSeverity.CRITICAL,
    category: 'provider',
    critical: true,
  },
  'settings.provider_toggled': {
    type: 'settings.provider_toggled',
    severity: NotificationSeverity.HIGH,
    category: 'settings',
    critical: false,
  },
};