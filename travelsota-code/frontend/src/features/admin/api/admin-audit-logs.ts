import { adminRequest } from '@/lib/api/admin-client';

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  description: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
}

export function getAuditLogs(filters?: {
  userId?: string; action?: string; entity?: string; entityId?: string;
  from?: string; to?: string; limit?: number; offset?: number;
}) {
  const params = new URLSearchParams();
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.entity) params.set('entity', filters.entity);
  if (filters?.entityId) params.set('entityId', filters.entityId);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return adminRequest<AuditLogResponse>(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
}
