import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NormalizedHotelSummary, CombinedHotelCard, HotelProviderSummary } from '../../domain/types/hotel-provider.types';
import type { HotelSupplierLinksRepoPort, HotelSupplierLinksRecord } from '../ports/hotel-provider-mapping-repo.port';
import { HotelSupplierLinksRepoPortToken } from '../ports/hotel-provider-mapping-repo.port';

const AUTO_GROUP_CONFIDENCE_THRESHOLD = 0.8;
const LAT_LNG_RADIUS_KM = 0.5;

/**
 * Conservative hotel grouping service.
 *
 * Rules for Phase 4:
 * 1. If explicit mapping exists in HotelSupplierLinks table, group under canonicalHotelId.
 * 2. If no mapping exists, only auto-group when confidence is high:
 *    - normalized hotel names are very close (string similarity > 0.8)
 *    - city/country match
 *    - lat/lng within a small radius
 * 3. If confidence is not high, show as separate hotel cards.
 *
 * This prevents accidentally merging two different hotels.
 */
@Injectable()
export class HotelGroupingService {
  private readonly logger = new Logger(HotelGroupingService.name);

  constructor(
    @Inject(HotelSupplierLinksRepoPortToken)
    private readonly mappingRepo: HotelSupplierLinksRepoPort,
  ) {}

  /**
   * Organize hotels from multiple providers into combined cards.
   *
   * mode='grouped' (default): the same hotel from different suppliers is
   * merged into one card (mappings + conservative auto-grouping).
   *
   * mode='per_provider': every (provider, hotel) pair becomes its OWN card,
   * each showing only that supplier's data. The canonical/mapping layer is
   * untouched (still used for booking identity + enrichment), but cards are
   * never merged across suppliers. Product decision: agents compare
   * per-supplier offers on separate cards.
   */
  async groupHotels(
    successfulResults: Array<{ provider: string; raw: any }>,
    mode: 'grouped' | 'per_provider' = 'grouped',
  ): Promise<CombinedHotelCard[]> {
    if (mode === 'per_provider') {
      const cards: CombinedHotelCard[] = [];
      for (const result of successfulResults) {
        const hotels: NormalizedHotelSummary[] = Array.isArray(result.raw?.hotels)
          ? result.raw.hotels
          : [];
        for (const hotel of hotels) {
          const pId = hotel.providerHotelId ?? hotel.hotelId;
          cards.push(this.buildCard(`${result.provider}:${pId}`, [{ provider: result.provider, hotel }]));
        }
      }
      cards.sort((a, b) => {
        const aPrice = a.minPrice?.amount ?? Infinity;
        const bPrice = b.minPrice?.amount ?? Infinity;
        return aPrice - bPrice;
      });
      return cards;
    }

    // Load only the mappings for hotels in THIS result set — the previous
    // findAllActive() pulled the entire mappings table per search.
    const idsByProvider = new Map<string, Set<string>>();
    for (const result of successfulResults) {
      const hotels: NormalizedHotelSummary[] = Array.isArray(result.raw?.hotels)
        ? result.raw.hotels
        : [];
      let set = idsByProvider.get(result.provider);
      if (!set) {
        set = new Set<string>();
        idsByProvider.set(result.provider, set);
      }
      for (const hotel of hotels) {
        const pId = hotel.providerHotelId ?? hotel.hotelId;
        if (pId) set.add(pId);
      }
    }
    const mappingRows = (
      await Promise.all(
        [...idsByProvider.entries()].map(([provider, ids]) =>
          this.mappingRepo.findByProviderHotelIds(provider, [...ids]).catch(() => []),
        ),
      )
    ).flat();
    const mappingByProvider = new Map<string, HotelSupplierLinksRecord>();
    const mappingKey = (p: string, id: string) => `${p}:${id}`;
    for (const m of mappingRows) {
      mappingByProvider.set(mappingKey(m.provider, m.providerHotelId), m);
    }

    // Index by canonicalHotelId: provider entries that share a canonical ID
    const canonicalGroups = new Map<string, Array<{ provider: string; hotel: NormalizedHotelSummary }>>();
    const unmapped: Array<{ provider: string; hotel: NormalizedHotelSummary }> = [];

    for (const result of successfulResults) {
      const hotels: NormalizedHotelSummary[] = Array.isArray(result.raw?.hotels)
        ? result.raw.hotels
        : [];

      for (const hotel of hotels) {
        const pId = hotel.providerHotelId ?? hotel.hotelId;
        const key = mappingKey(result.provider, pId);
        const mapping = mappingByProvider.get(key);

        if (mapping?.canonicalHotelId) {
          // Explicit mapping exists — group by canonical ID
          let group = canonicalGroups.get(mapping.canonicalHotelId);
          if (!group) {
            group = [];
            canonicalGroups.set(mapping.canonicalHotelId, group);
          }
          group.push({ provider: result.provider, hotel });
        } else {
          // No explicit mapping — try auto-grouping later
          unmapped.push({ provider: result.provider, hotel });
        }
      }
    }

    // Auto-group unmapped hotels by conservative similarity
    const autoGroups = this.autoGroup(unmapped);

    // Build combined hotel cards
    const cards: CombinedHotelCard[] = [];

    // 1. Create cards from explicit mappings
    for (const [canonicalId, entries] of canonicalGroups) {
      cards.push(this.buildCard(canonicalId, entries));
    }

    // 2. Create cards from auto-groups
    for (const [groupId, entries] of autoGroups) {
      cards.push(this.buildCard(groupId, entries));
    }

    // 3. Create individual cards for remaining ungrouped hotels
    const groupedKeys = new Set<string>();
    for (const [, entries] of canonicalGroups) {
      for (const e of entries) groupedKeys.add(`${e.provider}:${e.hotel.providerHotelId ?? e.hotel.hotelId}`);
    }
    for (const [, entries] of autoGroups) {
      for (const e of entries) groupedKeys.add(`${e.provider}:${e.hotel.providerHotelId ?? e.hotel.hotelId}`);
    }

    for (const entry of unmapped) {
      const key = `${entry.provider}:${entry.hotel.providerHotelId ?? entry.hotel.hotelId}`;
      if (!groupedKeys.has(key)) {
        cards.push(this.buildCard(key, [entry]));
      }
    }

    // Sort by min price ascending
    cards.sort((a, b) => {
      const aPrice = a.minPrice?.amount ?? Infinity;
      const bPrice = b.minPrice?.amount ?? Infinity;
      return aPrice - bPrice;
    });

    return cards;
  }

