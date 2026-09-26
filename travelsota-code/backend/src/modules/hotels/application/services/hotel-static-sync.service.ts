import { Inject, Injectable, Logger } from '@nestjs/common';
import type { HotelStaticContentRepoPort } from '../ports/hotel-static-content-repo.port';
import { HotelStaticContentRepoPortToken } from '../ports/hotel-static-content-repo.port';
import type { UpsertStaticContentInput } from '../ports/hotel-static-content-repo.port';

/**
 * Service for synchronizing hotel static content from providers into local storage.
 *
 * Phase 4 establishes the storage foundation and sync infrastructure.
 * Provider-specific fetch logic (RateHawk hotel content API, Hotelbeds content API)
 * will be implemented in Phase 5+ when each provider adapter is built.
 *
 * Usage:
 * - Scheduled via cron (e.g., daily at 2 AM): syncAllProviders()
 * - On-demand via admin API: syncProvider(providerKey)
 * - Individual hotel lookup: getContent(provider, providerHotelId)
 */
@Injectable()
export class HotelStaticSyncService {
  private readonly logger = new Logger(HotelStaticSyncService.name);

  constructor(
  @Inject(HotelStaticContentRepoPortToken)
  private readonly contentRepo: HotelStaticContentRepoPort,
  ) {}

  /**
   * Sync static content for all enabled hotel providers.
   * Called by scheduled cron job.
   */
  async syncAllProviders(): Promise<Record<string, { synced: number; errors: string[] }>> {
    this.logger.log('[STATIC_SYNC] Starting full static content sync for all providers');
    const results: Record<string, { synced: number; errors: string[] }> = {};
    results['hotelbeds'] = { synced: 0, errors: [] };
    results['ratehawk'] = { synced: 0, errors: [] };
    return results;
  }

  /**
   * Sync static content for a specific provider.
   * Throws if the provider is not yet implemented.
   */
  async syncProvider(provider: string): Promise<{ synced: number; errors: string[] }> {
    this.logger.log(`[STATIC_SYNC] Starting sync for provider: ${provider}`);
    return { synced: 0, errors: [`Provider "${provider}" content sync not yet implemented. This will be added when the provider adapter is built.`] };
  }

  /**
   * Store or update static content for a single hotel.
   */
  async upsertContent(input: UpsertStaticContentInput): Promise<void> {
    await this.contentRepo.upsert({
      ...input,
      language: input.language ?? 'en',
    });
  }

  /**
   * Look up static content for a hotel.
   */
  async getContent(provider: string, providerHotelId: string, language?: string) {
    return this.contentRepo.findByProvider(provider, providerHotelId, language);
  }

  /**
   * Get all content for a canonical hotel group (across providers).
   */
  async getGroupContent(canonicalHotelId: string) {
    return this.contentRepo.findAllByCanonical(canonicalHotelId);
  }
}
