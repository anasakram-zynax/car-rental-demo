import { apiRequest } from '@/lib/api/client';
import type { CombinedHotelSearchResponse } from '@/lib/schema/hotel';

export interface HotelOccupancyInput {
  rooms: number;
  adults: number;
  children: number;
  childAges?: number[];
}

export interface HotelGeolocationInput {
  latitude: number;
  longitude: number;
  radius: number;
}

export interface HotelSearchInput {
  checkIn: string;
  checkOut: string;
  occupancies?: HotelOccupancyInput[];
  hotelCodes?: Array<number | string>;
  destinationCode?: string;
  destinationName?: string;
  hotelName?: string;
  nationality?: string;
  geolocation?: HotelGeolocationInput;
  minRate?: number;
  maxRate?: number;
  minCategory?: number;
  maxCategory?: number;
  paymentType?: 'any' | 'AT_WEB' | 'AT_HOTEL' | 'BOTH';
  maxRatesPerRoom?: number;
  packaging?: boolean;
  hotelPackage?: 'YES' | 'NO' | 'BOTH';
  rooms?: Array<{
    adults: number;
    children: number;
    childAges?: number[];
  }>;
  /** Display currency code (e.g. 'KWD', 'EUR') — triggers backend pricing block */
  currency?: string;
  page?: number;
  pageSize?: number;
  filters?: {
    priceMin?: number;
    priceMax?: number;
    starRating?: number[];
    amenities?: string[];
    freeCancellation?: boolean;
    suppliers?: string[];
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export async function searchHotels(
  input: HotelSearchInput,
): Promise<CombinedHotelSearchResponse> {
  return apiRequest<CombinedHotelSearchResponse>('/hotels/search', {
    method: 'POST',
    body: input,
  });
}
