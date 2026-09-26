export type ModuleKey = 'flights' | 'hotels' | 'cars';

export type FlightsProviderKey = 'travelport' | 'duffel' | 'amadeus' | 'manual';
export type HotelsProviderKey = 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays' | 'manual';
export type CarsProviderKey = 'travelport';
export type ProviderKey = FlightsProviderKey | HotelsProviderKey | CarsProviderKey;

export interface TravelportFlightsConfig {
  environment: 'development' | 'production';
  authUrl: string;
  baseUrl: string;
  acceptVersion: string;
  contentVersion: string;
  requestTimeoutMs: number;
  oauthGrantType: string;
  oauthClientAuthMode: 'basic' | 'body';
  includeAccessGroupInToken: boolean;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessGroup?: string;
  pcc?: string;
  gds?: string;
  defaultContentSourceList: string[];

  // Multi-provider controls (Phase 1)
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface DuffleFlightsConfig {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  accessToken: string;
  duffelVersion: string;
  requestTimeoutMs: number;

  // Multi-provider controls (Phase 2+)
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface HotelbedsHotelsConfig {
  environment: 'development' | 'production' | 'mtls';
  endpoint: string;
  apiKey: string;
  secret: string;
  requestTimeoutMs: number;
  sslCert?: string;
  sslKey?: string;

  // Multi-provider controls (Phase 1)
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface RatehawkHotelsConfig {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  keyId: string;
  apiKey: string;
  requestTimeoutMs: number;
  webhookSecret?: string;

  // Multi-provider controls (Phase 1)
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface AmadeusHotelsConfig {
  environment: 'test' | 'production';
  authUrl: string;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  requestTimeoutMs: number;

  // Multi-provider controls (Phase 1)
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface TravelportStaysHotelsConfig {
  environment: 'development' | 'production';
  authUrl: string;
  baseUrl: string;
  acceptVersion: string;
  contentVersion: string;
  requestTimeoutMs: number;
  oauthGrantType: string;
  oauthClientAuthMode: 'basic' | 'body';
  includeAccessGroupInToken: boolean;
  username?: string;
  password?: string;
  clientId?: string;
  clientSecret?: string;
  accessGroup?: string;
  pcc?: string;
  gds?: string;

  // Multi-provider controls
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  priority?: number;
}

export interface ProviderConfigRecord<TConfig = unknown> {
  module: ModuleKey;
  provider: ProviderKey;
  enabled: boolean;
  config: TConfig;
  updatedAt: string;
}

export interface AmadeusFlightsConfig {
  environment: 'test' | 'production';
  authUrl: string;
  baseUrl: string;
  clientId?: string;
  clientSecret?: string;
  officeId?: string;
  source?: string;
  requestTimeoutMs: number;
  searchEnabled?: boolean;
  bookingEnabled?: boolean;
  ticketingEnabled?: boolean;
  seatMapEnabled?: boolean;
  brandedFaresEnabled?: boolean;
  queueEnabled?: boolean;
  priority?: number;
  accessCredential?: string;
  lssOrgId?: string;
  lssOfficeId?: string;
  lssUserId?: string;
}
