import type { AuditLogEntity } from '../../domain/audit-log.entity';

export interface AuditLogStorePort {
  create(data: {
    userId?: string;
    action: string;
    entity: string;
    entityId?: string;
    description?: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntity>;

  findAll(filters?: {
    userId?: string;
    action?: string;
    entity?: string;
    entityId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AuditLogEntity[]; total: number }>;

  deleteMany(ids: string[]): Promise<number>;
}
