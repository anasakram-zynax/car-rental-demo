import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { IPromoRedemptionRepository, type ReserveRedemptionInput } from '../../application/ports/promo-redemption.repository.port';
import type { PromoRedemptionStatus } from '../../domain/enums';
import { BusinessError } from '../../../../shared/errors/business-error';

@Injectable()
export class PrismaPromoRedemptionRepository implements IPromoRedemptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(input: ReserveRedemptionInput) {
    return this.prisma.$transaction(
      async (tx) => {
        const promo = await tx.promoCode.findUnique({
          where: { id: input.promoCodeId },
          select: { totalUsageLimit: true, perUserLimit: true },
        });

        if (promo?.totalUsageLimit) {
          const activeCount = await tx.promoRedemption.count({
            where: { promoCodeId: input.promoCodeId, status: { in: ['RESERVED', 'REDEEMED'] } },
          });
          if (activeCount >= promo.totalUsageLimit) {
            throw new BusinessError('PROMO_CODE_USAGE_LIMIT_REACHED');
          }
        }

        if (input.userId && promo?.perUserLimit) {
          const userCount = await tx.promoRedemption.count({
            where: { promoCodeId: input.promoCodeId, userId: input.userId, status: { in: ['RESERVED', 'REDEEMED'] } },
          });
          if (userCount >= promo.perUserLimit) {
            throw new BusinessError('PROMO_CODE_PER_USER_LIMIT_REACHED');
          }
        }

        return tx.promoRedemption.create({
          data: {
            promoCodeId: input.promoCodeId,
            userId: input.userId,
            guestEmailHash: input.guestEmailHash,
            bookingId: input.bookingId,
            bookingType: input.bookingType,
            status: 'RESERVED',
            discountMinor: input.discountMinor,
            currency: input.currency,
            bookingSubtotalMinor: input.bookingSubtotalMinor,
            idempotencyKey: input.idempotencyKey,
            expiresAt: new Date(Date.now() + (input.ttlMinutes ?? 15) * 60 * 1000),
          },
          select: { id: true, expiresAt: true },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async findByBookingId(bookingId: string) {
    const row = await this.prisma.promoRedemption.findFirst({
      where: { bookingId },
      select: {
        id: true,
        promoCodeId: true,
        status: true,
        discountMinor: true,
        currency: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      promoCodeId: row.promoCodeId,
      status: row.status as PromoRedemptionStatus,
      discountMinor: row.discountMinor,
      currency: row.currency,
    };
  }

  async findByIdempotencyKey(key: string) {
    const row = await this.prisma.promoRedemption.findUnique({
      where: { idempotencyKey: key },
      select: { id: true, status: true, promoCodeId: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      status: row.status as PromoRedemptionStatus,
      promoCodeId: row.promoCodeId,
    };
  }

  async redeemByBookingId(bookingId: string): Promise<boolean> {
    const result = await this.prisma.promoRedemption.updateMany({
      where: { bookingId, status: 'RESERVED' },
      data: { status: 'REDEEMED' as PromoRedemptionStatus, redeemedAt: new Date() },
    });
    return result.count > 0;
  }

  async releaseById(id: string): Promise<boolean> {
    const result = await this.prisma.promoRedemption.updateMany({
      where: { id, status: 'RESERVED' },
      data: { status: 'RELEASED' as PromoRedemptionStatus, releasedAt: new Date() },
    });
    return result.count > 0;
  }

  async voidById(id: string): Promise<boolean> {
    const result = await this.prisma.promoRedemption.updateMany({
      where: { id, status: 'REDEEMED' },
      data: { status: 'VOIDED' as PromoRedemptionStatus, voidedAt: new Date() },
    });
    return result.count > 0;
  }

  async refundById(id: string): Promise<boolean> {
    const result = await this.prisma.promoRedemption.updateMany({
      where: { id, status: 'REDEEMED' },
      data: { status: 'REFUNDED' as PromoRedemptionStatus, voidedAt: new Date() },
    });
    return result.count > 0;
  }

  async expireStaleReservations(): Promise<number> {
    const result = await this.prisma.promoRedemption.updateMany({
      where: { status: 'RESERVED', expiresAt: { lt: new Date() } },
      data: { status: 'RELEASED' as PromoRedemptionStatus, releasedAt: new Date() },
    });
    return result.count;
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
}
