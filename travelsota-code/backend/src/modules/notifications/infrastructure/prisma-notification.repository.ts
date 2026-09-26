import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { NotificationItem, NotificationListResult, UnreadCountResult } from '../domain/notification-types';

export interface NotificationFilters {
  userId: string;
  page?: number;
  limit?: number;
  severity?: string;
  category?: string;
  type?: string;
  read?: 'all' | 'read' | 'unread';
  q?: string;
  from?: string;
  to?: string;
}

@Injectable()
export class PrismaNotificationRepository {
  private readonly logger = new Logger(PrismaNotificationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(filters: NotificationFilters): Promise<NotificationListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    // Build where conditions for the recipient join
    const where: any = {
      userId: filters.userId,
    };

    // Read state filter
    if (filters.read === 'read') {
      where.readAt = { not: null };
    } else if (filters.read === 'unread') {
      where.readAt = null;
    }
    // 'all' — no filter on readAt

    // Dismissed — exclude dismissed by default
    where.dismissedAt = null;

    // Notification-level filters
    const notificationWhere: any = {};
    if (filters.severity) {
      notificationWhere.severity = filters.severity;
    }
    if (filters.category) {
      notificationWhere.category = filters.category;
    }
    if (filters.type) {
      notificationWhere.type = filters.type;
    }
    if (filters.q) {
      notificationWhere.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { message: { contains: filters.q, mode: 'insensitive' } },
      ];
    }
    if (filters.from || filters.to) {
      notificationWhere.createdAt = {};
      if (filters.from) notificationWhere.createdAt.gte = new Date(filters.from);
      if (filters.to) notificationWhere.createdAt.lte = new Date(filters.to);
    }

    if (Object.keys(notificationWhere).length > 0) {
      where.notification = notificationWhere;
    }

    // The outer notificationRecipient record already has readAt/dismissedAt —
    // no need to re-include notification.recipients (redundant self-join).
    const [recipients, total] = await Promise.all([
      this.prisma.notificationRecipient.findMany({
        where,
        include: {
          notification: true,
        },
        orderBy: { notification: { createdAt: 'desc' } },
        skip,
        take: limit,
      }),
      this.prisma.notificationRecipient.count({ where }),
    ]);

    const data: NotificationItem[] = recipients.map((r) => ({
      id: r.notification.id,
      type: r.notification.type,
      category: r.notification.category,
      title: r.notification.title,
      message: r.notification.message,
      severity: r.notification.severity as NotificationItem['severity'],
      entityType: r.notification.entityType,
      entityId: r.notification.entityId,
      actor: null,
      metadata: r.notification.metadata as Record<string, unknown> | null,
      createdAt: r.notification.createdAt.toISOString(),
      readAt: r.readAt?.toISOString() ?? null,
      dismissedAt: r.dismissedAt?.toISOString() ?? null,
    }));

    return { data, total, page, limit };
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResult> {
    // Grouped in SQL — the previous version loaded every unread row to count
    // severities in JS. This endpoint backs the header badge (hot path).
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ severity: string; count: number }>
    >(
      `SELECT n."severity" AS severity, COUNT(*)::int AS count
       FROM "NotificationRecipient" r
       JOIN "Notification" n ON n."id" = r."notificationId"
       WHERE r."userId" = $1 AND r."readAt" IS NULL AND r."dismissedAt" IS NULL
       GROUP BY n."severity"`,
      userId,
    );

