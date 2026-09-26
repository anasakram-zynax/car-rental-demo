import type { AppConfig } from './app-config.types';
import { buildAppRuntimeConfig } from './sections/app.config';
import { buildCacheConfig } from './sections/cache.config';
import { buildFlightsConfig } from './sections/flights.config';
import { buildHttpConfig } from './sections/http.config';
import { buildRateLimitConfig } from './sections/rate-limit.config';
import { buildTravelportConfig } from './sections/travelport.config';
import { buildHotelbedsConfig } from './sections/hotelbeds.config';
import { buildAuthConfig } from './sections/auth.config';
import { buildCurrencyConfig } from './sections/currency.config';
import { buildHotelContentConfig } from './sections/hotel-content.config';
import { buildDemoConfig } from './sections/build-demo.config';

export function buildAppConfig(env: NodeJS.ProcessEnv): AppConfig {
  const app = buildAppRuntimeConfig(env);
  const http = buildHttpConfig(env);
  const flights = buildFlightsConfig(env);
  const auth = buildAuthConfig(env);
  const travelport = buildTravelportConfig(env, http);
  const currency = buildCurrencyConfig(env);
  const hotelbeds = buildHotelbedsConfig(env, http);
  const hotelContent = buildHotelContentConfig(env);
  const cache = buildCacheConfig(env);
  const rateLimit = buildRateLimitConfig(env);
  const demo = buildDemoConfig(env);

  return {
    app,
    http,
    auth,
    flights,
    travelport,
    currency,
    hotelbeds,
    hotelContent,
    cache,
    rateLimit,
    demo,
  };
}
