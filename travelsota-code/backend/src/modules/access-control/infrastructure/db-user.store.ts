import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { UserStorePort, UserPageFilters } from '../application/ports/user-store.port';
import type { AgentProfileFilters } from '../application/ports/agent-profile-store.port';
import type { AgentProfileEntity } from '../domain/agent-profile.entity';
import type { UserEntity, UserWithRole, UserDetail, UserType } from '../domain/user.entity';

@Injectable()
export class DbUserStore implements UserStorePort {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toEntity(u));
  }

  async findStaff(): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      where: { userType: 'STAFF', deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toEntity(u));
  }

  async findByUserTypes(userTypes: UserType[]): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      where: { userType: { in: userTypes }, deletedAt: null },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toEntity(u));
  }

  async findPaged(filters: UserPageFilters): Promise<{ items: UserEntity[]; total: number }> {
    const where: any = { deletedAt: null };
    if (filters.userTypes?.length) where.userType = { in: filters.userTypes };
    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
      ];
    }
    const sortable = ['email', 'firstName', 'createdAt', 'lastLoginAt'];
    const sortBy = sortable.includes(filters.sortBy ?? '') ? filters.sortBy! : 'createdAt';
    const skip = (Math.max(1, filters.page) - 1) * filters.limit;
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortBy]: filters.sortDir === 'asc' ? 'asc' : 'desc' },
        skip,
        take: filters.limit,
        // Slim projection: toEntity ignores role, so no role join.
        select: {
          id: true, email: true, firstName: true, lastName: true, phone: true,
          userType: true, status: true, emailVerified: true, lastLoginAt: true,
          deletedAt: true, roleId: true, createdById: true,
          createdAt: true, updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map((u) => this.toEntity(u)), total };
  }

  async findAgents(
    filters?: AgentProfileFilters,
  ): Promise<(UserDetail & { agentProfile: AgentProfileEntity | null })[]> {
    // Single join query — replaces 1 + 2N round trips plus in-memory
    // filtering. kyc/search/date all resolve in the DB.
    const userWhere: any = { userType: 'AGENT', deletedAt: null };
    if (filters?.fromDate || filters?.toDate) {
      userWhere.createdAt = {};
      if (filters.fromDate) userWhere.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) userWhere.createdAt.lte = new Date(filters.toDate);
    }
    const profileWhere: any = {};
    if (filters?.kycStatus) profileWhere.kycStatus = filters.kycStatus;
    const ors: any[] = [];
    if (filters?.search) {
      const s = filters.search;
      ors.push(
        { email: { contains: s, mode: 'insensitive' } },
        { agentProfile: { companyName: { contains: s, mode: 'insensitive' } } },
        { agentProfile: { companyPhone: { contains: s, mode: 'insensitive' } } },
        { agentProfile: { taxId: { contains: s, mode: 'insensitive' } } },
      );
    }
    const rows = await this.prisma.user.findMany({
      where: {
        ...userWhere,
        ...(Object.keys(profileWhere).length ? { agentProfile: profileWhere } : {}),
        ...(ors.length ? { OR: ors } : {}),
      },
      include: { role: { select: { name: true } }, agentProfile: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return rows.map((u) => ({
      ...this.toDetail(u),
      agentProfile: u.agentProfile ? this.toAgentProfile(u.agentProfile) : null,
    }));
  }

  async findById(id: string): Promise<UserDetail | null> {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      include: { role: true },
    });
    if (!user) return null;
    return this.toDetail(user);
  }

  async findByEmail(email: string): Promise<UserWithRole | null> {
    const user = await this.prisma.user.findUnique({
      where: { email, deletedAt: null },
      include: { role: true },
    });
    if (!user) return null;
    return this.toWithRole(user);
  }

  async create(data: { email: string; passwordHash: string; firstName?: string; lastName?: string; phone?: string; userType?: UserType; status?: string; roleId?: string; createdById?: string }): Promise<UserDetail> {
    const user = await this.prisma.user.create({
      data: {
        ...data,
        status: (data.status as any) ?? 'ACTIVE',
        userType: (data.userType as any) ?? 'CUSTOMER',
      },
      include: { role: true },
    });
    return this.toDetail(user);
  }

  async update(id: string, data: { firstName?: string; lastName?: string; phone?: string; status?: string; userType?: UserType; roleId?: string; deletedAt?: Date | null }): Promise<UserDetail> {
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(data.status ? { status: data.status as any } : {}),
        ...(data.userType ? { userType: data.userType as any } : {}),
      },
      include: { role: true },
    });
    return this.toDetail(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } });
  }

  private toAgentProfile(p: any): AgentProfileEntity {
    // Mirrors DbAgentProfileStore.toEntity numeric conversions — the join
    // returns raw Decimals that must not leak to the API unconverted.
    return {
      ...p,
      creditLimit: Number(p.creditLimit),
      creditUsed: Number(p.creditUsed),
      commissionRate: Number(p.commissionRate),
      flightMarkup: Number(p.flightMarkup),
      hotelMarkup: Number(p.hotelMarkup),
      walletBalance: Number(p.walletBalance ?? 0),
      walletCurrency: p.walletCurrency ?? 'USD',
      maxCreditPerSub: Number(p.maxCreditPerSub ?? 0),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      approvedAt: p.approvedAt?.toISOString() ?? null,
    };
  }

  private toEntity(u: any): UserEntity {
    return {
      id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
      phone: u.phone, userType: u.userType as UserType, status: u.status as any,
      emailVerified: u.emailVerified, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      deletedAt: u.deletedAt?.toISOString() ?? null,
      roleId: u.roleId, createdById: u.createdById,
      createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString(),
    };
  }

  private toWithRole(u: any): UserWithRole {
    return { ...this.toEntity(u), roleName: u.role?.name ?? null };
  }

  private toDetail(u: any): UserDetail {
    return { ...this.toWithRole(u) };
  }
}
