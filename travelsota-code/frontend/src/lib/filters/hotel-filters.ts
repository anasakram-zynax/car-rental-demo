import type { CombinedHotelCard, HotelCancellationPolicy } from '@/lib/schema/hotel';
import type { HotelFilters, FilterOption } from './types';

// ── Cancellation helpers ─────────────────────────────────────────

/**
 * Format a supplier policy timestamp with proper timezone conversion to the
 * user's local time. Shows e.g. "Aug 17, 2026, 11:59 PM AST" — converted
 * from the supplier's deadline to the browser's local timezone.
 */
export function formatPolicyDate(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/** Raw supplier deadline (no tz conversion) — for admin panels. */
export function formatPolicyDateRaw(value?: string): string {
  if (!value) return "";
  const str = String(value).trim();
  const datePart = str.slice(0, 10);
  const timePart = str.slice(11, 16);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return str;
  const [y, m, d] = datePart.split("-").map(Number);
  return timePart ? `${m}/${d}/${y}, ${timePart}` : `${m}/${d}/${y}`;
}

/**
 * Check if a rate has free cancellation available.
 * For multi-tier policies (e.g. "free until date, then fee"), this returns
 * true when there's a zero-fee deadline in the future — meaning the guest
 * CAN cancel for free right now.
 */
export function isFreeCancellationRate(rate?: {
  refundable?: boolean;
  cancellationPolicies?: HotelCancellationPolicy[];
  cancellationPolicyText?: string;
}): boolean {
  if (rate?.refundable === true) return true;
  const policies = rate?.cancellationPolicies;
  if (policies?.length) {
    // All zero fees = fully free
    const allZero = policies.every((p) => {
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      return amount === 0 && percentage === 0 && nights === 0;
    });
    if (allZero) return true;

    // Multi-tier: check if any zero-fee deadline is in the future
    // OR a single policy with fee + deadline where deadline is in the future
    // (meaning: before the deadline, no fee applies = currently free)
    const now = Date.now();
    const hasFutureFreeDeadline = policies.some((p) => {
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      const isZeroFee = amount === 0 && percentage === 0 && nights === 0;
      if (!isZeroFee) return false;
      const deadline = p.from ?? p.deadline;
      if (!deadline) return true; // no deadline = always free
      const d = new Date(deadline);
      return Number.isFinite(d.getTime()) && d.getTime() > now;
    });
    if (hasFutureFreeDeadline) return true;

    // Single policy with fee + deadline where deadline is in the future
    if (policies.length === 1) {
      const p = policies[0];
      const amount = Number(p.amount ?? 0);
      const percentage = Number(p.percentage ?? 0);
      const nights = Number(p.numberOfNights ?? 0);
      const hasFee = amount > 0 || percentage > 0 || nights > 0;
      const deadline = p.from ?? p.deadline;
      if (hasFee && deadline) {
        const d = new Date(deadline);
        if (Number.isFinite(d.getTime()) && d.getTime() > now) return true;
      }
    }
  }
  // Legacy fallback: no structured policies — rely on the policy text.
  const text = (rate?.cancellationPolicyText ?? "").toLowerCase();
  return /free/i.test(text) && !/\d|fee|non/i.test(text.replace(/free/g, ""));
}

// ── Price range helpers ─────────────────────────────────────────

import type { PriceSpace } from './flight-filters';

/** Canonical price buckets, denominated in USD. Compared in the active
 *  display currency (bounds converted via PriceSpace) — never raw. */
const HOTEL_PRICE_BUCKETS_USD: { key: string; min: number; max: number | null }[] = [
  { key: '0-100', min: 0, max: 100 },
  { key: '100-200', min: 100, max: 200 },
  { key: '200-400', min: 200, max: 400 },
  { key: '400-800', min: 400, max: 800 },
  { key: '800+', min: 800, max: null },
];

const HOTEL_PRICE_BUCKETS: { key: string; label: string; test: (v: number) => boolean }[] =
  HOTEL_PRICE_BUCKETS_USD.map((b, i) => ({
    key: b.key,
    label:
      b.max == null
        ? `$${b.min.toLocaleString()}+`
        : `$${b.min.toLocaleString()} \u2013 $${b.max.toLocaleString()}`,
    test: (v) => (i === 0 ? v >= b.min : v > b.min) && (b.max == null || v <= b.max),
  }));

/** Hotel price normalized into the active display currency. */
function hotelPriceInSelected(
  hotel: CombinedHotelCard,
  space?: Pick<PriceSpace, 'toSelected'>,
): number {
  const dp = hotel.pricing?.displayPrice;
  const amount = dp?.amount ?? hotel.minPrice?.amount ?? 0;
  const currency = dp?.currency ?? hotel.minPrice?.currency ?? 'USD';
  return space ? space.toSelected(amount, currency) : amount;
}

function hotelBucketInSelected(
  b: { min: number; max: number | null },
  space?: Pick<PriceSpace, 'toSelected'>,
): { min: number; max: number | null } {
  if (!space) return { min: b.min, max: b.max };
  return {
    min: space.toSelected(b.min, 'USD'),
    max: b.max == null ? null : space.toSelected(b.max, 'USD'),
  };
}

function hotelInBucket(
  price: number,
  bound: { min: number; max: number | null },
  first: boolean,
): boolean {
  return (first ? price >= bound.min : price > bound.min) && (bound.max == null || price <= bound.max);
}

// ── Compute dynamic filter options from results ────────────────

export function computeHotelFilterOptions(hotels: CombinedHotelCard[], space?: PriceSpace): {
  priceRanges: FilterOption[];
  starRating: FilterOption[];
  amenities: FilterOption[];
} {
  // Price range counts — compared in the active display currency with
  // labels formatted for it (previously hardcoded USD on both, and tested
  // against the RAW supplier minPrice at that).
  const priceRanges = HOTEL_PRICE_BUCKETS_USD.map((b, i) => {
    const bound = hotelBucketInSelected(b, space);
    return {
      label: space ? space.formatRange(bound.min, bound.max) : HOTEL_PRICE_BUCKETS[i].label,
      count: hotels.filter((h) => hotelInBucket(hotelPriceInSelected(h, space), bound, i === 0)).length,
      key: b.key,
    };
  });

  // Star rating counts
  const starRating = [5, 4, 3, 2, 1].map((stars) => ({
    label: `${stars} stars`,
    count: hotels.filter((h) => Math.round(h.starRating ?? 0) === stars).length,
    key: `${stars}`,
  }));

  // Amenities (top 10)
  const amenityMap = new Map<string, number>();
  for (const hotel of hotels) {
    for (const amenity of hotel.amenities ?? []) {
      amenityMap.set(amenity, (amenityMap.get(amenity) ?? 0) + 1);
    }
  }
  const amenities = Array.from(amenityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({ label, count }));

  return { priceRanges, starRating, amenities };
}

// ── Apply filters to results ────────────────────────────────────

export function applyHotelFilters(
  hotels: CombinedHotelCard[],
  filters: HotelFilters,
  space?: Pick<PriceSpace, 'toSelected'>,
): CombinedHotelCard[] {
  return hotels.filter((hotel) => {
    const price = hotelPriceInSelected(hotel, space);

    // Hotel name filter — case-insensitive substring match
    if (filters.hotelName) {
      const query = filters.hotelName.toLowerCase().trim();
      const name = (hotel.displayName ?? '').toLowerCase();
      if (!name.includes(query)) return false;
    }

    // Price range filter (bucket presets)
    if (filters.priceRanges.length > 0) {
      const inRange = filters.priceRanges.some((key) => {
        const idx = HOTEL_PRICE_BUCKETS_USD.findIndex((b) => b.key === key);
        if (idx < 0) return false;
        return hotelInBucket(price, hotelBucketInSelected(HOTEL_PRICE_BUCKETS_USD[idx], space), idx === 0);
      });
      if (!inRange) return false;
    }

    // Price slider (min/max) — bounds live in the active display currency
    // when a PriceSpace is provided, otherwise legacy raw comparison.
    if (filters.priceRanges.length === 0) {
      if (filters.priceMin != null && price < filters.priceMin) return false;
      if (filters.priceMax != null && price > filters.priceMax) return false;
    }

    // Star rating filter
    if (filters.starRating.length > 0) {
      const rounded = Math.round(hotel.starRating ?? 0);
      if (!filters.starRating.includes(rounded)) return false;
    }

    // Amenities filter
    if (filters.amenities.length > 0) {
      const hotelAmenities = new Set((hotel.amenities ?? []).map((a) => a.toLowerCase()));
      const matches = filters.amenities.some((a) => hotelAmenities.has(a.toLowerCase()));
      if (!matches) return false;
    }

    // Free cancellation filter — match when ANY provider's cheapest rate
    // is free-cancellation (refundable flag or zero-amount policies).
    if (filters.freeCancellation) {
      const hasFree = (hotel.providers ?? []).some((p) =>
        isFreeCancellationRate(p.minRate),
      );
      if (!hasFree) return false;
    }

    // Supplier filter — admin only
    if (filters.supplierFilters.length > 0) {
      const hotelSuppliers = (hotel.providers ?? []).map((p) => p.provider?.toLowerCase());
      const matches = filters.supplierFilters.some((s) => hotelSuppliers.includes(s.toLowerCase()));
      if (!matches) return false;
    }

    return true;
  });
}
