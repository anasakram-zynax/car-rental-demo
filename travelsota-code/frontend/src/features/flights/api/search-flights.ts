import { apiRequest } from '@/lib/api/client';
import type { FlightSearchView } from '@/lib/schema/flight';

export interface MultiCitySlice {
  origin: string;
  destination: string;
  departureDate: string;
}

export interface FlightSearchInput {
  from: string;
  to: string;
  departureDate: string;
  adults?: number;
  offersPerPage?: number;
  contentSourceList?: string[];
  accessGroup?: string;
  pcc?: string;
  gds?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  returnDate?: string;
  legs?: MultiCitySlice[];
  cabinClass?: 'Economy' | 'PremiumEconomy' | 'Business' | 'First' | 'PremiumFirst';
  page?: number;
  pageSize?: number;
  /** Display currency code (e.g. 'KWD', 'EUR') — triggers backend pricing block */
  currency?: string;
  filters?: {
    priceMin?: number;
    priceMax?: number;
    airlines?: string[];
    stops?: string[];
    departureTimes?: string[];
    arrivalTimes?: string[];
    cabinClasses?: string[];
    refundable?: boolean;
    suppliers?: string[];
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

export async function searchFlights(
  input: FlightSearchInput,
): Promise<FlightSearchView> {
  return apiRequest<FlightSearchView>('/flights/search', {
    method: 'POST',
    body: input,
  });
}
