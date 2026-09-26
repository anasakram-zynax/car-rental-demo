import { apiRequest } from '@/lib/api/client';

export interface FlightBookingDetailsInput {
  offerId: string;
  searchKey?: string;
  offerData?: Record<string, unknown>;
  travelers?: Array<{
    givenName: string;
    surname: string;
    passengerTypeCode?: string;
    email?: string;
  }>;
}

export interface FlightBookingDetailsResponse {
  offerId: string;
  detailAvailable: boolean;
  offer?: Record<string, unknown>;
  pricing?: {
    baseAmount: number;
    markupAmount: number;
    totalAmount: number;
    currency: string;
  };
  travelers?: Array<unknown>;
  searchKey?: string | null;
  message?: string;
}

export function getFlightBookingDetails(
  input: FlightBookingDetailsInput,
): Promise<FlightBookingDetailsResponse> {
  return apiRequest<FlightBookingDetailsResponse>('/flights/bookings/details', {
    method: 'POST',
    body: input,
  });
}
