import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { AuditLogStorePort } from '../application/ports/audit-log-store.port';
import type { AuditLogEntity } from '../domain/audit-log.entity';

@Injectable()
export class DbAuditLogStore implements AuditLogStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    userId?: string; action: string; entity: string; entityId?: string;
    description?: string; oldValue?: Record<string, unknown>; newValue?: Record<string, unknown>;
    ipAddress?: string; userAgent?: string; metadata?: Record<string, unknown>;
  }): Promise<AuditLogEntity> {
    const log = await this.prisma.auditLog.create({ data: data as any });
    return this.toEntity(log);
  }

  async findAll(filters?: {
    userId?: string; action?: string; entity?: string; entityId?: string;
    from?: string; to?: string; limit?: number; offset?: number;
  }): Promise<{ items: AuditLogEntity[]; total: number }> {
    const where: any = {};
    if (filters?.userId) where.userId = filters.userId;
    if (filters?.action) where.action = filters.action;
    if (filters?.entity) where.entity = filters.entity;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit ?? 50,
        skip: filters?.offset ?? 0,
        // List view never renders old/new values (verified: no UI reads
        // them) — excluding the two JSON blobs keeps pages light.
        select: {
          id: true, userId: true, action: true, entity: true,
          entityId: true, description: true, ipAddress: true,
          userAgent: true, metadata: true, createdAt: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items: items.map(this.toEntity), total };
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.auditLog.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }

  private toEntity(l: any): AuditLogEntity {
    return {
      id: l.id, userId: l.userId, action: l.action, entity: l.entity,
      entityId: l.entityId, description: l.description,
      oldValue: l.oldValue as Record<string, unknown> | null,
      newValue: l.newValue as Record<string, unknown> | null,
      ipAddress: l.ipAddress, userAgent: l.userAgent,
      metadata: l.metadata as Record<string, unknown> | null,
      createdAt: l.createdAt.toISOString(),
    };
  }
}
