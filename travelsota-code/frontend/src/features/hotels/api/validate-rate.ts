import { apiRequest } from '@/lib/api/client';
import { ROUTES } from '@/lib/routes';

import type { AggregatedPolicy } from '@/lib/schema/hotel';

export interface ValidateRateInput {
  rateId: string;
  provider?: string;
  searchKey?: string;
  hotelGroupId?: string;
  providerHotelId?: string;
  checkIn?: string;
  checkOut?: string;
  occupancy?: Array<{ adults: number; children: number }>;
  displayCurrency?: string;
}

export interface ValidateRateResponse {
  rateId: string;
  supplierAmount: number;
  supplierCurrency: string;
  currency: string;
  displayAmount?: number;
  displayCurrency?: string;
  rooms: Array<{
    rates: Array<{
      net: number;
      adults: number;
      children: number;
      rateKey?: string;
      rateId?: string;
      cancellationPolicies?: Array<{
        amount?: string | number;
        from?: string;
        to?: string;
        deadline?: string;
        policyType?: string;
        percentage?: string | number;
        numberOfNights?: number;
      }>;
    }>;
  }>;
  prebookToken?: string;
  prebookExpiresAt?: string;
  aggregatedPolicy?: AggregatedPolicy;
}

/**
 * Validate/prebook a rate using the provider-neutral endpoint.
 * Routes to Hotelbeds check-rate or RateHawk prebook depending on provider.
 */
export async function validateRateApi(input: ValidateRateInput): Promise<ValidateRateResponse> {
  return apiRequest<ValidateRateResponse>(ROUTES.HOTELS.VALIDATE_RATE, {
    method: 'POST',
    body: input,
  });
}
