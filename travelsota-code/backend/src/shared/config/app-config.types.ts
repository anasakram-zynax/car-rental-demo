import type { DemoRuntimeConfig } from './sections/demo.config';

export type OauthClientAuthMode = 'basic' | 'body';

export interface AppRuntimeConfig {
  nodeEnv: string;
  port: number;
  /** Number of trusted reverse-proxy hops used for Express client-IP resolution. */
  trustProxyHops: number;
}

export interface HttpRuntimeConfig {
  defaultTimeoutMs: number;
  defaultRetries: number;
  retryDelayMs: number;
}

export interface FlightsRuntimeConfig {
  searchCacheEnabled: boolean;
  searchCacheTtlSeconds: number;
}

export interface TravelportRuntimeConfig {
  authUrl: string;
  baseUrl: string;
  acceptVersion: string;
  contentVersion: string;
  requestTimeoutMs: number;
  defaultContentSourceList: string[];
  oauthGrantType: string;
  oauthClientAuthMode: OauthClientAuthMode;
  includeAccessGroupInToken: boolean;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessGroup?: string;
  pcc?: string;
  gds?: string;
  /**
   * When true, allows creating a fake 'IKF...' locator when no supplier workflow
   * data (catalogUuid, offeringId) is available. This is a legacy fallback for
   * manual/admin bookings. In production checkout, this should be false so
   * bookings without supplier context fail with FLIGHTS_OFFER_EXPIRED.
   * @default false
   */
  allowLegacyLocator?: boolean;

  /**
   * When true, the confirm() step will fail the booking if the fresh API reprice
   * call to Travelport's /price/offers/buildfromproducts fails. When false
   * (default), the system falls back to the cached search response price or the
   * stored booking amount if the API call fails.
   *
   * Enable in production to guarantee that booking always uses a current supplier
   * price — but note this will reject bookings when the Travelport API is
   * temporarily unavailable.
   * @default false
   */
  strictReprice?: boolean;

  /**
   * Maximum acceptable percentage difference between the frontend-submitted
   * ancillary price and the Travelport-verified fresh price.
   *
   * Applied during preview() to validate seat, baggage, and meal prices before
   * storage. If any ancillary item exceeds this threshold, preview() fails with
   * FLIGHTS_ANCILLARY_PRICE_CHANGED.
   *
   * During confirm(), a separate price re-validation compares the stored ancillary
   * prices against a fresh reprice of all ancillaries. If the aggregate difference
   * exceeds this threshold, confirm() fails.
   *
   * @default 0.03 (3%)
   */
  ancillaryPriceTolerance?: number;
}

export interface CacheRuntimeConfig {
  redisUrl?: string;
  upstashRestUrl?: string;
  upstashRestToken?: string;
  defaultTtlSeconds: number;
  keyPrefix: string;
  hotelSearchCacheEnabled: boolean;
  hotelSearchCacheTtlSeconds: number;
}

export interface RateLimitTierConfig {
  limit: number;
  ttlMs: number;
}

export interface RateLimitRuntimeConfig {
  ttlMs: number;
  limit: number;
  /** Per-tier configurations — fall back to the global limit/ttlMs when not specified. */
  tiers: {
    anonymous: RateLimitTierConfig;
    customer: RateLimitTierConfig;
    staff: RateLimitTierConfig;
    agent: RateLimitTierConfig;
  };
}

export interface AuthRuntimeConfig {
  jwtSecret: string;
  jwtAccessExpiry: string;
  jwtRefreshExpiry: string;
  googleClientId: string;
  googleClientSecret: string;
}

export interface CurrencyRuntimeConfig {
  exchangeRateApiKey?: string;
  exchangeRateApiUrl: string;
  autoUpdateEnabled: boolean;
  autoUpdateCron: string;
}

export interface HotelbedsRuntimeConfig {
  endpoint?: string;
  apiKey?: string;
  secret?: string;
  requestTimeoutMs: number;
  /** Allowed price drift % between search and supplier booking (default 5). */
  tolerancePercent: number;
}

export type DumpStorageMode = 'local' | 's3';
export type RawPayloadMode = 'none' | 'summary' | 'full';

export interface HotelContentRuntimeConfig {
  enrichmentEnabled: boolean;
  recoverySyncEnabled: boolean;
  syncBatchSize: number;
  syncIntervalMinutes: number;
  syncIntervalSeconds: number;
  defaultLanguage: string;
  staleDays: number;
  enableCanonicalMatching: boolean;
  /** Storage backend for raw provider dump files */
  dumpStorage: DumpStorageMode;
  /** Directory path for local dump storage */
  dumpLocalDir: string;
  /** Number of days to retain raw dump files */
  dumpRetentionDays: number;
  /** How much raw provider payload to store in the DB */
  rawPayloadMode: RawPayloadMode;
  /** Enable demo/MVP fallback enrichment for missing informational content */
  fallbackEnabled: boolean;
  /** Base URL for fallback hotel images (served from /public) */
  fallbackImageBaseUrl: string;
  /** Default inventory filter for RateHawk dump API (e.g. 'all') */
  ratehawkDumpInventory: string;
  /** Batch size for region content upserts during dump import */
  ratehawkDumpRegionBatchSize: number;
}

export interface AppConfig {
  app: AppRuntimeConfig;
  http: HttpRuntimeConfig;
  flights: FlightsRuntimeConfig;
  travelport: TravelportRuntimeConfig;
  currency: CurrencyRuntimeConfig;
  auth: AuthRuntimeConfig;
  hotelbeds: HotelbedsRuntimeConfig;
  hotelContent: HotelContentRuntimeConfig;
  cache: CacheRuntimeConfig;
  rateLimit: RateLimitRuntimeConfig;
  demo: DemoRuntimeConfig;
}
