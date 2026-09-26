import { Injectable } from '@nestjs/common';
import type { CombinedHotelCard } from '../../domain/types/hotel-provider.types';
import type { HotelFilterDto, HotelSortDto } from '../../api/dto/hotel-search.dto';

export interface HotelFilterResult {
  filtered: CombinedHotelCard[];
  originalTotal: number;
  filteredTotal: number;
  facets: HotelFacets;
  appliedFilters: Record<string, unknown>;
}

export interface HotelFacets {
  starRatings: Array<{ key: number; count: number }>;
  priceRange: { min: number; max: number };
  amenities: Array<{ key: string; count: number }>;
  suppliers: Array<{ key: string; count: number }>;
}

@Injectable()
export class HotelSearchFilterService {
  applyFilters(
    hotels: CombinedHotelCard[],
    filters?: HotelFilterDto,
    sort?: HotelSortDto,
  ): HotelFilterResult {
    const originalTotal = hotels.length;
    const appliedFilters: Record<string, unknown> = {};

    // ── 1. Apply filters ────────────────────────────────────────
    let result = [...hotels];

    if (filters) {
      // Price range — support both single range and bucket arrays
      if (filters.priceRanges && filters.priceRanges.length > 0) {
        result = result.filter((h) => {
          const price = h.minPrice?.amount ?? 0;
          return filters.priceRanges!.some(
            (r) => price >= r.min && price <= r.max,
          );
        });
        appliedFilters.priceRanges = filters.priceRanges;
      } else {
        if (filters.priceMin !== undefined) {
          result = result.filter((h) => (h.minPrice?.amount ?? 0) >= filters.priceMin!);
          appliedFilters.priceMin = filters.priceMin;
        }
        if (filters.priceMax !== undefined) {
          result = result.filter((h) => (h.minPrice?.amount ?? 0) <= filters.priceMax!);
          appliedFilters.priceMax = filters.priceMax;
        }
      }

      // Star rating
      if (filters.starRating && filters.starRating.length > 0) {
        const starSet = new Set(filters.starRating);
        result = result.filter((h) => h.starRating !== undefined && starSet.has(h.starRating));
        appliedFilters.starRating = filters.starRating;
      }

      // Amenities
      if (filters.amenities && filters.amenities.length > 0) {
        const amenitySet = new Set(filters.amenities.map((a) => a.toLowerCase()));
        result = result.filter((h) => {
          if (!h.amenities || h.amenities.length === 0) return false;
          return h.amenities.some((a) => amenitySet.has(a.toLowerCase()));
        });
        appliedFilters.amenities = filters.amenities;
      }

      // Free cancellation
      if (filters.freeCancellation) {
        result = result.filter((h) => {
          return h.providers.some((p) => {
            const board = (p.minRate?.boardName ?? '').toLowerCase();
            return board.includes('free cancel') || board.includes('flexible');
          });
        });
        appliedFilters.freeCancellation = true;
      }

      // Suppliers
      if (filters.suppliers && filters.suppliers.length > 0) {
        const supplierSet = new Set(filters.suppliers.map((s) => s.toLowerCase()));
        result = result.filter((h) =>
          h.providers.some((p) => supplierSet.has(p.provider.toLowerCase())),
        );
        appliedFilters.suppliers = filters.suppliers;
      }

      // Hotel name — case-insensitive substring match on displayName
      if (filters.hotelName && filters.hotelName.trim().length > 0) {
        const needle = filters.hotelName.trim().toLowerCase();
        result = result.filter((h) =>
          h.displayName?.toLowerCase().includes(needle) ?? false,
        );
        appliedFilters.hotelName = filters.hotelName;
      }
    }

    // ── 2. Apply sort ───────────────────────────────────────────
    if (sort?.field) {
      result = this.applySort(result, sort.field, sort.order ?? 'asc');
    }

    // ── 3. Build facets from the ORIGINAL (unfiltered) set ──────
    const facets = this.buildFacets(hotels);

    return {
      filtered: result,
      originalTotal,
      filteredTotal: result.length,
      facets,
      appliedFilters,
    };
  }

  private applySort(
    hotels: CombinedHotelCard[],
    field: string,
    order: 'asc' | 'desc',
  ): CombinedHotelCard[] {
    const sorted = [...hotels];
    const dir = order === 'desc' ? -1 : 1;

    sorted.sort((a, b) => {
      switch (field) {
        case 'price':
          return dir * ((a.minPrice?.amount ?? 0) - (b.minPrice?.amount ?? 0));
        case 'rating':
          return dir * ((a.starRating ?? 0) - (b.starRating ?? 0));
        case 'name':
          return dir * (a.displayName ?? '').localeCompare(b.displayName ?? '');
        case 'distance':
          return 0; // No distance data available in CombinedHotelCard
        default:
          return 0;
      }
    });

    return sorted;
  }

  private buildFacets(hotels: CombinedHotelCard[]): HotelFacets {
    const starCounts = new Map<number, number>();
    const amenityCounts = new Map<string, number>();
    const supplierCounts = new Map<string, number>();
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const h of hotels) {
      // Price
      if (h.minPrice?.amount !== undefined) {
        if (h.minPrice.amount < minPrice) minPrice = h.minPrice.amount;
        if (h.minPrice.amount > maxPrice) maxPrice = h.minPrice.amount;
      }

      // Star rating
      if (h.starRating !== undefined) {
        starCounts.set(h.starRating, (starCounts.get(h.starRating) ?? 0) + 1);
      }

      // Amenities
      if (h.amenities) {
        for (const a of h.amenities) {
          amenityCounts.set(a, (amenityCounts.get(a) ?? 0) + 1);
        }
      }

      // Suppliers
      for (const p of h.providers) {
        supplierCounts.set(p.provider, (supplierCounts.get(p.provider) ?? 0) + 1);
      }
    }

    return {
      starRatings: Array.from(starCounts.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.key - a.key),
      priceRange: {
        min: minPrice === Infinity ? 0 : minPrice,
        max: maxPrice === -Infinity ? 0 : maxPrice,
      },
      amenities: this.mapToFacetArray(amenityCounts),
      suppliers: this.mapToFacetArray(supplierCounts),
    };
  }

  private mapToFacetArray(m: Map<string, number>): Array<{ key: string; count: number }> {
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }
}
