import { adminRequest } from '@/lib/api/admin-client';

export interface ManualFlight {
  id: string;
  airlineId: string | null;
  airlineName: string | null;
  flightNumber: string | null;
  originId: string;
  originCity: string | null;
  destinationId: string;
  destinationCity: string | null;
  departureDate: string;
  departureTime: string;
  arrivalDate: string | null;
  arrivalTime: string;
  duration: string | null;
  status: string;
  featured: boolean;
  flightOrder: number;
  basePrice: number;
  currency: string;
  childPricePercent: number;
  infantPricePercent: number;
  availableSeats: number;
  totalSeats: number;
  refundable: boolean;
  cabinClass: string;
  hasWifi: boolean;
  hasMeal: boolean;
  hasEntertainment: boolean;
  hasPowerOutlet: boolean;
  checkedBaggage: string | null;
  cabinBaggage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualFlightListResponse {
  items: ManualFlight[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AirportRef {
  iataCode: string;
  name: string;
  cityName: string;
  countryCode: string;
}

export interface AirlineRef {
  iataCode: string;
  name: string;
}

export interface CreateManualFlightInput {
  originId: string; originCity?: string;
  destinationId: string; destinationCity?: string;
  departureDate: string; departureTime: string;
  arrivalDate?: string; arrivalTime: string;
  duration?: string;
  airlineId?: string; airlineName?: string; flightNumber?: string;
  basePrice: number; currency?: string;
  childPricePercent?: number; infantPricePercent?: number;
  availableSeats?: number; totalSeats?: number;
  refundable?: boolean; cabinClass?: string;
  hasWifi?: boolean; hasMeal?: boolean; hasEntertainment?: boolean; hasPowerOutlet?: boolean;
  checkedBaggage?: string; cabinBaggage?: string;
  featured?: boolean; flightOrder?: number; status?: string;
}

export interface UpdateManualFlightInput extends Partial<CreateManualFlightInput> {}

export function listManualFlights(page = 1, pageSize = 20, search?: string) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search?.trim()) params.set('search', search.trim());
  return adminRequest<ManualFlightListResponse>(`/admin/flights/manual?${params}`);
}

export function getManualFlight(id: string) {
  return adminRequest<ManualFlight>(`/admin/flights/manual/${id}`);
}

export function createManualFlight(input: CreateManualFlightInput) {
  return adminRequest<ManualFlight>('/admin/flights/manual', { method: 'POST', body: input });
}

export function updateManualFlight(id: string, input: UpdateManualFlightInput) {
  return adminRequest<ManualFlight>(`/admin/flights/manual/${id}`, { method: 'PATCH', body: input });
}

export function deleteManualFlight(id: string) {
  return adminRequest<ManualFlight>(`/admin/flights/manual/${id}`, { method: 'DELETE' });
}

export function searchAirports(q: string) {
  return adminRequest<AirportRef[]>(`/admin/flights/manual/airports/search?q=${encodeURIComponent(q)}`);
}

export function searchAirlines(q: string) {
  return adminRequest<AirlineRef[]>(`/admin/flights/manual/airlines/search?q=${encodeURIComponent(q)}`);
}
