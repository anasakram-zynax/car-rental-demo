import { Injectable } from '@nestjs/common';
import type { NormalizedFlightOffer } from '../../domain/entities/flight-search-response';
import type { FlightFilterDto, FlightSortDto } from '../../api/dto/flight-search.dto';

export interface FlightFilterResult {
  filtered: NormalizedFlightOffer[];
  originalTotal: number;
  filteredTotal: number;
  facets: FlightFacets;
  appliedFilters: Record<string, unknown>;
}

export interface FlightFacets {
  airlines: Array<{ key: string; count: number }>;
  stops: Array<{ key: string; count: number }>;
  priceRange: { min: number; max: number };
  cabinClasses: Array<{ key: string; count: number }>;
  departureTimes: Array<{ key: string; count: number }>;
  suppliers: Array<{ key: string; count: number }>;
}

@Injectable()
export class FlightSearchFilterService {
  applyFilters(
    offers: NormalizedFlightOffer[],
    filters?: FlightFilterDto,
    sort?: FlightSortDto,
  ): FlightFilterResult {
    const originalTotal = offers.length;
    const appliedFilters: Record<string, unknown> = {};

    // ── 1. Apply filters ────────────────────────────────────────
    let result = [...offers];

    if (filters) {
      // Price range — support both single range and bucket arrays
      if (filters.priceRanges && filters.priceRanges.length > 0) {
        // Non-contiguous bucket selection: offer matches if it falls in ANY of the selected ranges
        result = result.filter((o) =>
          filters.priceRanges!.some(
            (r) => o.price.total >= r.min && o.price.total <= r.max,
          ),
        );
        appliedFilters.priceRanges = filters.priceRanges;
      } else {
        if (filters.priceMin !== undefined) {
          result = result.filter((o) => o.price.total >= filters.priceMin!);
          appliedFilters.priceMin = filters.priceMin;
        }
        if (filters.priceMax !== undefined) {
          result = result.filter((o) => o.price.total <= filters.priceMax!);
          appliedFilters.priceMax = filters.priceMax;
        }
      }

      // Airlines — use display.airlineName / display.airlineCode (not brand.name, which is fare brand for Amadeus)
      if (filters.airlines && filters.airlines.length > 0) {
        const set = new Set(filters.airlines.map((a) => a.toLowerCase()));
        result = result.filter((o) => {
          const airline =
            o.display?.airlineName?.toLowerCase() ??
            o.display?.airlineCode?.toLowerCase() ??
            o.brand?.name?.toLowerCase();
          return airline ? set.has(airline) : false;
        });
        appliedFilters.airlines = filters.airlines;
      }

      // Stops — "2+" must match >= 2, not exact equality
      if (filters.stops && filters.stops.length > 0) {
        const needsTwoOrMore = filters.stops.some((s) => this.parseStops(s) === 2);
        const exactStops = new Set(
          filters.stops.map((s) => this.parseStops(s)).filter((s) => s < 2),
        );
        result = result.filter((o) => {
          if (exactStops.has(o.stops)) return true;
          if (needsTwoOrMore && o.stops >= 2) return true;
          return false;
        });
        appliedFilters.stops = filters.stops;
      }

      // Departure times (early_morning, morning, afternoon, evening)
      if (filters.departureTimes && filters.departureTimes.length > 0) {
        const buckets = new Set(filters.departureTimes);
        result = result.filter((o) => {
          const dep = o.segments?.[0]?.departure;
          if (!dep?.date || !dep?.time) return false;
          const hour = this.getHourFromDateTime(dep.date, dep.time);
          const bucket = this.timeBucket(hour);
          return buckets.has(bucket);
        });
        appliedFilters.departureTimes = filters.departureTimes;
      }

      // Arrival times
      if (filters.arrivalTimes && filters.arrivalTimes.length > 0) {
        const buckets = new Set(filters.arrivalTimes);
        result = result.filter((o) => {
          const last = o.segments?.[o.segments.length - 1]?.arrival;
          if (!last?.date || !last?.time) return false;
          const hour = this.getHourFromDateTime(last.date, last.time);
          const bucket = this.timeBucket(hour);
          return buckets.has(bucket);
        });
        appliedFilters.arrivalTimes = filters.arrivalTimes;
      }

      // Cabin classes
      if (filters.cabinClasses && filters.cabinClasses.length > 0) {
        const cabinSet = new Set(filters.cabinClasses.map((c) => c.toLowerCase()));
        result = result.filter((o) =>
          o.cabin ? cabinSet.has(o.cabin.toLowerCase()) : false,
        );
        appliedFilters.cabinClasses = filters.cabinClasses;
      }

      // Suppliers
      if (filters.suppliers && filters.suppliers.length > 0) {
        const supplierSet = new Set(filters.suppliers.map((s) => s.toLowerCase()));
        result = result.filter((o) =>
          o.provider ? supplierSet.has(o.provider.toLowerCase()) : false,
        );
        appliedFilters.suppliers = filters.suppliers;
      }

      // Refundable — use capabilities.cancellation as the data field
      if (filters.refundable) {
        result = result.filter((o) => o.capabilities?.cancellation === true);
        appliedFilters.refundable = true;
      }

      // Free cancellation — check capabilities first, then display refundPolicy
      if (filters.freeCancellation) {
        result = result.filter((o) => {
          const refund = o.display?.refundPolicy;
          return (
            o.capabilities?.freeCancellation === true ||
            refund?.free === true ||
            (refund?.allowed === true && Number(refund?.penaltyAmount) === 0)
          );
        });
        appliedFilters.freeCancellation = true;
      }

      // Flight number — normalized matching across segments
      if (filters.flightNumber) {
        const normalized = filters.flightNumber.replace(/[\s-]/g, '').toUpperCase();
        result = result.filter((o) =>
          o.segments?.some((seg) => {
            const fn = (seg.flightNumber ?? seg.display?.flightNumber ?? '').replace(/[\s-]/g, '').toUpperCase();
            const carrier = (seg.carrier ?? seg.display?.airlineCode ?? '').toUpperCase();
            const combined = `${carrier}${fn}`.replace(/[\s-]/g, '');
            return fn === normalized || combined === normalized;
          }),
        );
        appliedFilters.flightNumber = filters.flightNumber;
      }
    }

    // ── 2. Apply sort ───────────────────────────────────────────
    if (sort?.field) {
      result = this.applySort(result, sort.field, sort.order ?? 'asc');
    }

    // ── 3. Build facets from the ORIGINAL (unfiltered) set ──────
    const facets = this.buildFacets(offers);

    return {
      filtered: result,
      originalTotal,
      filteredTotal: result.length,
      facets,
      appliedFilters,
    };
  }

