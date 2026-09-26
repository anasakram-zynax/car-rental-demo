import { SetMetadata } from '@nestjs/common';

/**
 * Rate-limit tiers mapped from user types.
 * Each tier has a base limit that can be overridden per endpoint.
 */
export const RATE_LIMIT_TIER_KEY = 'rate_limit_tier';

export type RateLimitTier = 'anonymous' | 'customer' | 'staff' | 'agent';

/** Per-endpoint rate-limit overrides (optional). */
export interface RateLimitTierOptions {
  /** Tier that this endpoint belongs to. */
  tier?: RateLimitTier;
  /** Custom per-endpoint limit (overrides the tier default). */
  limit?: number;
  /** Custom per-endpoint TTL in milliseconds (overrides the tier default). */
  ttlMs?: number;
}

/**
 * Assign a rate-limit tier and optional custom limits to an endpoint.
 *
 * Examples:
 *   @RateLimitTier({ tier: 'customer' })
 *   @RateLimitTier({ tier: 'anonymous', limit: 10, ttlMs: 60000 })
 */
export const RateLimitTier = (options: RateLimitTierOptions = {}) =>
  SetMetadata(RATE_LIMIT_TIER_KEY, options);
