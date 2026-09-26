import { apiRequest } from '@/lib/api/client';

export interface HotelBookingDetailsInput {
  rateId: string;
  searchKey?: string;
  provider?: string;
  hotelId?: string;
  providerHotelId?: string;
  hotelGroupId?: string;
  checkIn?: string;
  checkOut?: string;
  occupancy?: Array<{
    adults: number;
    children?: number;
    childAges?: number[];
  }>;
  guests?: Array<{
    roomId: string;
    type: string;
    name: string;
    surname: string;
  }>;
}

export interface HotelBookingDetailsResponse {
  rateId: string;
  provider: string;
  hotel: {
    hotelId: string;
    name: string;
    images: string[];
    amenities: string[];
    description: string | null;
    address: string | null;
    checkIn: string | null;
    checkOut: string | null;
  } | null;
  matchedRate: Record<string, unknown> | null;
  allRates: Array<Record<string, unknown>>;
  occupancy?: Array<{ adults: number; children?: number; childAges?: number[] }> | null;
  guests?: Array<{ roomId: string; type: string; name: string; surname: string }> | null;
  checkIn?: string | null;
  checkOut?: string | null;
  error?: string;
}

export function getHotelBookingDetails(
  input: HotelBookingDetailsInput,
): Promise<HotelBookingDetailsResponse> {
  return apiRequest<HotelBookingDetailsResponse>('/hotels/bookings/details', {
    method: 'POST',
    body: input,
  });
}
