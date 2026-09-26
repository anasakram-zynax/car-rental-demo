import type { FlightOfferView } from '@/lib/schema/flight';
import type { FlightFilters, FilterOption } from './types';

export type { FlightFilters, FlightFilters as FlightFilterState } from './types';

// ── Price range helpers ─────────────────────────────────────────

/** Canonical price buckets, denominated in USD. Compared in the active
 *  display currency (bounds converted via PriceSpace) — never raw. */
const FLIGHT_PRICE_BUCKETS_USD: { key: string; min: number; max: number | null }[] = [
  { key: '0-200', min: 0, max: 200 },
  { key: '200-500', min: 200, max: 500 },
  { key: '500-1000', min: 500, max: 1000 },
  { key: '1000-2000', min: 1000, max: 2000 },
  { key: '2000+', min: 2000, max: null },
];

/** Display-currency context for price filtering. Omit for legacy USD-only
 *  behavior (kept for backward-compatible callers/tests). */
export interface PriceSpace {
  /** Convert any amount+currency into the active display currency. */
  toSelected: (amount: number, currency: string) => number;
  /** Label a display-currency range (max null = open-ended). */
  formatRange: (min: number, max: number | null) => string;
}

const FLIGHT_PRICE_BUCKETS: { key: string; label: string; test: (v: number) => boolean }[] =
  FLIGHT_PRICE_BUCKETS_USD.map((b, i) => ({
    key: b.key,
    label:
      b.max == null
        ? `$${b.min.toLocaleString()}+`
        : `$${b.min.toLocaleString()} \u2013 $${b.max.toLocaleString()}`,
    test: (v) => (i === 0 ? v >= b.min : v > b.min) && (b.max == null || v <= b.max),
  }));

export const FLIGHT_TIME_BUCKETS: { key: string; label: string; test: (h: number) => boolean }[] = [
  { key: 'early_morning', label: 'Early morning (00:00\u201306:00)', test: (h) => h >= 0 && h < 6 },
  { key: 'morning', label: 'Morning (06:00\u201312:00)', test: (h) => h >= 6 && h < 12 },
  { key: 'afternoon', label: 'Afternoon (12:00\u201318:00)', test: (h) => h >= 12 && h < 18 },
  { key: 'evening', label: 'Evening (18:00\u201323:59)', test: (h) => h >= 18 && h <= 23 },
];

export function getOfferDisplayPrice(offer: FlightOfferView): number {
  return offer.pricing?.displayPrice?.amount ?? offer.price?.total ?? 0;
}

/** Display amount WITH its currency (backend display block or raw supplier). */
export function getOfferDisplayMoney(offer: FlightOfferView): { amount: number; currency: string } {
  return (
    offer.pricing?.displayPrice ?? {
      amount: offer.price?.total ?? 0,
      currency: offer.price?.currency ?? 'USD',
    }
  );
}

/** Offer price normalized into the active display currency. */
function priceInSelected(
  offer: FlightOfferView,
  space?: Pick<PriceSpace, 'toSelected'>,
): number {
  const m = getOfferDisplayMoney(offer);
  return space ? space.toSelected(m.amount, m.currency) : m.amount;
}

/** Bucket bounds normalized into the active display currency. */
function bucketInSelected(
  b: { min: number; max: number | null },
  space?: Pick<PriceSpace, 'toSelected'>,
): { min: number; max: number | null } {
  if (!space) return { min: b.min, max: b.max };
  return {
    min: space.toSelected(b.min, 'USD'),
    max: b.max == null ? null : space.toSelected(b.max, 'USD'),
  };
}

function inBucket(
  price: number,
  bound: { min: number; max: number | null },
  first: boolean,
): boolean {
  return (first ? price >= bound.min : price > bound.min) && (bound.max == null || price <= bound.max);
}

const STOP_OPTIONS: { key: string; label: string }[] = [
  { key: '0', label: 'Non-stop' },
  { key: '1', label: '1 stop' },
  { key: '2+', label: '2+ stops' },
];

// ── Get hour from ISO string ────────────────────────────────────

function getHour(isoString: string): number {
  try {
    return new Date(isoString).getHours();
  } catch {
    return -1;
  }
}

// ── Compute dynamic filter options from results ────────────────