  private applySort(
    offers: NormalizedFlightOffer[],
    field: string,
    order: 'asc' | 'desc',
  ): NormalizedFlightOffer[] {
    const sorted = [...offers];
    const dir = order === 'desc' ? -1 : 1;

    sorted.sort((a, b) => {
      switch (field) {
        case 'price':
          return dir * (a.price.total - b.price.total);
        case 'duration': {
          const aDur = this.totalDurationMinutes(a);
          const bDur = this.totalDurationMinutes(b);
          return dir * (aDur - bDur);
        }
        case 'departure': {
          const aDep = this.combinedDateTime(a.segments?.[0]?.departure);
          const bDep = this.combinedDateTime(b.segments?.[0]?.departure);
          return dir * aDep.localeCompare(bDep);
        }
        case 'arrival': {
          const aArr = this.combinedDateTime(a.segments?.[a.segments.length - 1]?.arrival);
          const bArr = this.combinedDateTime(b.segments?.[b.segments.length - 1]?.arrival);
          return dir * aArr.localeCompare(bArr);
        }
        case 'airline':
          return dir * (a.brand?.name ?? '').localeCompare(b.brand?.name ?? '');
        default:
          return 0;
      }
    });

    return sorted;
  }

  private buildFacets(offers: NormalizedFlightOffer[]): FlightFacets {
    const airlineCounts = new Map<string, number>();
    const stopsCounts = new Map<string, number>();
    const cabinCounts = new Map<string, number>();
    const depTimeCounts = new Map<string, number>();
    const supplierCounts = new Map<string, number>();
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const o of offers) {
      // Price
      if (o.price.total < minPrice) minPrice = o.price.total;
      if (o.price.total > maxPrice) maxPrice = o.price.total;

      // Airline — use display.airlineName first, then brand.name as fallback
      const airlineName =
        o.display?.airlineName ??
        o.display?.airlineCode ??
        o.brand?.name;
      if (airlineName) {
        airlineCounts.set(
          airlineName,
          (airlineCounts.get(airlineName) ?? 0) + 1,
        );
      }

      // Stops
      const key = o.stops === 0 ? '0' : o.stops === 1 ? '1' : '2+';
      stopsCounts.set(key, (stopsCounts.get(key) ?? 0) + 1);

      // Cabin
      if (o.cabin) {
        cabinCounts.set(o.cabin, (cabinCounts.get(o.cabin) ?? 0) + 1);
      }

      // Departure time bucket
      const dep = o.segments?.[0]?.departure;
      if (dep?.date && dep?.time) {
        const hour = this.getHourFromDateTime(dep.date, dep.time);
        const bucket = this.timeBucket(hour);
        depTimeCounts.set(bucket, (depTimeCounts.get(bucket) ?? 0) + 1);
      }

      // Supplier
      if (o.provider) {
        supplierCounts.set(o.provider, (supplierCounts.get(o.provider) ?? 0) + 1);
      }
    }

