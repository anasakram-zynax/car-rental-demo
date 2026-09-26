import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { DemoVerification, Prisma } from '../../../generated';

@Injectable()
export class PrismaDemoLeadsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createVerification(data: {
    requestId: string;
    token: string;
    email: string;
    expiresAt: Date;
  }): Promise<DemoVerification> {
    return this.prisma.demoVerification.create({ data });
  }

  async findVerificationByToken(token: string) {
    return this.prisma.demoVerification.findUnique({ where: { token } });
  }

  async findVerificationByRequestId(requestId: string) {
    return this.prisma.demoVerification.findUnique({ where: { requestId } });
  }

  async consumeVerification(token: string) {
    return this.prisma.demoVerification.update({
      where: { token },
      data: { consumed: true },
    });
  }

  async createLead(data: {
    requestId: string;
    email: string;
    name?: string;
    companyName?: string;
    whatsappNumber?: string;
    emailStatus: string;
    ipAddress?: string;
  }) {
    return this.prisma.demoLead.create({
      data: {
        ...data,
        submittedAt: new Date(),
      },
    });
  }

  async findLeadByRequestId(requestId: string) {
    return this.prisma.demoLead.findUnique({ where: { requestId } });
  }

  async findLeadByEmail(email: string) {
    return this.prisma.demoLead.findFirst({
      where: { email: email.trim().toLowerCase() },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Fill in optional contact fields on an existing lead (identify-later flow). */
  async updateLeadContact(
    id: string,
    data: { name?: string; companyName?: string; whatsappNumber?: string },
  ) {
    const patch: Record<string, string> = {};
    if (data.name) patch.name = data.name;
    if (data.companyName) patch.companyName = data.companyName;
    if (data.whatsappNumber) patch.whatsappNumber = data.whatsappNumber;
    if (Object.keys(patch).length === 0) {
      return this.prisma.demoLead.findUnique({ where: { id } });
    }
    return this.prisma.demoLead.update({ where: { id }, data: patch });
  }

  async updateEmailStatus(id: string, emailStatus: string) {
    return this.prisma.demoLead.update({
      where: { id },
      data: { emailStatus },
    });
  }

  async findLeads(params: {
    page: number;
    pageSize: number;
    search?: string;
    emailStatus?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const { page, pageSize, search, emailStatus, sortBy, sortOrder } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DemoLeadWhereInput = {};

    if (emailStatus) {
      where.emailStatus = emailStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.DemoLeadOrderByWithRelationInput = {};
    const field = sortBy ?? 'createdAt';
    const dir = sortOrder ?? 'desc';

    if (field === 'email') orderBy.email = dir;
    else if (field === 'name') orderBy.name = dir;
    else if (field === 'companyName') orderBy.companyName = dir;
    else if (field === 'emailStatus') orderBy.emailStatus = dir;
    else orderBy.createdAt = dir;

    const [items, total] = await Promise.all([
      this.prisma.demoLead.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.demoLead.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.demoLead.deleteMany({
      where: { id: { in: ids } },
    });
    return result.count;
  }

  async updateManyStatus(ids: string[], emailStatus: string): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await this.prisma.demoLead.updateMany({
      where: { id: { in: ids } },
      data: { emailStatus },
    });
    return result.count;
  }

  async findAllLeadsForExport(params: {
    emailStatus?: string;
    search?: string;
  }) {
    const where: Prisma.DemoLeadWhereInput = {};

    if (params.emailStatus) {
      where.emailStatus = params.emailStatus;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
        { companyName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.demoLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
  }

  /** Latest persisted demo credentials (regenerated each reset) */
  async getCurrentCredentials() {
    return this.prisma.demoCredential.findFirst({
      orderBy: { updatedAt: 'desc' },
    });
  }
}
