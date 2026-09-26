import { apiRequest } from '@/lib/api/client';

export interface TravelerInput {
  givenName: string;
  surname: string;
  gender: 'Male' | 'Female';
  birthDate: string;
  passengerTypeCode: 'ADT';
  phoneCountryCode: string;
  phoneNumber: string;
  email: string;
}

export interface BookingPreviewInput {
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
  offeringIdentifierValue?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  legs?: Array<{ origin: string; destination: string; departureDate: string }>;
  from: string;
  to: string;
  departureDate: string;
  searchKey?: string;
  sessionKey?: string;
  travelers: TravelerInput[];
}

export interface BookingPreviewResponse {
  bookingId: string;
  status: 'previewed';
  next: 'confirm';
}

export function previewBooking(input: BookingPreviewInput) {
  return apiRequest<BookingPreviewResponse>('/flights/bookings/preview', {
    method: 'POST',
    body: input,
    auth: true,
  });
}