  /**
   * Auto-group hotels from different providers using conservative similarity checks.
   */
  private autoGroup(
    entries: Array<{ provider: string; hotel: NormalizedHotelSummary }>,
  ): Map<string, Array<{ provider: string; hotel: NormalizedHotelSummary }>> {
    const groups = new Map<string, Array<{ provider: string; hotel: NormalizedHotelSummary }>>();
    const assigned = new Set<number>();

    for (let i = 0; i < entries.length; i++) {
      if (assigned.has(i)) continue;
      const group: Array<{ provider: string; hotel: NormalizedHotelSummary }> = [entries[i]];
      assigned.add(i);

      for (let j = i + 1; j < entries.length; j++) {
        if (assigned.has(j)) continue;
        if (entries[i].provider === entries[j].provider) continue; // Same provider, different hotel

        if (this.isLikelySameHotel(entries[i].hotel, entries[j].hotel)) {
          group.push(entries[j]);
          assigned.add(j);
        }
      }

      // Only group if confidence is high enough
      if (group.length > 1) {
        const groupId = `auto:${entries[i].provider}_${entries[i].hotel.providerHotelId ?? entries[i].hotel.hotelId}`;
        groups.set(groupId, group);
      }
    }

    return groups;
  }

  /**
   * Conservative check whether two hotels from different providers are the same.
   */
  private isLikelySameHotel(a: NormalizedHotelSummary, b: NormalizedHotelSummary): boolean {
    // Must have name
    if (!a.name || !b.name) return false;

    // Normalize names
    const nameA = this.normalizeName(a.name);
    const nameB = this.normalizeName(b.name);

    // Check similarity
    const similarity = this.stringSimilarity(nameA, nameB);
    if (similarity < AUTO_GROUP_CONFIDENCE_THRESHOLD) return false;

    // Check city match if available
    const cityA = (a.destinationName ?? '').toLowerCase().trim();
    const cityB = (b.destinationName ?? '').toLowerCase().trim();
    if (cityA && cityB && cityA !== cityB) return false;

    // Check lat/lng proximity if both available
    const latA = a.latitude ? parseFloat(a.latitude) : null;
    const lngA = a.longitude ? parseFloat(a.longitude) : null;
    const latB = b.latitude ? parseFloat(b.latitude) : null;
    const lngB = b.longitude ? parseFloat(b.longitude) : null;

    if (latA !== null && lngA !== null && latB !== null && lngB !== null) {
      const distance = this.haversineDistance(latA, lngA, latB, lngB);
      if (distance > LAT_LNG_RADIUS_KM) return false;
    }

    this.logger.debug(`[GROUPING] Auto-grouped: "${a.name}" (similarity=${similarity.toFixed(2)}) with "${b.name}"`);
    return true;
  }