    const counts: UnreadCountResult = { total: 0, critical: 0, high: 0, info: 0 };
    for (const r of rows) {
      if (r.severity === 'critical') counts.critical += r.count;
      else if (r.severity === 'high') counts.high += r.count;
      else counts.info += r.count;
      counts.total += r.count;
    }
    return counts;
  }

  async getCriticalNotifications(userId: string, limit = 5): Promise<NotificationItem[]> {
    const recipients = await this.prisma.notificationRecipient.findMany({
      where: {
        userId,
        readAt: null,
        dismissedAt: null,
        notification: {
          severity: 'critical',
        },
      },
      include: {
        notification: {
          include: {
            recipients: {
              where: { userId },
              select: { readAt: true, dismissedAt: true },
            },
          },
        },
      },
      orderBy: { notification: { createdAt: 'desc' } },
      take: limit,
    });

    return recipients.map((r) => {
      const recipient = r.notification.recipients[0];
      return {
        id: r.notification.id,
        type: r.notification.type,
        category: r.notification.category,
        title: r.notification.title,
        message: r.notification.message,
        severity: r.notification.severity as NotificationItem['severity'],
        entityType: r.notification.entityType,
        entityId: r.notification.entityId,
        actor: null,
        metadata: r.notification.metadata as Record<string, unknown> | null,
        createdAt: r.notification.createdAt.toISOString(),
        readAt: recipient?.readAt?.toISOString() ?? null,
        dismissedAt: recipient?.dismissedAt?.toISOString() ?? null,
      };
    });
  }

  async markRead(userId: string, notificationIds: string[]): Promise<number> {
    const now = new Date();
    const result = await this.prisma.notificationRecipient.updateMany({
      where: {
        userId,
        notificationId: { in: notificationIds },
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });
    return result.count;
  }

  async markAllRead(userId: string, filters?: { severity?: string; category?: string; type?: string }): Promise<number> {
    const where: any = {
      userId,
      readAt: null,
      dismissedAt: null,
    };

    if (filters?.severity || filters?.category || filters?.type) {
      const notificationWhere: any = {};
      if (filters?.severity) notificationWhere.severity = filters.severity;
      if (filters?.category) notificationWhere.category = filters.category;
      if (filters?.type) notificationWhere.type = filters.type;
      where.notification = notificationWhere;
    }

    const now = new Date();
    const result = await this.prisma.notificationRecipient.updateMany({
      where,
      data: {
        readAt: now,
      },
    });
    return result.count;
  }

  async dismiss(userId: string, notificationId: string): Promise<boolean> {
    const now = new Date();
    const result = await this.prisma.notificationRecipient.updateMany({
      where: {
        userId,
        notificationId,
        dismissedAt: null,
      },
      data: {
        dismissedAt: now,
      },
    });
    return result.count > 0;
  }

  /** Permanently removes the user's recipient rows for these notifications. */
  async deleteMany(userId: string, notificationIds: string[]): Promise<number> {
    if (notificationIds.length === 0) return 0;
    const result = await this.prisma.notificationRecipient.deleteMany({
      where: { userId, notificationId: { in: notificationIds } },
    });
    return result.count;
  }

  async getPreferences(userId: string): Promise<{ type: string; channel: string; enabled: boolean }[]> {
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId },
      select: { type: true, channel: true, enabled: true },
    });
    return prefs;
  }

  async updatePreference(
    userId: string,
    type: string,
    channel: string,
    enabled: boolean,
  ): Promise<void> {
    await this.prisma.notificationPreference.upsert({
      where: {
        userId_type_channel: { userId, type, channel },
      },
      create: { userId, type, channel, enabled },
      update: { enabled },
    });
  }

  async getRules(): Promise<any[]> {
    return this.prisma.notificationRule.findMany({
      include: {
        roles: {
          select: { roleId: true },
        },
      },
      orderBy: { type: 'asc' },
    });
  }

  async getRuleById(id: string): Promise<any | null> {
    return this.prisma.notificationRule.findUnique({
      where: { id },
      include: {
        roles: {
          select: { roleId: true },
        },
      },
    });
  }

  async updateRule(
    id: string,
    data: {
      enabled?: boolean;
      severity?: string;
      critical?: boolean;
      roleIds?: string[];
    },
  ): Promise<any> {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.notificationRule.update({
        where: { id },
        data: {
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          ...(data.severity ? { severity: data.severity } : {}),
          ...(data.critical !== undefined ? { critical: data.critical } : {}),
        },
      });

      if (data.roleIds !== undefined) {
        // Remove existing role assignments
        await tx.notificationRuleRole.deleteMany({ where: { ruleId: id } });
        // Create new role assignments
        if (data.roleIds.length > 0) {
          await tx.notificationRuleRole.createMany({
            data: data.roleIds.map((roleId) => ({ ruleId: id, roleId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.notificationRule.findUnique({
        where: { id },
        include: { roles: { select: { roleId: true } } },
      });
    });
  }

  /**
   * Creates a notification with recipients idempotently.
   * Returns the notification ID if created, null if already exists.
   */
  async createNotification(data: {
    type: string;
    title: string;
    message?: string;
    severity: string;
    category?: string;
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey: string;
    recipientUserIds: string[];
  }): Promise<string | null> {
    const id = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      // Create notification with skipDuplicates on idempotencyKey
      const notification = await tx.notification.create({
        data: {
          id,
          type: data.type,
          title: data.title,
          message: data.message ?? null,
          severity: data.severity,
          category: data.category ?? null,
          entityType: data.entityType ?? null,
          entityId: data.entityId ?? null,
          actorUserId: data.actorUserId ?? undefined,
          metadata: (data.metadata ?? undefined) as any,
          idempotencyKey: data.idempotencyKey,
        },
      });

      // Create recipients
      if (data.recipientUserIds.length > 0) {
        await tx.notificationRecipient.createMany({
          data: data.recipientUserIds.map((userId) => ({
            notificationId: notification.id,
            userId,
            deliveredAt: new Date(),
          })),
          skipDuplicates: true,
        });
      }

      return notification;
    }).catch((err: any) => {
      // Unique constraint violation — notification already exists
      if (err.code === 'P2002') {
        this.logger.debug(`Duplicate notification suppressed: ${data.idempotencyKey}`);
        return null;
      }
      throw err;
    });

    return result ? result.id : null;
  }
}