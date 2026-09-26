/**
 * Build the backend filter/sort payload from frontend FlightFilters.
 *
 * Maps frontend checkbox bucket keys (e.g. "$0–$200", "0", "1", "Economy")
 * to backend DTO fields (priceRanges, stops, cabinClasses, etc.).
 */
import type { FlightFilters } from '@/lib/filters/types';

// ── Price bucket → numeric range ────────────────────────────────
const FLIGHT_PRICE_BUCKETS: Record<string, { min: number; max: number }> = {
  '$0–$200': { min: 0, max: 200 },
  '$200–$500': { min: 200, max: 500 },
  '$500–$1000': { min: 500, max: 1000 },
  '$1000–$2000': { min: 1000, max: 2000 },
  '$2000+': { min: 2000, max: Number.MAX_SAFE_INTEGER },
};

export interface FlightFilterPayload {
  filters?: {
    priceMin?: number;
    priceMax?: number;
    priceRanges?: Array<{ min: number; max: number }>;
    airlines?: string[];
    stops?: string[];
    departureTimes?: string[];
    arrivalTimes?: string[];
    cabinClasses?: string[];
    refundable?: boolean;
    freeCancellation?: boolean;
    suppliers?: string[];
    flightNumber?: string;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

/**
 * Convert frontend FlightFilters → backend filter payload.
 * When multiple non-contiguous price buckets are selected, sends them
 * as a priceRanges array so the backend applies OR logic.
 */
export function buildFlightFilterPayload(
  filters: FlightFilters,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
): FlightFilterPayload {
  const payload: FlightFilterPayload = {};

  // ── Filters ──────────────────────────────────────────────────
  const f: NonNullable<FlightFilterPayload['filters']> = {};

  // Price — send individual bucket ranges for non-contiguous OR matching
  if (filters.priceRanges.length > 0) {
    const ranges: Array<{ min: number; max: number }> = [];
    for (const key of filters.priceRanges) {
      const bucket = FLIGHT_PRICE_BUCKETS[key];
      if (bucket) {
        ranges.push({ min: bucket.min, max: bucket.max });
      }
    }
    if (ranges.length > 0) {
      f.priceRanges = ranges;
    }
  } else if (filters.priceMin !== undefined || filters.priceMax !== undefined) {
    if (filters.priceMin !== undefined) f.priceMin = filters.priceMin;
    if (filters.priceMax !== undefined) f.priceMax = filters.priceMax;
  }

  // Airlines
  if (filters.airlines.length > 0) {
    f.airlines = filters.airlines;
  }

  // Stops
  if (filters.stops !== null) {
    f.stops = [filters.stops];
  }

  // Departure times
  if (filters.departureTimes.length > 0) {
    f.departureTimes = filters.departureTimes;
  }

  // Arrival times
  if (filters.arrivalTimes.length > 0) {
    f.arrivalTimes = filters.arrivalTimes;
  }

  // Cabin classes
  if (filters.cabinClasses.length > 0) {
    f.cabinClasses = filters.cabinClasses;
  }

  // Refundable
  if (filters.refundable) {
    f.refundable = true;
  }

  // Free cancellation
  if (filters.freeCancellation) {
    f.freeCancellation = true;
  }

  // Supplier filters
  if (filters.supplierFilters.length > 0) {
    f.suppliers = filters.supplierFilters;
  }

  // Flight number
  if (filters.flightNumber) {
    f.flightNumber = filters.flightNumber;
  }

  if (Object.keys(f).length > 0) {
    payload.filters = f;
  }

  // ── Sort ─────────────────────────────────────────────────────
  if (sortBy) {
    payload.sort = {
      field: sortBy,
      order: sortOrder ?? 'asc',
    };
  }

  return payload;
}
