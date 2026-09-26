import { apiRequest } from '@/lib/api/client';
import type { TravelerInput } from './preview-booking';

export interface BookingConfirmInput {
  bookingId: string;
  offerId: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{
    offeringId: string;
    productIds: string[];
  }>;
  seatProductIds?: string[];
  baggageProductIds?: string[];
  catalogUuid?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  from: string;
  to: string;
  departureDate: string;
  travelers: TravelerInput[];
}

export interface BookingConfirmResponse {
  bookingId: string;
  status: string;
  locatorCode?: string;
  workbenchId?: string;
  reservationId?: string;
}

export function confirmBooking(input: BookingConfirmInput) {
  return apiRequest<BookingConfirmResponse>('/flights/bookings/confirm', {
    method: 'POST',
    body: input,
    auth: true,
    timeoutMs: 60000,
  });
}