    return {
      airlines: this.mapToFacetArray(airlineCounts),
      stops: this.mapToFacetArray(stopsCounts),
      priceRange: {
        min: minPrice === Infinity ? 0 : minPrice,
        max: maxPrice === -Infinity ? 0 : maxPrice,
      },
      cabinClasses: this.mapToFacetArray(cabinCounts),
      departureTimes: this.mapToFacetArray(depTimeCounts),
      suppliers: this.mapToFacetArray(supplierCounts),
    };
  }

  private combinedDateTime(
    dt?: { date?: string; time?: string },
  ): string {
    if (!dt?.date || !dt?.time) return '';
    return `${dt.date}T${dt.time}`;
  }

  private getHourFromDateTime(date: string, time: string): number {
    try {
      const d = new Date(`${date}T${time}`);
      return isNaN(d.getHours()) ? 0 : d.getHours();
    } catch {
      return 0;
    }
  }

  private timeBucket(hour: number): string {
    if (hour >= 0 && hour < 6) return 'early_morning';
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }

  private parseStops(s: string): number {
    if (s === '0' || s === 'nonstop' || s === 'non_stop') return 0;
    if (s === '1' || s === 'one_stop' || s === '1_stop') return 1;
    return 2; // 2+
  }

  private totalDurationMinutes(o: NormalizedFlightOffer): number {
    // Try segment-based calculation first
    const segs = o.segments ?? [];
    if (segs.length >= 2) {
      const firstDep = segs[0].departure;
      const lastArr = segs[segs.length - 1].arrival;
      if (firstDep?.date && firstDep?.time && lastArr?.date && lastArr?.time) {
        const first = new Date(`${firstDep.date}T${firstDep.time}`).getTime();
        const last = new Date(`${lastArr.date}T${lastArr.time}`).getTime();
        const mins = Math.round((last - first) / 60000);
        if (mins > 0) return mins;
      }
    }
    // Fallback: parse the totalDuration string (e.g. "6:30", "PT6H30M", "6h 30m")
    if (o.totalDuration) {
      return this.parseDurationString(o.totalDuration);
    }
    // Single segment: departure → arrival
    if (segs.length === 1) {
      const dep = segs[0].departure;
      const arr = segs[0].arrival;
      if (dep?.date && dep?.time && arr?.date && arr?.time) {
        const first = new Date(`${dep.date}T${dep.time}`).getTime();
        const last = new Date(`${arr.date}T${arr.time}`).getTime();
        return Math.round((last - first) / 60000);
      }
    }
    return 0;
  }

  private parseDurationString(dur: string): number {
    // ISO 8601: PT6H30M, PT1H15M
    const isoMatch = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (isoMatch) {
      const hours = parseInt(isoMatch[1] ?? '0', 10);
      const mins = parseInt(isoMatch[2] ?? '0', 10);
      return hours * 60 + mins;
    }
    // Simple: "6:30", "1:45"
    const colonMatch = dur.match(/^(\d+):(\d{2})$/);
    if (colonMatch) {
      return parseInt(colonMatch[1], 10) * 60 + parseInt(colonMatch[2], 10);
    }
    // Text: "6h 30m", "1h 15m"
    const textMatch = dur.match(/(\d+)h\s*(\d+)?m?/i);
    if (textMatch) {
      return parseInt(textMatch[1], 10) * 60 + parseInt(textMatch[2] ?? '0', 10);
    }
    return 0;
  }

  private mapToFacetArray(m: Map<string, number>): Array<{ key: string; count: number }> {
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }
}
