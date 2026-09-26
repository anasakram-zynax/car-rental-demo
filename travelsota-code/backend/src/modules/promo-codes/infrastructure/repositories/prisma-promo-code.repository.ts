import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  IPromoCodeRepository,
  type PromoCodeListFilters,
  type PromoCodeWithCounts,
  type PaginatedPromoCodes,
  type CreatePromoCodeInput,
  type UpdatePromoCodeInput,
  type PromoStatsSummary,
  type PromoRedemptionRecord,
  type PromoAuditLogRecord,
} from '../../application/ports/promo-code.repository.port';
import { PromoCodeStatus } from '../../domain/enums';

function toPromoCodeWithCounts(raw: any): PromoCodeWithCounts {
  const { _count, ...rest } = raw;
  return {
    ...rest,
    _count: { redemptions: _count?.redemptions ?? 0 },
  } as PromoCodeWithCounts;
}

@Injectable()
export class PrismaPromoCodeRepository implements IPromoCodeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PromoCodeWithCounts | null> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { id, deletedAt: null },
      include: { _count: { select: { redemptions: true } } },
    });
    return promo ? toPromoCodeWithCounts(promo) : null;
  }

  async findByCode(code: string): Promise<PromoCodeWithCounts | null> {
    const normalizedCode = code.trim().toUpperCase();
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode, deletedAt: null },
      include: { _count: { select: { redemptions: true } } },
    });
    return promo ? toPromoCodeWithCounts(promo) : null;
  }

  async findMany(filters: PromoCodeListFilters): Promise<PaginatedPromoCodes> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };

    if (filters.status) where.status = filters.status;
    if (filters.code) where.code = { contains: filters.code.toUpperCase() };
    if (filters.productType) where.productTypes = { has: filters.productType };
    if (filters.customerType) where.customerType = filters.customerType;
    if (filters.createdById) where.createdById = filters.createdById;
    if (filters.startsAt || filters.endsAt) {
      where.AND = [];
      if (filters.startsAt) (where.AND as unknown[]).push({ startsAt: { gte: filters.startsAt } });
      if (filters.endsAt) (where.AND as unknown[]).push({ endsAt: { lte: filters.endsAt } });
    }

    const [data, total] = await Promise.all([
      this.prisma.promoCode.findMany({
        where,
        include: { _count: { select: { redemptions: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.promoCode.count({ where }),
    ]);

    return {
      data: data.map(toPromoCodeWithCounts),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(input: CreatePromoCodeInput & { createdById?: string }): Promise<PromoCodeWithCounts> {
    const promo = await this.prisma.promoCode.create({
      data: {
        code: input.code.toUpperCase(),
        name: input.name,
        description: input.description,
        discountType: input.discountType as 'PERCENTAGE' | 'FIXED',
        discountValueMinor: input.discountValueMinor,
        discountPercentBps: input.discountPercentBps,
        maxDiscountMinor: input.maxDiscountMinor,
        minBookingAmountMinor: input.minBookingAmountMinor,
        currency: input.currency,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone ?? 'UTC',
        totalUsageLimit: input.totalUsageLimit,
        perUserLimit: input.perUserLimit ?? 1,
        firstBookingOnly: input.firstBookingOnly ?? false,
        customerType: (input.customerType as 'ALL' | 'CUSTOMER' | 'AGENT') ?? 'ALL',
        productTypes: input.productTypes ?? ['flights', 'hotels'],
        eligibleRoutes: input.eligibleRoutes ?? [],
        eligibleAirlines: input.eligibleAirlines ?? [],
        eligibleCabins: input.eligibleCabins ?? [],
        eligibleHotelIds: input.eligibleHotelIds ?? [],
        eligibleDestinations: input.eligibleDestinations ?? [],
        excludedProviders: input.excludedProviders ?? [],
        isPublic: input.isPublic ?? true,
        createdById: input.createdById,
      },
      include: { _count: { select: { redemptions: true } } },
    });

    return toPromoCodeWithCounts(promo);
  }

  async update(id: string, input: UpdatePromoCodeInput): Promise<PromoCodeWithCounts> {
    const data: Record<string, unknown> = { updatedById: input.updatedById };

    if (input.code !== undefined) data.code = input.code.toUpperCase();
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.discountType !== undefined) data.discountType = input.discountType;
    if (input.discountValueMinor !== undefined) data.discountValueMinor = input.discountValueMinor;
    if (input.discountPercentBps !== undefined) data.discountPercentBps = input.discountPercentBps;
    if (input.maxDiscountMinor !== undefined) data.maxDiscountMinor = input.maxDiscountMinor;
    if (input.minBookingAmountMinor !== undefined) data.minBookingAmountMinor = input.minBookingAmountMinor;
    if (input.currency !== undefined) data.currency = input.currency;
    if (input.startsAt !== undefined) data.startsAt = input.startsAt;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt;
    if (input.timezone !== undefined) data.timezone = input.timezone;
    if (input.totalUsageLimit !== undefined) data.totalUsageLimit = input.totalUsageLimit;
    if (input.perUserLimit !== undefined) data.perUserLimit = input.perUserLimit;
    if (input.firstBookingOnly !== undefined) data.firstBookingOnly = input.firstBookingOnly;
    if (input.customerType !== undefined) data.customerType = input.customerType;
    if (input.productTypes !== undefined) data.productTypes = input.productTypes;
    if (input.eligibleRoutes !== undefined) data.eligibleRoutes = input.eligibleRoutes;
    if (input.eligibleAirlines !== undefined) data.eligibleAirlines = input.eligibleAirlines;
    if (input.eligibleCabins !== undefined) data.eligibleCabins = input.eligibleCabins;
    if (input.eligibleHotelIds !== undefined) data.eligibleHotelIds = input.eligibleHotelIds;
    if (input.eligibleDestinations !== undefined) data.eligibleDestinations = input.eligibleDestinations;
    if (input.excludedProviders !== undefined) data.excludedProviders = input.excludedProviders;
    if (input.isPublic !== undefined) data.isPublic = input.isPublic;

    data.version = { increment: 1 };

    const promo = await this.prisma.promoCode.update({
      where: { id },
      data,
      include: { _count: { select: { redemptions: true } } },
    });

    return toPromoCodeWithCounts(promo);
  }

  async updateStatus(id: string, status: PromoCodeStatus): Promise<PromoCodeWithCounts> {
    const promo = await this.prisma.promoCode.update({
      where: { id },
      data: { status, version: { increment: 1 } },
      include: { _count: { select: { redemptions: true } } },
    });

    return toPromoCodeWithCounts(promo);
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.promoCode.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async countActiveRedemptions(promoCodeId: string): Promise<number> {
    return this.prisma.promoRedemption.count({
      where: { promoCodeId, status: { in: ['RESERVED', 'REDEEMED'] } },
    });
  }

  async countUserRedemptions(promoCodeId: string, userId: string): Promise<number> {
    return this.prisma.promoRedemption.count({
      where: { promoCodeId, userId, status: { in: ['RESERVED', 'REDEEMED'] } },
    });
  }

  async hasUserCompletedBooking(userId: string): Promise<boolean> {
    const count = await this.prisma.flightBooking.count({
      where: { userId, status: { in: ['booked', 'ticketed', 'held'] } },
    });
    if (count > 0) return true;

    const hotelCount = await this.prisma.hotelBooking.count({
      where: { userId, status: { in: ['booked'] } },
    });
    return hotelCount > 0;
  }

  async incrementUsageCount(_promoCodeId: string): Promise<void> {
    // Usage is tracked via PromoRedemption records (counted on-demand).
    // No denormalized counter to maintain.
  }

  async addUsedBy(_promoCodeId: string, _userId: string): Promise<void> {
    // Usage is tracked via PromoRedemption records.
    // No denormalized usedBy list to maintain.
  }

  async removeUsedBy(_promoCodeId: string, _userId: string): Promise<void> {
    // Usage is tracked via PromoRedemption records.
    // Void/refund on the redemption record is the source of truth.
  }

  async getStats(): Promise<PromoStatsSummary> {
    // DB-side aggregation — the previous version loaded every REDEEMED row
    // and summed in JS.
    const [totalCodes, activeCodes, sums, userGroups] = await Promise.all([
      this.prisma.promoCode.count({ where: { deletedAt: null } }),
      this.prisma.promoCode.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      this.prisma.promoRedemption.groupBy({
        by: ['currency'],
        where: { status: 'REDEEMED' },
        _sum: { discountMinor: true },
        _count: { id: true },
      }),
      this.prisma.promoRedemption.groupBy({
        by: ['userId'],
        where: { status: 'REDEEMED', userId: { not: null } },
        _count: { id: true },
      }),
    ]);

    // Raw minors grouped by currency — the admin service converts the groups
    // into one reporting currency (summing raw minors across currencies
    // would add cents to fils).
    const byCurrency = sums.map((r) => ({
      currency: (r.currency ?? 'USD').toUpperCase(),
      minor: r._sum.discountMinor ?? 0,
    }));
    const totalRedemptions = sums.reduce((s, r) => s + r._count.id, 0);
    const totalDiscountMinor = byCurrency.reduce((s, r) => s + r.minor, 0);
    const uniqueUsers = userGroups.length;

    return {
      totalCodes,
      activeCodes,
      totalRedemptions,
      totalDiscountMinor,
      totalDiscountCurrency: byCurrency.length === 1 ? byCurrency[0].currency : 'MIXED',
      byCurrency,
      uniqueUsers,
    };
  }

  async getRedemptions(promoCodeId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.promoRedemption.findMany({
        where: { promoCodeId },
        select: {
          id: true,
          promoCodeId: true,
          userId: true,
          bookingId: true,
          bookingType: true,
          status: true,
          discountMinor: true,
          currency: true,
          bookingSubtotalMinor: true,
          createdAt: true,
          redeemedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.promoRedemption.count({ where: { promoCodeId } }),
    ]);

    return {
      data: data as PromoRedemptionRecord[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAuditLogs(promoCodeId: string): Promise<PromoAuditLogRecord[]> {
    return this.prisma.promoAuditLog.findMany({
      where: { promoCodeId },
      orderBy: { createdAt: 'desc' },
    }) as Promise<PromoAuditLogRecord[]>;
  }

  async createAuditLog(
    promoCodeId: string,
    actorId: string | null,
    action: string,
    beforeJson?: unknown,
    afterJson?: unknown,
  ): Promise<void> {
    await this.prisma.promoAuditLog.create({
      data: {
        promoCodeId,
        actorId,
        action,
        beforeJson: beforeJson ? JSON.parse(JSON.stringify(beforeJson)) : undefined,
        afterJson: afterJson ? JSON.parse(JSON.stringify(afterJson)) : undefined,
      },
    });
  }
}
