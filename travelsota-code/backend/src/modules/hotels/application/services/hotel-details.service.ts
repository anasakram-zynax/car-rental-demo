import { Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { CacheService } from '../../../../shared/cache/cache.service';
import type { NormalizedHotelDetailsResponse } from '../../domain/types/hotel-provider.types';

/**
 * Service for hydrating hotel details from cached search results.
 *
 * For v1 (Hotelbeds), the search already returns all rates for each hotel
 * in the availability response. This service caches those results under a
 * searchKey and retrieves them on demand, avoiding the need for a second
 * upstream call.
 */
@Injectable()
export class HotelDetailsService {
  private readonly logger = new Logger(HotelDetailsService.name);

  constructor(
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Get hotel details from the cached search results.
   *
   * @param searchKey - The cache key returned from the search response
   * @param hotelId - The normalized hotel ID to look up
   * @returns NormalizedHotelDetailsResponse with live rates
   * @throws HOTELS_SEARCH_EXPIRED if the cache has expired
   */
  async getDetails(searchKey: string, hotelId: string): Promise<NormalizedHotelDetailsResponse> {
    // Look up the cached search results
    const cachedSearch = await this.cacheService.get<any>(searchKey);

    if (!cachedSearch) {
      this.logger.warn(
        `[DETAILS] Cache miss for searchKey="${searchKey}" hotelId="${hotelId}" — search results not found in cache`,
      );
      throw new BusinessError(
        'HOTELS_SEARCH_EXPIRED',
        'Your search results have expired. Please search again to get the latest rates.',
      );
    }

    // cachedSearch is the full NormalizedHotelSearchResponse
    const hotels = Array.isArray(cachedSearch.hotels) ? cachedSearch.hotels : [];
    const hotel = hotels.find((h: any) => h.hotelId === hotelId || h.code === hotelId);

    if (!hotel) {
      throw new BusinessError(
        'HOTELS_RATE_UNAVAILABLE',
        `Hotel ${hotelId} was not found in the cached search results.`,
      );
    }

    // Map the cached hotel data to NormalizedHotelDetailsResponse
    const rates = Array.isArray(hotel.rates) ? hotel.rates.map((rate: any) => ({
      rateId: rate.rateId ?? rate.rateKey ?? '',
      roomName: rate.roomName ?? '',
      boardName: rate.boardName,
      paymentType: rate.paymentType,
      supplierAmount: typeof rate.net === 'number' ? rate.net : (rate.supplierAmount ?? 0),
      supplierCurrency: rate.currency ?? 'EUR',
      cancellationPolicyText: rate.cancellationPolicyText,
      roomCode: rate.roomCode,
      roomKey: rate.roomKey,
      rgExt: rate.rgExt,
      adults: rate.adults != null ? Number(rate.adults) : undefined,
      children: rate.children != null ? Number(rate.children) : undefined,
    })) : [];

    return {
      provider: cachedSearch.provider ?? 'hotelbeds',
      searchKey,
      hotelId: hotel.hotelId ?? hotel.code ?? hotelId,
      providerHotelId: this.stripProviderPrefix(hotel.hotelId ?? hotel.code ?? hotelId),
      name: hotel.name ?? 'Unknown Hotel',
      checkIn: cachedSearch.meta?.checkIn,
      checkOut: cachedSearch.meta?.checkOut,
      rates,
    };
  }

  /**
   * Store search results in cache under a searchKey for later retrieval.
   *
   * @param searchKey - The cache key to store under
   * @param data - The normalized search response to cache
   * @param ttlSeconds - TTL in seconds (defaults to 900 = 15 min)
   */
  async storeSearchResults(searchKey: string, data: any, ttlSeconds: number = 900): Promise<void> {
    await this.cacheService.set(searchKey, data, ttlSeconds);
  }

  private stripProviderPrefix(id: string): string {
    return id.replace(/^(hotelbeds|ratehawk|travelport):/, '');
  }
}