  private buildCard(
    groupId: string,
    entries: Array<{ provider: string; hotel: NormalizedHotelSummary }>,
  ): CombinedHotelCard {
    // Use the first hotel's data as the primary display info
    const primary = entries[0];
    const hotel = primary.hotel;

    const providers: HotelProviderSummary[] = entries.map((entry) => {
      const h = entry.hotel;
      const minRate = h.minRate ?? this.findMinRate(h.rates);
      return {
        provider: entry.provider,
        providerHotelId: h.providerHotelId ?? h.hotelId,
        available: true,
        minRate: minRate
          ? { rateId: minRate.rateId, total: minRate.total, currency: minRate.currency, boardName: minRate.boardName, adults: minRate.adults, children: minRate.children, refundable: minRate.refundable, cancellationPolicyText: minRate.cancellationPolicyText, cancellationPolicies: minRate.cancellationPolicies }
          : undefined,
        rateCount: h.rates?.length ?? h.roomsCount ?? undefined,
      };
    });

    // Find the overall best min price across all providers
    const allPrices = providers
      .map((p) => p.minRate?.total)
      .filter((p): p is number => p != null);

    const minPriceAmount = allPrices.length > 0 ? Math.min(...allPrices) : undefined;
    const minPriceCurrency = providers.find((p) => p.minRate?.currency)?.minRate?.currency;

    return {
      hotelGroupId: groupId,
      displayName: hotel.name,
      location: {
        latitude: hotel.latitude ? parseFloat(hotel.latitude) : undefined,
        longitude: hotel.longitude ? parseFloat(hotel.longitude) : undefined,
        city: hotel.destinationName,
      },
      starRating: hotel.categoryName ? this.parseStars(hotel.categoryName) : undefined,
      images: hotel.images,
      amenities: hotel.amenities,
      providers,
      minPrice: minPriceAmount != null
        ? { amount: minPriceAmount, currency: minPriceCurrency ?? 'EUR' }
        : undefined,
    };
  }

  private findMinRate(rates: any[] | undefined): { rateId: string; total: number; currency?: string; boardName?: string; adults?: number; children?: number; refundable?: boolean; cancellationPolicyText?: string; cancellationPolicies?: any[] } | undefined {
    if (!rates || rates.length === 0) return undefined;
    let min: { rateId: string; total: number; currency?: string; boardName?: string; adults?: number; children?: number; refundable?: boolean; cancellationPolicyText?: string; cancellationPolicies?: any[] } | undefined;
    for (const rate of rates) {
      const total = rate.supplierAmount ?? rate.net ?? rate.total;
      if (total == null) continue;
      const amount = typeof total === 'number' ? total : parseFloat(total);
      if (!Number.isFinite(amount)) continue;
      if (!min || amount < min.total) {
        min = {
          rateId: rate.rateId ?? rate.rateKey ?? '',
          total: amount,
          currency: rate.supplierCurrency ?? rate.currency,
          boardName: rate.boardName,
          adults: rate.adults != null ? Number(rate.adults) : undefined,
          children: rate.children != null ? Number(rate.children) : undefined,
          refundable: rate.refundable,
          cancellationPolicyText: rate.cancellationPolicyText,
          cancellationPolicies: rate.cancellationPolicies,
        };
      }
    }
    return min;
  }

  private parseStars(categoryName: string): number | undefined {
    if (!categoryName) return undefined;
    const match = categoryName.match(/(\d+)\s*stars?/i);
    if (match) return parseInt(match[1], 10);
    const num = parseInt(categoryName, 10);
    if (!isNaN(num) && num >= 1 && num <= 5) return num;
    return undefined;
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    const bigrams = new Map<string, number>();
    for (let i = 0; i < a.length - 1; i++) {
      const bigram = a.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }

    let intersectionSize = 0;
    for (let i = 0; i < b.length - 1; i++) {
      const bigram = b.substring(i, i + 2);
      const count = bigrams.get(bigram) ?? 0;
      if (count > 0) {
        bigrams.set(bigram, count - 1);
        intersectionSize++;
      }
    }

    return (2.0 * intersectionSize) / (a.length + b.length - 2);
  }

  private haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
