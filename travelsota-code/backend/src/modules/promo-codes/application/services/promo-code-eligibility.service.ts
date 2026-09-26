import { Inject, Injectable, Logger } from '@nestjs/common';
import { PromoCodeRepositoryToken, type IPromoCodeRepository, type PromoCodeWithCounts } from '../ports/promo-code.repository.port';
import { PromoCodeStatus, PromoCustomerType } from '../../domain/enums';

export interface EligibilityCheckInput {
  promoCode: PromoCodeWithCounts;
  userId?: string;
  userType?: string;
  productType: string;
  currency: string;
  bookingSubtotalMinor: number;
  routeCode?: string;
  airlineCode?: string;
  cabinClass?: string;
  hotelId?: string;
  destinationCode?: string;
  providerKey?: string;
}

export interface EligibilityResult {
  eligible: boolean;
  reason?: string;
}

@Injectable()
export class PromoCodeEligibilityService {
  private readonly logger = new Logger(PromoCodeEligibilityService.name);

  constructor(@Inject(PromoCodeRepositoryToken) private readonly promoCodeRepo: IPromoCodeRepository) {}

  async check(input: EligibilityCheckInput): Promise<EligibilityResult> {
    const { promoCode } = input;

    if (promoCode.status !== PromoCodeStatus.ACTIVE) {
      return { eligible: false, reason: 'PROMO_CODE_INACTIVE' };
    }

    const now = new Date();
    if (promoCode.startsAt && now < promoCode.startsAt) {
      return { eligible: false, reason: 'PROMO_CODE_EXPIRED' };
    }
    if (promoCode.endsAt && now > promoCode.endsAt) {
      return { eligible: false, reason: 'PROMO_CODE_EXPIRED' };
    }

    if (promoCode.currency && promoCode.currency.toUpperCase() !== input.currency.toUpperCase()) {
      return { eligible: false, reason: 'PROMO_CODE_CURRENCY_MISMATCH' };
    }

    const productMatch = promoCode.productTypes.includes('all') ||
      promoCode.productTypes.includes(input.productType.toLowerCase());
    if (!productMatch) {
      return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
    }

    if (promoCode.minBookingAmountMinor && input.bookingSubtotalMinor < promoCode.minBookingAmountMinor) {
      return { eligible: false, reason: 'PROMO_CODE_MIN_AMOUNT_NOT_MET' };
    }

    if (promoCode.customerType !== PromoCustomerType.ALL) {
      if (!input.userType) {
        return { eligible: false, reason: 'PROMO_CODE_INVALID' };
      }
      if (promoCode.customerType === PromoCustomerType.CUSTOMER && input.userType !== 'CUSTOMER') {
        return { eligible: false, reason: 'PROMO_CODE_INVALID' };
      }
      if (promoCode.customerType === PromoCustomerType.AGENT && input.userType !== 'AGENT') {
        return { eligible: false, reason: 'PROMO_CODE_INVALID' };
      }
    }

    if (promoCode.totalUsageLimit) {
      const activeCount = await this.promoCodeRepo.countActiveRedemptions(promoCode.id);
      if (activeCount >= promoCode.totalUsageLimit) {
        return { eligible: false, reason: 'PROMO_CODE_USAGE_LIMIT_REACHED' };
      }
    }

    if (promoCode.perUserLimit && input.userId) {
      const userCount = await this.promoCodeRepo.countUserRedemptions(promoCode.id, input.userId);
      if (userCount >= promoCode.perUserLimit) {
        return { eligible: false, reason: 'PROMO_CODE_PER_USER_LIMIT_REACHED' };
      }
    }

    if (promoCode.firstBookingOnly && input.userId) {
      const hasBookings = await this.promoCodeRepo.hasUserCompletedBooking(input.userId);
      if (hasBookings) {
        return { eligible: false, reason: 'PROMO_CODE_FIRST_BOOKING_ONLY' };
      }
    }

    if (promoCode.eligibleRoutes.length > 0) {
      if (!input.routeCode) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
      if (!promoCode.eligibleRoutes.includes(input.routeCode.toUpperCase())) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    if (promoCode.eligibleAirlines.length > 0) {
      if (!input.airlineCode) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
      if (!promoCode.eligibleAirlines.includes(input.airlineCode.toUpperCase())) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    if (promoCode.eligibleCabins.length > 0) {
      if (!input.cabinClass) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
      if (!promoCode.eligibleCabins.includes(input.cabinClass.toLowerCase())) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    if (promoCode.eligibleHotelIds.length > 0) {
      if (!input.hotelId) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
      if (!promoCode.eligibleHotelIds.includes(input.hotelId)) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    if (promoCode.eligibleDestinations.length > 0) {
      if (!input.destinationCode) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
      if (!promoCode.eligibleDestinations.includes(input.destinationCode.toUpperCase())) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    if (promoCode.excludedProviders.length > 0 && input.providerKey) {
      if (promoCode.excludedProviders.includes(input.providerKey)) {
        return { eligible: false, reason: 'PROMO_CODE_PRODUCT_NOT_ELIGIBLE' };
      }
    }

    return { eligible: true };
  }
}
