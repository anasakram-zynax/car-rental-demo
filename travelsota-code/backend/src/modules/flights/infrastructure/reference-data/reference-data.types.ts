export interface NormalizedAirport {
  iataCode: string;
  icaoCode?: string | null;
  name: string;
  cityName?: string | null;
  countryCode?: string | null;
  countryName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  duffelCityId?: string | null;
  duffelPlaceId?: string | null;
  source: 'duffel' | 'zcars' | 'merged';
}

export interface NormalizedAirline {
  iataCode: string;
  icaoCode?: string | null;
  name: string;
  countryCode?: string | null;
  logoSymbolUrl?: string | null;
  logoLockupUrl?: string | null;
  conditionsOfCarriageUrl?: string | null;
  source: 'duffel' | 'manual' | 'merged';
}

export interface SyncStats {
  airlines: {
    fetched: number;
    created: number;
    updated: number;
    failed: number;
  };
  airports: {
    fetched: number;
    duffelOnly: number;
    zcarsOnly: number;
    merged: number;
    created: number;
    updated: number;
    failed: number;
  };
}
