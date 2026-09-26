/**
 * Build the backend filter/sort payload from frontend HotelFilters.
 *
 * Maps frontend checkbox bucket keys to backend DTO fields.
 */
import type { HotelFilters } from '@/lib/filters/types';

// ── Price bucket → numeric range ────────────────────────────────
const HOTEL_PRICE_BUCKETS: Record<string, { min: number; max: number }> = {
  '$0–$100': { min: 0, max: 100 },
  '$100–$200': { min: 100, max: 200 },
  '$200–$400': { min: 200, max: 400 },
  '$400–$800': { min: 400, max: 800 },
  '$800+': { min: 800, max: Number.MAX_SAFE_INTEGER },
};

export interface HotelFilterPayload {
  filters?: {
    priceMin?: number;
    priceMax?: number;
    priceRanges?: Array<{ min: number; max: number }>;
    starRating?: number[];
    amenities?: string[];
    freeCancellation?: boolean;
    suppliers?: string[];
    hotelName?: string;
  };
  sort?: {
    field: string;
    order: 'asc' | 'desc';
  };
}

/**
 * Convert frontend HotelFilters → backend filter payload.
 * When multiple non-contiguous price buckets are selected, sends them
 * as a priceRanges array so the backend applies OR logic.
 */
export function buildHotelFilterPayload(
  filters: HotelFilters,
  sortBy?: string,
  sortOrder?: 'asc' | 'desc',
): HotelFilterPayload {
  const payload: HotelFilterPayload = {};

  // ── Filters ──────────────────────────────────────────────────
  const f: NonNullable<HotelFilterPayload['filters']> = {};

  // Price — send individual bucket ranges for non-contiguous OR matching
  if (filters.priceRanges.length > 0) {
    const ranges: Array<{ min: number; max: number }> = [];
    for (const key of filters.priceRanges) {
      const bucket = HOTEL_PRICE_BUCKETS[key];
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

  // Star rating
  if (filters.starRating.length > 0) {
    f.starRating = filters.starRating;
  }

  // Amenities
  if (filters.amenities.length > 0) {
    f.amenities = filters.amenities;
  }

  // Free cancellation
  if (filters.freeCancellation) {
    f.freeCancellation = true;
  }

  // Supplier filters
  if (filters.supplierFilters.length > 0) {
    f.suppliers = filters.supplierFilters;
  }

  // Hotel name
  if (filters.hotelName && filters.hotelName.trim().length > 0) {
    f.hotelName = filters.hotelName.trim();
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
