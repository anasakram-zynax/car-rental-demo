import type { FlightsRuntimeConfig } from '../app-config.types';
import { getBoolean, getNumber } from '../env.utils';

const DEFAULT_SEARCH_CACHE_TTL_SECONDS = 90;

export function buildFlightsConfig(
  env: NodeJS.ProcessEnv,
): FlightsRuntimeConfig {
  return {
    searchCacheEnabled: getBoolean(env, 'FLIGHTS_SEARCH_CACHE_ENABLED', true),
    searchCacheTtlSeconds: getNumber(
      env,
      'FLIGHTS_SEARCH_CACHE_TTL_SECONDS',
      DEFAULT_SEARCH_CACHE_TTL_SECONDS,
    ),
  };
}
