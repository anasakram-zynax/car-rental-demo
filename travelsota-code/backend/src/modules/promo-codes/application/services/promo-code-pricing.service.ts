import { Injectable } from '@nestjs/common';
import type { PromoCodeWithCounts } from '../ports';

export interface DiscountCalculationInput {
  promoCode: PromoCodeWithCounts;
  bookingSubtotalMinor: number;
  currency: string;
}

export interface DiscountCalculationResult {
  discountMinor: number;
  finalAmountMinor: number;
  currency: string;
}

@Injectable()
export class PromoCodePricingService {
  calculate(input: DiscountCalculationInput): DiscountCalculationResult {
    const { promoCode, bookingSubtotalMinor, currency } = input;

    let discountMinor = 0;

    if (promoCode.discountType === 'FIXED') {
      discountMinor = promoCode.discountValueMinor;
    } else if (promoCode.discountType === 'PERCENTAGE' && promoCode.discountPercentBps) {
      discountMinor = Math.round((bookingSubtotalMinor * promoCode.discountPercentBps) / 10000);

      if (promoCode.maxDiscountMinor && discountMinor > promoCode.maxDiscountMinor) {
        discountMinor = promoCode.maxDiscountMinor;
      }
    }

    if (discountMinor > bookingSubtotalMinor) {
      discountMinor = bookingSubtotalMinor;
    }

    const finalAmountMinor = Math.max(0, bookingSubtotalMinor - discountMinor);

    return {
      discountMinor,
      finalAmountMinor,
      currency,
    };
  }
}
