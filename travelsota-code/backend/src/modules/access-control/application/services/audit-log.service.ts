import { Inject, Injectable } from '@nestjs/common';
import type { AuditLogStorePort } from '../ports/audit-log-store.port';

export const AUDIT_LOG_STORE = Symbol('AUDIT_LOG_STORE');

@Injectable()
export class AuditLogService {
  constructor(
    @Inject(AUDIT_LOG_STORE) private readonly store: AuditLogStorePort,
  ) {}

  async log(params: {
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
  }) {
    return this.store.create(params);
  }

  async logChange(params: {
    userId?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE';
    entity: string;
    entityId?: string;
    description?: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const changedFields = this.computeChangedFields(params.oldValue, params.newValue);
    return this.store.create({
      ...params,
      metadata: changedFields ? { changedFields } : undefined,
    });
  }

  async findAll(filters?: {
    userId?: string; action?: string; entity?: string; entityId?: string;
    from?: string; to?: string; limit?: number; offset?: number;
  }) {
    return this.store.findAll(filters);
  }

  async deleteMany(ids: string[]): Promise<number> {
    return this.store.deleteMany(ids);
  }

  private computeChangedFields(old?: Record<string, unknown>, updated?: Record<string, unknown>): string[] | null {
    if (!old || !updated) return null;
    const changed: string[] = [];
    const allKeys = new Set([...Object.keys(old), ...Object.keys(updated)]);
    for (const key of allKeys) {
      if (JSON.stringify(old[key]) !== JSON.stringify(updated[key])) {
        changed.push(key);
      }
    }
    return changed.length > 0 ? changed : null;
  }
}
