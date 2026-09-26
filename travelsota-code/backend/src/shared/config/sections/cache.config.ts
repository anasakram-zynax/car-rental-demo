import type { CacheRuntimeConfig } from '../app-config.types';
import { ensureUrl, getBoolean, getNumber, getString } from '../env.utils';

const DEFAULT_CACHE_TTL_SECONDS = 300;
const DEFAULT_CACHE_KEY_PREFIX = 'backend:';
const DEFAULT_HOTEL_SEARCH_CACHE_TTL = 300;

export function buildCacheConfig(env: NodeJS.ProcessEnv): CacheRuntimeConfig {
  const upstashRestUrl = getString(env, 'UPSTASH_REDIS_REST_URL');
  const upstashRestToken = getString(env, 'UPSTASH_REDIS_REST_TOKEN');

  if (
    (upstashRestUrl && !upstashRestToken) ||
    (!upstashRestUrl && upstashRestToken)
  ) {
    throw new Error(
      'Invalid Upstash REST configuration. Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN together.',
    );
  }

  if (upstashRestUrl) {
    ensureUrl(upstashRestUrl, 'UPSTASH_REDIS_REST_URL');
  }

  const redisUrl =
    getString(env, 'CACHE_REDIS_URL') ??
    getString(env, 'UPSTASH_REDIS_URL');

  if (redisUrl) {
    ensureUrl(redisUrl, 'CACHE_REDIS_URL/UPSTASH_REDIS_URL');
  }

  return {
    redisUrl,
    upstashRestUrl,
    upstashRestToken,
    defaultTtlSeconds: getNumber(
      env,
      'CACHE_DEFAULT_TTL_SECONDS',
      DEFAULT_CACHE_TTL_SECONDS,
    ),
    keyPrefix:
      getString(env, 'CACHE_KEY_PREFIX', DEFAULT_CACHE_KEY_PREFIX) ??
      DEFAULT_CACHE_KEY_PREFIX,
    hotelSearchCacheEnabled: getBoolean(env, 'CACHE_HOTEL_SEARCH_ENABLED', true),
    hotelSearchCacheTtlSeconds: getNumber(
      env,
      'CACHE_HOTEL_SEARCH_TTL_SECONDS',
      DEFAULT_HOTEL_SEARCH_CACHE_TTL,
    ),
  };
}
