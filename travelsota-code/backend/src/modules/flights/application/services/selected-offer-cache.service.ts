import { Injectable } from '@nestjs/common';
import { CacheService } from '../../../../shared/cache/cache.service';
import type { SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

/**
 * Cache service for storing selected offer data from flight search responses.
 *
 * After a user searches for flights and selects an offer, this service caches
 * the supplier-side data (catalogUuid, product refs, reference list entries)
 * so that subsequent pricing, booking, and ancillary workflows can reconstruct
 * the correct full payloads without requiring the frontend to send raw
 * Travelport identifiers.
 *
 * Phase 12: Now provider-agnostic. Cache key includes the provider so both
 * Travelport and Duffel offers are cached independently.
 *
 * Cache key pattern: `flight:selected-offer:v1:{provider}:{searchKey}:{offerId}`
 * Recommended TTL: 15 minutes.
 */
@Injectable()
export class SelectedOfferCacheService {
  private readonly CACHE_PREFIX = 'flight:selected-offer:v1';
  private readonly DEFAULT_TTL_SECONDS = 15 * 60; // 15 minutes

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Build the cache key for a given provider, searchKey and offerId.
   */
  private buildKey(provider: FlightsProviderKey | string, searchKey: string, offerId: string): string {
    return `${this.CACHE_PREFIX}:${provider}:${searchKey}:${offerId}`;
  }

  /**
   * Store selected offer data in cache.
   */
  async store(
    provider: FlightsProviderKey | string,
    searchKey: string,
    offerId: string,
    data: SelectedOfferCacheEntry,
    ttlSeconds?: number,
  ): Promise<void> {
    const key = this.buildKey(provider, searchKey, offerId);
    await this.cacheService.set(key, data, ttlSeconds ?? this.DEFAULT_TTL_SECONDS);
  }

  /**
   * Retrieve cached selected offer data.
   *
   * When `provider` is given, checks the provider-specific key first, then falls
   * back to the legacy Travelport-only key.
   *
   * When `provider` is omitted, scans all known providers (travelport, duffel)
   * before falling back to legacy.
   */
  async retrieve(
    searchKey: string,
    offerId: string,
    provider?: FlightsProviderKey | string,
  ): Promise<SelectedOfferCacheEntry | null> {
    const tryKey = async (p: string): Promise<SelectedOfferCacheEntry | null> => {
      const key = this.buildKey(p, searchKey, offerId);
      return this.cacheService.get<SelectedOfferCacheEntry>(key);
    };

    if (provider) {
      const result = await tryKey(provider);
      if (result) return result;
    } else {
      // No provider specified — scan all known providers
      for (const candidate of ['travelport', 'duffel', 'amadeus']) {
        const result = await tryKey(candidate);
        if (result) return result;
      }
    }

    // Fall back to legacy Travelport-only key for backward compatibility
    const legacyKey = `travelport:selected-offer:v2:${searchKey}:${offerId}`;
    return this.cacheService.get<SelectedOfferCacheEntry>(legacyKey);
  }

  /**
   * Delete a cached selected offer entry.
   */
  async delete(
    provider: FlightsProviderKey | string,
    searchKey: string,
    offerId: string,
  ): Promise<void> {
    const key = this.buildKey(provider, searchKey, offerId);
    await this.cacheService.del(key);
  }
}
