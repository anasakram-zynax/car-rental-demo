import type { AncillaryCatalogOption, AncillaryCatalogResponse } from './ancillary-catalog.types';

export interface CheckoutSessionPriceBreakdown {
  baseFare: number;
  taxes: number;
  total: number;
  currency: string;
  perTraveler: Array<{
    travelerIndex: number;
    baseFare: number;
    taxes: number;
    total: number;
  }>;
}

export interface CheckoutSessionResponse {
  ok: boolean;
  sessionKey: string;
  searchKey: string;
  offerId: string;
  contentSource: 'NDC' | 'GDS';
  expiresAt: string;
  priceBreakdown: CheckoutSessionPriceBreakdown;
  ancillaryCatalog: {
    seats: AncillaryCatalogOption[];
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
    meals: AncillaryCatalogOption[];
    unavailableReasons: {
      seats?: string;
      baggage?: string;
      services?: string;
      meals?: string;
    };
  };
}

export interface CachedCheckoutSession {
  sessionKey: string;
  searchKey: string;
  offerId: string;
  catalogUuid?: string;
  productIds: string[];
  productSelections: Array<{ offeringId: string; productIds: string[] }>;
  contentSource: 'NDC' | 'GDS';
  priceBreakdown: CheckoutSessionPriceBreakdown;
  ancillaryCatalog: CheckoutSessionResponse['ancillaryCatalog'];
  cachedAt: string;
  expiresAt: string;
}

export const CHECKOUT_SESSION_CACHE_PREFIX = 'travelport:checkout-session';
export const CHECKOUT_SESSION_TTL_SECONDS = 1800;
