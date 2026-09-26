import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PromoRedemptionRepositoryToken, type IPromoRedemptionRepository, type ReserveRedemptionInput } from '../ports/promo-redemption.repository.port';
import { PromoCodeRepositoryToken, type IPromoCodeRepository } from '../ports/promo-code.repository.port';
import { PromoRedemptionStatus } from '../../domain/enums';

@Injectable()
export class PromoCodeRedemptionService {
  private readonly logger = new Logger(PromoCodeRedemptionService.name);
  private readonly DEFAULT_TTL_MINUTES = 15;

  constructor(
    @Inject(PromoRedemptionRepositoryToken) private readonly redemptionRepo: IPromoRedemptionRepository,
    @Inject(PromoCodeRepositoryToken) private readonly promoCodeRepo: IPromoCodeRepository,
  ) {}

  async reserve(input: ReserveRedemptionInput): Promise<{ redemptionId: string; expiresAt: Date }> {
    const existing = await this.redemptionRepo.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      if (existing.status === PromoRedemptionStatus.RESERVED) {
        return { redemptionId: existing.id, expiresAt: new Date(Date.now() + this.DEFAULT_TTL_MINUTES * 60 * 1000) };
      }
      if (existing.status === PromoRedemptionStatus.REDEEMED) {
        throw new BusinessError('PROMO_CODE_INVALID', 'This promo code has already been applied to this booking.');
      }
    }

    const ttlMinutes = input.ttlMinutes ?? this.DEFAULT_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    const result = await this.redemptionRepo.reserve({
      ...input,
      ttlMinutes,
    });

    this.logger.log(`Promo reservation created: ${input.promoCodeId} for booking ${input.bookingId ?? 'unknown'}`);
    return { redemptionId: result.id, expiresAt };
  }

  async redeemByBookingId(bookingId: string): Promise<boolean> {
    const redemption = await this.redemptionRepo.findByBookingId(bookingId);
    if (!redemption || redemption.status !== PromoRedemptionStatus.RESERVED) {
      return false;
    }

    const success = await this.redemptionRepo.redeemByBookingId(bookingId);
    if (success) {
      this.logger.log(`Promo redeemed: ${redemption.promoCodeId} for booking ${bookingId}`);
    }
    return success;
  }

  async releaseByBookingId(bookingId: string): Promise<boolean> {
    const redemption = await this.redemptionRepo.findByBookingId(bookingId);
    if (!redemption || redemption.status !== PromoRedemptionStatus.RESERVED) {
      return false;
    }

    const success = await this.redemptionRepo.releaseById(redemption.id);
    if (success) {
      this.logger.log(`Promo released: ${redemption.promoCodeId} for booking ${bookingId}`);
    }
    return success;
  }

  async voidByBookingId(bookingId: string): Promise<boolean> {
    const redemption = await this.redemptionRepo.findByBookingId(bookingId);
    if (!redemption || redemption.status !== PromoRedemptionStatus.REDEEMED) {
      return false;
    }

    const success = await this.redemptionRepo.voidById(redemption.id);
    if (success) {
      this.logger.log(`Promo voided: ${redemption.promoCodeId} for booking ${bookingId}`);
    }
    return success;
  }

  async refundByBookingId(bookingId: string): Promise<boolean> {
    const redemption = await this.redemptionRepo.findByBookingId(bookingId);
    if (!redemption || redemption.status !== PromoRedemptionStatus.REDEEMED) {
      return false;
    }

    const success = await this.redemptionRepo.refundById(redemption.id);
    if (success) {
      this.logger.log(`Promo refunded: ${redemption.promoCodeId} for booking ${bookingId}`);
    }
    return success;
  }
}
