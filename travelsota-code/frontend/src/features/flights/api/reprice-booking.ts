import { apiRequest } from '@/lib/api/client';

export interface RepriceProductSelection {
  offeringId: string;
  productIds: string[];
}

export interface RepriceInput {
  offerId: string;
  searchKey?: string;
  catalogUuid?: string;
  productSelections?: RepriceProductSelection[];
  from?: string;
  to?: string;
  departureDate?: string;
  currency?: string;
  totalPrice?: number;
  tripType?: 'one_way' | 'round_trip';
}

export interface RepriceResponse {
  offerId: string;
  amount: number;
  currency: string;
  displayPrice: number;
  /** Raw supplier base + applied markup in display currency (admin/agent) */
  supplierBase?: number;
  markupAmount?: number;
  catalogUuid?: string;
  productSelections?: RepriceProductSelection[];
  offeringIdentifierValue?: string;
  offeringIdentifierAuthority?: string;
  freshRepriceAvailable: boolean;
  priceChanged: boolean;
  /** QA R4: what checkout actually charges (native supplier currency) */
  chargeAmount: number;
  chargeCurrency: string;
}

export function repriceBooking(input: RepriceInput) {
  return apiRequest<RepriceResponse>('/flights/bookings/reprice', {
    method: 'POST',
    body: input,
    // No auth: true — the backend accepts optional user for public detail pages.
    // Sending auth triggers a refresh cascade for guests that shows "Session expired".
  });
}
