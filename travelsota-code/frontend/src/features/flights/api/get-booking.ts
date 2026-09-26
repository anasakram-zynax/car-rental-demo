import { apiRequest } from '@/lib/api/client';

export interface BookingDetailResponse {
  id: string;
  publicRef?: string | null;
  provider: string;
  status: 'previewed' | 'booking_in_progress' | 'booked' | 'failed' | string;
  /** Real Payment record status (PENDING/AUTHORIZED/PAID/REFUNDED/CANCELLED) — independent of `status` above. */
  paymentStatus?: string | null;
  amount: number | null;
  currency: string | null;
  locatorCode?: string;
  workbenchId?: string;
  reservationId?: string;
  message?: string;
  createdAt: string;
  updatedAt: string;
  offerSnapshot?: {
    offerId?: string;
    productId?: string;
    productIds?: string[];
    seatProductIds?: string[];
    baggageProductIds?: string[];
    catalogUuid?: string;
    tripType?: 'one_way' | 'round_trip';
    returnDate?: string;
    from?: string;
    to?: string;
    departureDate?: string;
  };
  travelerSnapshot?: Array<{
    givenName: string;
    surname: string;
    gender: string;
    birthDate: string;
    passengerTypeCode: string;
    phoneCountryCode: string;
    phoneNumber: string;
    email: string;
  }>;
  workflowSummary?: unknown;
}

export function getBooking(bookingId: string) {
  return apiRequest<BookingDetailResponse>(`/flights/bookings/${bookingId}`, {
    method: 'GET',
    auth: true,
  });
}
