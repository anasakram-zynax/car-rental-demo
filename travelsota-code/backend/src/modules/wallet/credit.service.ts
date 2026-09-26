import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditLogService } from '../access-control/application/services/audit-log.service';
import { OutboxWriterService } from '../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../notifications/application/notification.service';

export interface CreditUtilization {
  creditLimit: number;
  creditUsed: number;
  available: number;
  utilizationPercent: number;
  isOverThreshold: boolean;
  autoSuspendThreshold: number;
  isSuspended: boolean;
}

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  /** Set credit limit for an agent (by userId) */
  async setCreditLimit(
    userId: string,
    limit: number,
    actorId?: string,
    ip?: string,
    ua?: string,
  ): Promise<{ creditLimit: number; creditUsed: number }> {
    if (limit < 0) throw new BusinessError('INVALID_CREDIT_LIMIT', 'Credit limit must be >= 0');

    const profile = await this.prisma.agentProfile.findUnique({ where: { userId } });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const before = Number(profile.creditLimit);
    const creditUsed = Number(profile.creditUsed);

    if (limit > 0 && creditUsed > limit) {
      throw new BusinessError(
        'CREDIT_LIMIT_TOO_LOW',
        `Cannot set limit to ${limit}. Agent currently uses ${creditUsed} in credit.`,
      );
    }

    await this.prisma.agentProfile.update({
      where: { userId },
      data: { creditLimit: limit },
    });

    await this.auditLog.logChange({
      userId: actorId,
      action: 'UPDATE',
      entity: 'AgentProfile',
      entityId: profile.id,
      description: `Set credit limit from ${before} to ${limit} for agent ${userId}`,
      oldValue: { creditLimit: before } as any,
      newValue: { creditLimit: limit } as any,
      ipAddress: ip,
      userAgent: ua,
    });

    return { creditLimit: limit, creditUsed };
  }

  /** Get credit utilization for an agent */
  async getCreditUtilization(userId: string): Promise<CreditUtilization> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: {
        creditLimit: true,
        creditUsed: true,
        autoSuspendThreshold: true,
        isSuspended: true,
      },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const creditLimit = Number(profile.creditLimit);
    const creditUsed = Number(profile.creditUsed);
    const available = Math.max(0, creditLimit - creditUsed);
    const utilizationPercent = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;
    const isOverThreshold = creditLimit > 0 && utilizationPercent >= profile.autoSuspendThreshold;

    return {
      creditLimit,
      creditUsed,
      available,
      utilizationPercent,
      isOverThreshold,
      autoSuspendThreshold: profile.autoSuspendThreshold,
      isSuspended: profile.isSuspended,
    };
  }

  /** Check if agent should be auto-suspended based on credit utilization */
  async autoSuspendCheck(userId: string): Promise<{
    shouldSuspend: boolean;
    suspended: boolean;
    reason: string | null;
  }> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        creditLimit: true,
        creditUsed: true,
        autoSuspendThreshold: true,
        isSuspended: true,
        suspensionReason: true,
      },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const creditLimit = Number(profile.creditLimit);
    const creditUsed = Number(profile.creditUsed);
    const utilizationPercent = creditLimit > 0 ? Math.round((creditUsed / creditLimit) * 100) : 0;
    const shouldSuspend = creditLimit > 0 && utilizationPercent >= profile.autoSuspendThreshold && !profile.isSuspended;

    // Emit near-limit notification at 80% utilization (only when credit limit is set)
    if (creditLimit > 0 && utilizationPercent >= 80 && utilizationPercent < profile.autoSuspendThreshold && !profile.isSuspended) {
      try {
        const eventId = randomUUID();
        await this.outboxWriter.write({
          idempotencyKey: eventId,
          eventType: 'agent.credit.near_limit',
          aggregateType: 'Agent',
          aggregateId: userId,
          payload: {
            userId,
            creditLimit,
            creditUsed,
            utilizationPercent,
            threshold: profile.autoSuspendThreshold,
          },
        });
        this.notifications.notifyDirect({
          idempotencyKey: eventId,
          eventType: 'agent.credit.near_limit',
          aggregateType: 'Agent',
          aggregateId: userId,
          payload: {
            userId,
            creditLimit,
            creditUsed,
            utilizationPercent,
            threshold: profile.autoSuspendThreshold,
          },
        }).catch(() => {});
      } catch {
        // Non-critical — log and continue
        this.logger.warn(`Failed to emit agent.credit.near_limit for ${userId}`);
      }
    }

    if (shouldSuspend) {
      await this.prisma.agentProfile.update({
        where: { id: profile.id },
        data: {
          isSuspended: true,
          suspensionReason: `Auto-suspended: credit utilization ${utilizationPercent}% exceeds threshold ${profile.autoSuspendThreshold}%`,
        },
      });

      // Emit exceeded notification
      try {
        const eventId = randomUUID();
        await this.outboxWriter.write({
          idempotencyKey: eventId,
          eventType: 'agent.credit.exceeded',
          aggregateType: 'Agent',
          aggregateId: userId,
          payload: {
            userId,
            creditLimit,
            creditUsed,
            utilizationPercent,
            threshold: profile.autoSuspendThreshold,
            action: 'auto_suspended',
          },
        });
        this.notifications.notifyDirect({
          idempotencyKey: eventId,
          eventType: 'agent.credit.exceeded',
          aggregateType: 'Agent',
          aggregateId: userId,
          payload: {
            userId,
            creditLimit,
            creditUsed,
            utilizationPercent,
            threshold: profile.autoSuspendThreshold,
            action: 'auto_suspended',
          },
        }).catch(() => {});
      } catch {
        this.logger.warn(`Failed to emit agent.credit.exceeded for ${userId}`);
      }

      return {
        shouldSuspend: true,
        suspended: true,
        reason: `Credit utilization ${utilizationPercent}% exceeded ${profile.autoSuspendThreshold}% threshold`,
      };
    }

    return {
      shouldSuspend: false,
      suspended: profile.isSuspended,
      reason: profile.isSuspended ? profile.suspensionReason : null,
    };
  }
}
