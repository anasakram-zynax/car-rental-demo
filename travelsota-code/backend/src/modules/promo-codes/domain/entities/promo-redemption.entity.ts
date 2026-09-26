import { PromoRedemptionStatus } from '../enums/promo-redemption-status.enum';

export class PromoRedemptionEntity {
  id!: string;
  promoCodeId!: string;
  userId?: string | null;
  guestEmailHash?: string | null;
  bookingId?: string | null;
  bookingType?: string | null;
  paymentId?: string | null;
  status!: PromoRedemptionStatus;
  discountMinor!: number;
  currency!: string;
  bookingSubtotalMinor!: number;
  idempotencyKey!: string;
  expiresAt!: Date;
  createdAt!: Date;
  redeemedAt?: Date | null;
  releasedAt?: Date | null;
  voidedAt?: Date | null;

  constructor(props: PromoRedemptionEntity) {
    Object.assign(this, props);
  }

  isExpired(now: Date = new Date()): boolean {
    return this.status === PromoRedemptionStatus.RESERVED && now > this.expiresAt;
  }

  canBeRedeemed(): boolean {
    return this.status === PromoRedemptionStatus.RESERVED && !this.isExpired();
  }

  canBeReleased(): boolean {
    return this.status === PromoRedemptionStatus.RESERVED;
  }
}
