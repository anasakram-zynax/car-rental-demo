import { PromoRedemptionStatus } from '../../domain/enums/promo-redemption-status.enum';

export interface ReserveRedemptionInput {
  promoCodeId: string;
  userId?: string;
  guestEmailHash?: string;
  bookingId?: string;
  bookingType?: string;
  discountMinor: number;
  currency: string;
  bookingSubtotalMinor: number;
  idempotencyKey: string;
  ttlMinutes?: number;
}

export interface IPromoRedemptionRepository {
  reserve(input: ReserveRedemptionInput): Promise<{ id: string; expiresAt: Date }>;
  findByBookingId(bookingId: string): Promise<{ id: string; promoCodeId: string; status: PromoRedemptionStatus; discountMinor: number; currency: string } | null>;
  findByIdempotencyKey(key: string): Promise<{ id: string; status: PromoRedemptionStatus; promoCodeId: string } | null>;
  redeemByBookingId(bookingId: string): Promise<boolean>;
  releaseById(id: string): Promise<boolean>;
  voidById(id: string): Promise<boolean>;
  refundById(id: string): Promise<boolean>;
  expireStaleReservations(): Promise<number>;
  countActiveRedemptions(promoCodeId: string): Promise<number>;
  countUserRedemptions(promoCodeId: string, userId: string): Promise<number>;
}

export const PromoRedemptionRepositoryToken = Symbol('PromoRedemptionRepository');
