import type { HotelbedsRuntimeConfig, HttpRuntimeConfig } from '../app-config.types';
import { getNumber, getString } from '../env.utils';

export function buildHotelbedsConfig(
  env: NodeJS.ProcessEnv,
  http: HttpRuntimeConfig,
): HotelbedsRuntimeConfig {
  return {
    endpoint: getString(env, 'HOTELBEDS_ENDPOINT'),
    apiKey: getString(env, 'HOTELBEDS_API_KEY'),
    secret: getString(env, 'HOTELBEDS_SECRET'),
    requestTimeoutMs: getNumber(
      env,
      'HOTELBEDS_REQUEST_TIMEOUT_MS',
      http.defaultTimeoutMs,
    ),
    tolerancePercent: getNumber(env, 'HOTELBEDS_BOOKING_TOLERANCE_PERCENT', 5),
  };
}