export function computeFlightFilterOptions(offers: FlightOfferView[], space?: PriceSpace): {
  airlines: FilterOption[];
  priceRanges: FilterOption[];
  stops: FilterOption[];
  departureTimes: FilterOption[];
  cabinClasses: FilterOption[];
} {
  // Airline counts — count unique offers per airline (not multiple segments in the same offer)
  const airlineMap = new Map<string, { count: number; label: string }>();
  for (const offer of offers) {
    const seenOfferAirlines = new Set<string>();
    for (const seg of offer.segments) {
      const code = seg.marketingCarrier;
      if (!code || seenOfferAirlines.has(code)) continue;
      seenOfferAirlines.add(code);
      const existing = airlineMap.get(code);
      const name = seg.display?.airlineName ?? offer.display?.airlineName ?? code;
      if (existing) {
        existing.count++;
      } else {
        airlineMap.set(code, { count: 1, label: name });
      }
    }
  }
  const airlines = Array.from(airlineMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([code, { count, label }]) => ({ label, count, key: code }));

  // Price range counts — compared in the active display currency with
  // labels formatted for it (previously hardcoded USD on both).
  const priceRanges = FLIGHT_PRICE_BUCKETS_USD.map((b, i) => {
    const bound = bucketInSelected(b, space);
    return {
      label: space ? space.formatRange(bound.min, bound.max) : FLIGHT_PRICE_BUCKETS[i].label,
      count: offers.filter((o) => inBucket(priceInSelected(o, space), bound, i === 0)).length,
      key: b.key,
    };
  });

  // Stop counts
  const stops = STOP_OPTIONS.map((opt) => {
    let count = 0;
    for (const offer of offers) {
      // Use backend-provided stops, or calculate from journeys if available
      let s: number;
      if (typeof offer.stops === 'number') {
        s = offer.stops;
      } else if (offer.display?.journeys?.length) {
        // Calculate stops per journey and sum
        s = offer.display.journeys.reduce((sum, j) => sum + Math.max(0, j.segmentCount - 1), 0);
      } else {
        // Fallback: assume single journey
        s = Math.max(0, offer.segments.length - 1);
      }
      if (opt.key === '2+' && s >= 2) count++;
      else if (opt.key === String(s)) count++;
    }
    return { label: opt.label, count, key: opt.key };
  });

  // Departure time counts (first segment of each offer)
  const departureTimes = FLIGHT_TIME_BUCKETS.map((b) => ({
    label: b.label,
    count: offers.filter((o) => {
      const hour = getHour(o.segments[0]?.departureAt ?? '');
      return hour >= 0 && b.test(hour);
    }).length,
    key: b.key,
  }));

  // Cabin class counts
  const cabinMap = new Map<string, number>();
  for (const offer of offers) {
    const cabin = offer.cabin ?? 'Economy';
    cabinMap.set(cabin, (cabinMap.get(cabin) ?? 0) + 1);
  }
  const cabinClasses = Array.from(cabinMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  return { airlines, priceRanges, stops, departureTimes, cabinClasses };
}

// ── Apply filters to results ────────────────────────────────────

export function applyFlightFilters(
  offers: FlightOfferView[],
  filters: FlightFilters,
  space?: Pick<PriceSpace, 'toSelected'>,
): FlightOfferView[] {
  return offers.filter((offer) => {
    const price = priceInSelected(offer, space);

    // Price range filter (bucket presets)
    if (filters.priceRanges && filters.priceRanges.length > 0) {
      const inRange = filters.priceRanges.some((key) => {
        const idx = FLIGHT_PRICE_BUCKETS_USD.findIndex((b) => b.key === key);
        if (idx < 0) return false;
        return inBucket(price, bucketInSelected(FLIGHT_PRICE_BUCKETS_USD[idx], space), idx === 0);
      });
      if (!inRange) return false;
    }

    // Price slider (min/max) — bounds live in the active display currency
    // when a PriceSpace is provided (callers reset slider state on currency
    // switch), otherwise legacy raw comparison.
    if (!filters.priceRanges || filters.priceRanges.length === 0) {
      if (filters.priceMin != null && price < filters.priceMin) return false;
      if (filters.priceMax != null && price > filters.priceMax) return false;
    }

    // Airline filter
    if (filters.airlines && filters.airlines.length > 0) {
      const offerAirlines = new Set(offer.segments.map((s) => s.marketingCarrier).filter(Boolean));
      const matches = filters.airlines.some((a) => offerAirlines.has(a));
      if (!matches) return false;
    }

    // Stops filter
    if (filters.stops) {
      // Use backend-provided stops, or calculate from journeys if available
      let actualStops: number;
      if (typeof offer.stops === 'number') {
        actualStops = offer.stops;
      } else if (offer.display?.journeys?.length) {
        // Calculate stops per journey and sum
        actualStops = offer.display.journeys.reduce((sum, j) => sum + Math.max(0, j.segmentCount - 1), 0);
      } else {
        // Fallback: assume single journey
        actualStops = Math.max(0, offer.segments.length - 1);
      }
      if (filters.stops === '2+' && actualStops < 2) return false;
      if (filters.stops !== '2+' && actualStops !== Number(filters.stops)) return false;
    }

    // Departure time filter (first segment)
    if (filters.departureTimes && filters.departureTimes.length > 0) {
      const firstSeg = offer.segments[0];
      if (firstSeg) {
        const hour = getHour(firstSeg.departureAt);
        const inTime = filters.departureTimes.some((key) => {
          const bucket = FLIGHT_TIME_BUCKETS.find((b) => b.key === key);
          return bucket ? bucket.test(hour) : false;
        });
        if (!inTime) return false;
      }
    }

    // Cabin class filter
    if (filters.cabinClasses && filters.cabinClasses.length > 0) {
      const cabin = offer.cabin ?? 'Economy';
      if (!filters.cabinClasses.includes(cabin)) return false;
    }

    // Refundable filter
    if (filters.refundable && !offer.refundable) return false;

    // Free cancellation filter
    if (filters.freeCancellation && !offer.capabilities?.freeCancellation) return false;

    // Flight number filter — normalized matching
    if (filters.flightNumber) {
      const normalized = filters.flightNumber.replace(/[\s-]/g, '').toUpperCase();
      const matches = offer.segments.some((seg) => {
        const fn = seg.flightNumber ?? seg.display?.flightNumber ?? '';
        const carrier = seg.marketingCarrier ?? seg.display?.airlineCode ?? '';
        const combined = `${carrier}${fn}`.toUpperCase().replace(/[\s-]/g, '');
        return fn.toUpperCase().replace(/[\s-]/g, '') === normalized ||
               combined === normalized;
      });
      if (!matches) return false;
    }

    // Supplier filter — admin only
    if (filters.supplierFilters && filters.supplierFilters.length > 0) {
      const provider = (offer.provider ?? '').toLowerCase();
      if (!filters.supplierFilters.some((s) => s.toLowerCase() === provider)) return false;
    }

    return true;
  });
}
