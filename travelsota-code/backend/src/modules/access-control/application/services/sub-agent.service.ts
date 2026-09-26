import { Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { AgentProfileStorePort } from '../ports/agent-profile-store.port';
import type { UserStorePort } from '../ports/user-store.port';
import type { RoleStorePort } from '../ports/role-store.port';
import { PermissionCheckService } from './permission-check.service';
import { AGENT_PROFILE_STORE } from './agent-profile.service';
import { USER_STORE } from './user-management.service';
import { ROLE_STORE } from './role.service';
import { AuditLogService } from './audit-log.service';
import { PermissionCode } from '../../domain/enums/permission-code.enum';

@Injectable()
export class SubAgentService {
  private readonly logger = new Logger(SubAgentService.name);

  constructor(
    @Inject(AGENT_PROFILE_STORE) private readonly agentStore: AgentProfileStorePort,
    @Inject(USER_STORE) private readonly userStore: UserStorePort,
    @Inject(ROLE_STORE) private readonly roleStore: RoleStorePort,
    private readonly permissionCheck: PermissionCheckService,
    private readonly auditLog: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async createSubAgent(
    parentUserId: string,
    dto: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      roleId?: string;
      creditLimit?: number;
      grantPermissions?: string[];
      revokePermissions?: string[];
      segregatedCredit?: boolean;
    },
  ) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    // Approach D, Rule 1: Hard 1-level block — sub-agents can NEVER create teams
    if (parentProfile.parentAgentId) {
      throw new BusinessError(
        'SUB_AGENTS_NOT_ALLOWED',
        'Sub-agents cannot create their own teams.',
      );
    }

    // Approach D, Rule 2: Admin's per-agent toggle
    if (!parentProfile.canManageSubAgents) {
      throw new BusinessError(
        'SUB_AGENTS_DISABLED',
        'Sub-agent management is not enabled for your account. Contact your admin.',
      );
    }

    const currentCount = await this.agentStore.countByParentId(parentProfile.id);
    if (currentCount >= parentProfile.maxSubAgents) {
      throw new BusinessError(
        'SUB_AGENT_LIMIT_REACHED',
        `Maximum of ${parentProfile.maxSubAgents} sub-agents allowed`,
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BusinessError('PASSWORD_TOO_SHORT', 'Password must be at least 8 characters');
    }

    const existingUser = await this.userStore.findByEmail(dto.email);
    if (existingUser) throw new BusinessError('USER_EMAIL_EXISTS');

    const resolvedRoleId = dto.roleId ?? parentProfile.subAgentDefaultRoleId;
    if (!resolvedRoleId) {
      throw new BusinessError('ROLE_REQUIRED', 'A role must be assigned to the sub-agent');
    }

    const role = await this.roleStore.findById(resolvedRoleId);
    if (!role) throw new BusinessError('ROLE_NOT_FOUND');

    if (parentProfile.allowedSubAgentRoleIds && parentProfile.allowedSubAgentRoleIds.length > 0) {
      if (!parentProfile.allowedSubAgentRoleIds.includes(resolvedRoleId)) {
        throw new BusinessError(
          'ROLE_NOT_ALLOWED',
          `You are not allowed to assign the role "${role.name}" to sub-agents.`,
        );
      }
    }

    const resolvedCredit = dto.creditLimit ?? parentProfile.maxCreditPerSub;
    if (parentProfile.maxCreditPerSub > 0 && resolvedCredit > parentProfile.maxCreditPerSub) {
      throw new BusinessError(
        'SUB_AGENT_CREDIT_EXCEEDS_MAX',
        `Credit limit cannot exceed ${parentProfile.maxCreditPerSub}`,
      );
    }

    // Validate permission grants are within parent's permissions
    const parentPerms = await this.permissionCheck.getEffectivePermissions(parentUserId);
    const grantablePerms = parentPerms.filter((p) => p !== PermissionCode.AGENT_MANAGE_SUB_AGENTS);

    if (dto.grantPermissions?.length) {
      for (const perm of dto.grantPermissions) {
        if (!grantablePerms.includes(perm)) {
          throw new BusinessError(
            'PERMISSION_NOT_GRANTABLE',
            `Permission "${perm}" cannot be granted to sub-agents`,
          );
        }
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          userType: 'AGENT',
          status: 'ACTIVE',
          roleId: resolvedRoleId,
          createdById: parentUserId,
        },
      });

      await tx.agentProfile.create({
        data: {
          userId: user.id,
          parentAgentId: parentProfile.id,
          creditLimit: resolvedCredit,
          creditUsed: 0,
          commissionRate: parentProfile.inheritCommission ? parentProfile.commissionRate : 0,
          flightMarkup: parentProfile.inheritMarkups ? parentProfile.flightMarkup : 0,
          hotelMarkup: parentProfile.inheritMarkups ? parentProfile.hotelMarkup : 0,
          isApproved: true,
          kycStatus: 'APPROVED',
          canManageSubAgents: false,
          segregatedCredit: dto.segregatedCredit ?? false,
          permissionOverrides: dto.grantPermissions || dto.revokePermissions
            ? ({ grant: dto.grantPermissions ?? [], revoke: dto.revokePermissions ?? [] } as any)
            : undefined,
        },
      });

      return user;
    });

    await this.auditLog.log({
      userId: parentUserId,
      action: 'CREATE',
      entity: 'SubAgent',
      entityId: result.id,
      description: `Created sub-agent ${dto.email} with role "${role.name}"`,
      newValue: { email: dto.email, role: role.name, creditLimit: resolvedCredit },
    });

    const effectivePermissions = await this.permissionCheck.getEffectivePermissions(result.id);

    return {
      userId: result.id,
      email: result.email,
      role: role.name,
      permissions: effectivePermissions,
    };
  }

  async listSubAgents(parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profiles = await this.agentStore.findByParentId(parentProfile.id);
    if (profiles.length === 0) return [];

    const userIds = profiles.map((p) => p.userId);
    const profileIds = profiles.map((p) => p.id);

    const profileMap = new Map(profiles.map((p) => [p.userId, p]));

    const [users, flightCounts, hotelCounts, walletAggregates] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, firstName: true, lastName: true, status: true, lastLoginAt: true, role: { select: { name: true, permissions: { select: { permission: { select: { code: true } } } } } } },
      }),
      this.prisma.flightBooking.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { id: true } }),
      this.prisma.hotelBooking.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { id: true } }),
      this.prisma.walletTransaction.groupBy({ by: ['agentProfileId'], where: { agentProfileId: { in: profileIds }, type: 'deduct' }, _sum: { amount: true } }),
    ]);

    const bookingCountMap = new Map<string, number>();
    for (const f of flightCounts) bookingCountMap.set(f.userId!, (bookingCountMap.get(f.userId!) ?? 0) + f._count.id);
    for (const h of hotelCounts) bookingCountMap.set(h.userId!, (bookingCountMap.get(h.userId!) ?? 0) + h._count.id);

    const walletMap = new Map<string, number>();
    for (const w of walletAggregates) {
      if (w.agentProfileId) walletMap.set(w.agentProfileId, Math.abs(Number(w._sum.amount ?? 0)));
    }

    return users.map((user) => {
      const profile = profileMap.get(user.id)!;
      const basePerms = user.role?.permissions.map((rp) => rp.permission.code) ?? [];
      const overrides = profile.permissionOverrides as { grant?: string[]; revoke?: string[] } | null;
      let effectivePermissions = basePerms;
      if (overrides) {
        const granted = new Set(basePerms);
        overrides.grant?.forEach((p) => granted.add(p));
        overrides.revoke?.forEach((p) => granted.delete(p));
        effectivePermissions = [...granted];
      }

      return {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        roleName: user.role?.name ?? null,
        creditLimit: profile.creditLimit,
        creditUsed: profile.creditUsed,
        creditAvailable: Math.max(0, profile.creditLimit - profile.creditUsed),
        isSuspended: profile.isSuspended,
        permissions: effectivePermissions,
        totalBookings: bookingCountMap.get(user.id) ?? 0,
        totalSpent: walletMap.get(profile.id) ?? 0,
        walletCurrency: profile.walletCurrency ?? 'USD',
        lastLoginAt: user.lastLoginAt,
        createdAt: profile.createdAt,
      };
    });
  }

  async updateSubAgent(
    subUserId: string,
    parentUserId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      roleId?: string;
      creditLimit?: number;
      grantPermissions?: string[];
      revokePermissions?: string[];
    },
  ) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profile = await this.agentStore.findByUserId(subUserId);
    if (!profile || profile.parentAgentId !== parentProfile.id) {
      throw new BusinessError('SUB_AGENT_NOT_FOUND', 'Sub-agent not found under your account');
    }

    if (dto.creditLimit !== undefined) {
      if (parentProfile?.maxCreditPerSub && parentProfile.maxCreditPerSub > 0 && dto.creditLimit > parentProfile.maxCreditPerSub) {
        throw new BusinessError('SUB_AGENT_CREDIT_EXCEEDS_MAX');
      }
    }

    const parentPerms = await this.permissionCheck.getEffectivePermissions(parentUserId);
    const grantablePerms = parentPerms.filter((p) => p !== PermissionCode.AGENT_MANAGE_SUB_AGENTS);

    if (dto.grantPermissions?.length) {
      for (const perm of dto.grantPermissions) {
        if (!grantablePerms.includes(perm)) {
          throw new BusinessError('PERMISSION_NOT_GRANTABLE', `Permission "${perm}" cannot be granted`);
        }
      }
    }

    if (dto.roleId && parentProfile?.allowedSubAgentRoleIds?.length) {
      if (!parentProfile.allowedSubAgentRoleIds.includes(dto.roleId)) {
        throw new BusinessError('ROLE_NOT_ALLOWED');
      }
    }

    const permissionOverrides =
      dto.grantPermissions || dto.revokePermissions
        ? {
            grant: dto.grantPermissions ?? (profile.permissionOverrides?.grant ?? []),
            revoke: dto.revokePermissions ?? (profile.permissionOverrides?.revoke ?? []),
          }
        : undefined;

    const agentUpdate: any = {};
    if (dto.creditLimit !== undefined) agentUpdate.creditLimit = dto.creditLimit;
    if (permissionOverrides) agentUpdate.permissionOverrides = permissionOverrides;

    if (Object.keys(agentUpdate).length > 0) {
      await this.agentStore.update(subUserId, agentUpdate);
    }

    if (dto.firstName !== undefined || dto.lastName !== undefined || dto.roleId !== undefined) {
      await this.userStore.update(subUserId, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        roleId: dto.roleId,
      });
    }

    const updatedProfile = await this.agentStore.findByUserId(subUserId);
    const updatedUser = await this.userStore.findById(subUserId);
    const effectivePermissions = await this.permissionCheck.getEffectivePermissions(subUserId);

    return {
      ...updatedUser,
      agentProfile: updatedProfile,
      permissions: effectivePermissions,
    };
  }

  async getTeamStats(parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const subProfiles = await this.agentStore.findByParentId(parentProfile.id);
    if (subProfiles.length === 0) return { subAgentCount: 0, totalBookings: 0, totalRevenue: 0, topSubAgent: null };

    const userIds = subProfiles.map((p) => p.userId);
    const profileIds = subProfiles.map((p) => p.id);

    const [flightCounts, hotelCounts, walletAggregates] = await Promise.all([
      this.prisma.flightBooking.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { id: true } }),
      this.prisma.hotelBooking.groupBy({ by: ['userId'], where: { userId: { in: userIds } }, _count: { id: true } }),
      this.prisma.walletTransaction.groupBy({ by: ['agentProfileId'], where: { agentProfileId: { in: profileIds } }, _sum: { amount: true } }),
    ]);

    const bookingCounts = new Map<string, number>();
    for (const f of flightCounts) bookingCounts.set(f.userId!, (bookingCounts.get(f.userId!) ?? 0) + f._count.id);
    for (const h of hotelCounts) bookingCounts.set(h.userId!, (bookingCounts.get(h.userId!) ?? 0) + h._count.id);

    const revenueMap = new Map<string, number>();
    for (const w of walletAggregates) {
      if (w.agentProfileId) revenueMap.set(w.agentProfileId, Math.abs(Number(w._sum.amount ?? 0)));
    }

    let totalBookings = 0;
    let totalRevenue = 0;
    let topUserId = '';
    let topRevenue = 0;

    for (const p of subProfiles) {
      const bookings = bookingCounts.get(p.userId) ?? 0;
      const revenue = revenueMap.get(p.id) ?? 0;
      totalBookings += bookings;
      totalRevenue += revenue;
      if (revenue > topRevenue) { topRevenue = revenue; topUserId = p.userId; }
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const topUser = userMap.get(topUserId);

    return {
      subAgentCount: subProfiles.length,
      totalBookings,
      totalRevenue,
      topSubAgent: topUser ? {
        userId: topUser.id,
        name: [topUser.firstName, topUser.lastName].filter(Boolean).join(' ') || topUser.email,
        bookings: bookingCounts.get(topUserId) ?? 0,
        revenue: topRevenue,
      } : null,
    };
  }

  async getSubAgentDetail(subUserId: string, parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profile = await this.agentStore.findByUserId(subUserId);
    if (!profile || profile.parentAgentId !== parentProfile.id) {
      throw new BusinessError('SUB_AGENT_NOT_FOUND', 'Sub-agent not found under your account');
    }

    const user = await this.userStore.findById(subUserId);
    if (!user) throw new BusinessError('USER_NOT_FOUND');

    const effectivePermissions = await this.permissionCheck.getEffectivePermissions(subUserId);

    const [flightBookings, hotelBookings, walletSummary, auditLogs] = await Promise.all([
      this.prisma.flightBooking.findMany({
        where: { userId: subUserId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, amount: true, currency: true, createdAt: true },
      }),
      this.prisma.hotelBooking.findMany({
        where: { userId: subUserId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, amount: true, currency: true, createdAt: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { agentProfileId: profile.id },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.auditLog.findMany({
        where: { userId: subUserId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { action: true, entity: true, description: true, createdAt: true },
      }),
    ]);

    const allBookings = [
      ...flightBookings.map((b) => ({ ...b, type: 'flight' as const })),
      ...hotelBookings.map((b) => ({ ...b, type: 'hotel' as const })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roleName: user.roleName,
      creditLimit: profile.creditLimit,
      creditUsed: profile.creditUsed,
      creditAvailable: Math.max(0, profile.creditLimit - profile.creditUsed),
      commissionRate: profile.commissionRate,
      isSuspended: profile.isSuspended,
      permissions: effectivePermissions,
      totalBookings: flightBookings.length + hotelBookings.length,
      totalSpent: Math.abs(Number(walletSummary._sum.amount ?? 0)),
      walletCurrency: profile.walletCurrency ?? 'USD',
      totalTransactions: walletSummary._count,
      lastLoginAt: user.lastLoginAt,
      createdAt: profile.createdAt,
      recentBookings: allBookings.slice(0, 10),
      recentAudit: auditLogs.slice(0, 10),
    };
  }

  async suspendSubAgent(subUserId: string, parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profile = await this.agentStore.findByUserId(subUserId);
    if (!profile || profile.parentAgentId !== parentProfile.id) {
      throw new BusinessError('SUB_AGENT_NOT_FOUND');
    }

    await this.agentStore.update(subUserId, { isSuspended: true });
    await this.userStore.update(subUserId, { status: 'SUSPENDED' });

    await this.auditLog.log({
      userId: parentUserId,
      action: 'UPDATE',
      entity: 'SubAgent',
      entityId: subUserId,
      description: `Suspended sub-agent ${subUserId}`,
    });

    return { success: true };
  }

  async reactivateSubAgent(subUserId: string, parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profile = await this.agentStore.findByUserId(subUserId);
    if (!profile || profile.parentAgentId !== parentProfile.id) {
      throw new BusinessError('SUB_AGENT_NOT_FOUND');
    }

    await this.agentStore.update(subUserId, { isSuspended: false });
    await this.userStore.update(subUserId, { status: 'ACTIVE' });

    await this.auditLog.log({
      userId: parentUserId,
      action: 'UPDATE',
      entity: 'SubAgent',
      entityId: subUserId,
      description: `Reactivated sub-agent ${subUserId}`,
    });

    return { success: true };
  }

  async removeSubAgent(subUserId: string, parentUserId: string) {
    const parentProfile = await this.agentStore.findByUserId(parentUserId);
    if (!parentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const profile = await this.agentStore.findByUserId(subUserId);
    if (!profile || profile.parentAgentId !== parentProfile.id) {
      throw new BusinessError('SUB_AGENT_NOT_FOUND');
    }

    await this.userStore.update(subUserId, { deletedAt: new Date() });

    await this.auditLog.log({
      userId: parentUserId,
      action: 'DELETE',
      entity: 'SubAgent',
      entityId: subUserId,
      description: `Removed sub-agent ${subUserId}`,
    });

    return { success: true };
  }
}
