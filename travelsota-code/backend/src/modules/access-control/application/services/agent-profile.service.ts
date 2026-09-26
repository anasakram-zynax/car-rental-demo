import { Inject, Injectable } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import type { AgentProfileStorePort, AgentProfileFilters } from '../ports/agent-profile-store.port';
import type { AgentProfileEntity, KycStatusType } from '../../domain/agent-profile.entity';
import { AuditLogService } from './audit-log.service';

export const AGENT_PROFILE_STORE = Symbol('AGENT_PROFILE_STORE');

@Injectable()
export class AgentProfileService {
  constructor(
    @Inject(AGENT_PROFILE_STORE) private readonly store: AgentProfileStorePort,
    private readonly auditLog: AuditLogService,
  ) { }

  async findByUserId(userId: string): Promise<AgentProfileEntity | null> {
    return this.store.findByUserId(userId);
  }

  async findAll(filters?: AgentProfileFilters): Promise<AgentProfileEntity[]> {
    return this.store.findAll(filters);
  }

  async upsert(userId: string, data: Partial<Omit<AgentProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>, actorId?: string, ip?: string, ua?: string): Promise<AgentProfileEntity> {
    const existing = await this.store.findByUserId(userId);
    const profile = await this.store.upsert(userId, data);

    await this.auditLog.logChange({
      userId: actorId, action: existing ? 'UPDATE' : 'CREATE', entity: 'AgentProfile', entityId: profile.id,
      description: `${existing ? 'Updated' : 'Created'} agent profile for user ${userId}`,
      oldValue: existing ? { creditLimit: existing.creditLimit, commissionRate: existing.commissionRate, flightMarkup: existing.flightMarkup, hotelMarkup: existing.hotelMarkup } as any : undefined,
      newValue: { creditLimit: profile.creditLimit, commissionRate: profile.commissionRate, flightMarkup: profile.flightMarkup, hotelMarkup: profile.hotelMarkup } as any,
      ipAddress: ip, userAgent: ua,
    });

    return profile;
  }

  async approve(userId: string, approvedBy: string, ip?: string, ua?: string): Promise<AgentProfileEntity> {
    const existing = await this.store.findByUserId(userId);
    if (!existing) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (existing.kycStatus === 'APPROVED') throw new BusinessError('AGENT_ALREADY_APPROVED');

    const profile = await this.store.upsert(userId, {
      isApproved: true,
      approvedBy,
      approvedAt: new Date().toISOString(),
      kycStatus: 'APPROVED' as KycStatusType,
    });

    await this.auditLog.log({
      userId: approvedBy, action: 'APPROVE', entity: 'AgentProfile', entityId: profile.id,
      description: `Approved agent profile for user ${userId}`,
      ipAddress: ip, userAgent: ua,
    });

    return profile;
  }

  async reject(userId: string, reason: string, rejectedBy: string, ip?: string, ua?: string): Promise<AgentProfileEntity> {
    const existing = await this.store.findByUserId(userId);
    if (!existing) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (existing.kycStatus === 'REJECTED') throw new BusinessError('AGENT_ALREADY_REJECTED');

    const profile = await this.store.upsert(userId, {
      isApproved: false,
      kycStatus: 'REJECTED' as KycStatusType,
      suspensionReason: reason,
    });

    await this.auditLog.log({
      userId: rejectedBy, action: 'REJECT', entity: 'AgentProfile', entityId: profile.id,
      description: `Rejected agent profile for user ${userId}: ${reason}`,
      ipAddress: ip, userAgent: ua,
    });

    return profile;
  }

  async deductCredit(userId: string, amount: number): Promise<void> {
    const profile = await this.store.findByUserId(userId);
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const newUsed = profile.creditUsed + amount;
    if (profile.creditLimit > 0 && newUsed > profile.creditLimit) {
      throw new BusinessError('AGENT_CREDIT_LIMIT_EXCEEDED');
    }

    await this.store.upsert(userId, { creditUsed: newUsed });
  }

  /** Suspend a live agent (confirm-modal flow from the listing). */
  async suspend(userId: string, reason: string | undefined, actorId: string, ip?: string, ua?: string): Promise<AgentProfileEntity> {
    const existing = await this.store.findByUserId(userId);
    if (!existing) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (existing.isSuspended) throw new BusinessError('AGENT_ALREADY_SUSPENDED');
    const profile = await this.store.upsert(userId, {
      isSuspended: true,
      suspensionReason: reason?.slice(0, 300) ?? 'Suspended by admin',
    });
    await this.auditLog.log({
      userId: actorId, action: 'SUSPEND', entity: 'AgentProfile', entityId: profile.id,
      description: `Suspended agent ${userId}${reason ? `: ${reason}` : ''}`,
      ipAddress: ip, userAgent: ua,
    });
    return profile;
  }

  /** Re-activate a suspended agent. */
  async unsuspend(userId: string, actorId: string, ip?: string, ua?: string): Promise<AgentProfileEntity> {
    const existing = await this.store.findByUserId(userId);
    if (!existing) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    if (!existing.isSuspended) throw new BusinessError('AGENT_NOT_SUSPENDED');
    const profile = await this.store.upsert(userId, { isSuspended: false, suspensionReason: null });
    await this.auditLog.log({
      userId: actorId, action: 'UNSUSPEND', entity: 'AgentProfile', entityId: profile.id,
      description: `Re-activated agent ${userId}`,
      ipAddress: ip, userAgent: ua,
    });
    return profile;
  }
}
