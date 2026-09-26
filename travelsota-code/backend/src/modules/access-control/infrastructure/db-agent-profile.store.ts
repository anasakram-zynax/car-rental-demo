import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { AgentProfileStorePort } from '../application/ports/agent-profile-store.port';
import type { AgentProfileEntity, KycStatusType } from '../domain/agent-profile.entity';

@Injectable()
export class DbAgentProfileStore implements AgentProfileStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<AgentProfileEntity | null> {
    const profile = await this.prisma.agentProfile.findUnique({ where: { userId } });
    return profile ? this.toEntity(profile) : null;
  }

  async findAll(filters?: {
    kycStatus?: KycStatusType;
    isApproved?: boolean;
    isSuspended?: boolean;
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<AgentProfileEntity[]> {
    const where: any = {};
    if (filters?.kycStatus) where.kycStatus = filters.kycStatus;
    if (filters?.isApproved !== undefined) where.isApproved = filters.isApproved;
    if (filters?.isSuspended !== undefined) where.isSuspended = filters.isSuspended;
    if (filters?.search) {
      where.OR = [
        { companyName: { contains: filters.search, mode: 'insensitive' } },
        { companyPhone: { contains: filters.search } },
        { taxId: { contains: filters.search } },
      ];
    }
    if (filters?.fromDate || filters?.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    const profiles = await this.prisma.agentProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return profiles.map((p) => this.toEntity(p));
  }

  async upsert(userId: string, data: Partial<Omit<AgentProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<AgentProfileEntity> {
    const profile = await this.prisma.agentProfile.upsert({
      where: { userId },
      create: { userId, ...this.toPrismaData(data) },
      update: this.toPrismaData(data),
    });
    return this.toEntity(profile);
  }

  async update(userId: string, data: Partial<Omit<AgentProfileEntity, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>): Promise<AgentProfileEntity> {
    const profile = await this.prisma.agentProfile.update({
      where: { userId },
      data: this.toPrismaData(data),
    });
    return this.toEntity(profile);
  }

  async findByParentId(parentUserId: string): Promise<AgentProfileEntity[]> {
    const profiles = await this.prisma.agentProfile.findMany({
      where: { parentAgentId: parentUserId },
      orderBy: { createdAt: 'asc' },
    });
    return profiles.map((p) => this.toEntity(p));
  }

  async countByParentId(parentUserId: string): Promise<number> {
    return this.prisma.agentProfile.count({
      where: { parentAgentId: parentUserId },
    });
  }

  private toPrismaData(data: any) {
    const prisma: any = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) prisma[key] = value;
    }
    return prisma;
  }

  private toEntity(p: any): AgentProfileEntity {
    return {
      id: p.id, userId: p.userId,
      creditLimit: Number(p.creditLimit), creditUsed: Number(p.creditUsed),
      commissionRate: Number(p.commissionRate), flightMarkup: Number(p.flightMarkup), hotelMarkup: Number(p.hotelMarkup),
      companyName: p.companyName, companyPhone: p.companyPhone, companyAddress: p.companyAddress, taxId: p.taxId,
      isApproved: p.isApproved, approvedBy: p.approvedBy, approvedAt: p.approvedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),

      // Phase 1 fields
      parentAgentId: p.parentAgentId ?? null,
      walletBalance: Number(p.walletBalance ?? 0),
      walletCurrency: p.walletCurrency ?? 'USD',
      permissionOverrides: p.permissionOverrides as { grant?: string[]; revoke?: string[] } | null ?? null,
      commissionTierId: p.commissionTierId ?? null,
      markupRules: p.markupRules as Record<string, unknown> | null ?? null,
      kycStatus: (p.kycStatus ?? 'PENDING') as KycStatusType,
      kycDocuments: p.kycDocuments as Record<string, unknown>[] | null ?? null,
      branding: p.branding as Record<string, unknown> | null ?? null,
      autoSuspendThreshold: p.autoSuspendThreshold ?? 100,
      isSuspended: p.isSuspended ?? false,
      suspensionReason: p.suspensionReason ?? null,
      maxSubAgents: p.maxSubAgents ?? 5,
      maxCreditPerSub: Number(p.maxCreditPerSub ?? 0),
      inheritMarkups: p.inheritMarkups ?? true,
      inheritCommission: p.inheritCommission ?? false,
      subAgentDefaultRoleId: p.subAgentDefaultRoleId ?? null,
      canManageSubAgents: p.canManageSubAgents ?? false,
      segregatedCredit: p.segregatedCredit ?? false,
      allowedSubAgentRoleIds: p.allowedSubAgentRoleIds as string[] | null ?? null,
      allowedFlightProviders: p.allowedFlightProviders as string[] | null ?? null,
      allowedHotelProviders: p.allowedHotelProviders as string[] | null ?? null,
      allowedGateways: p.allowedGateways as string[] | null ?? null,
    };
  }
}
