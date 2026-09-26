export type AutocompleteSuggestionType =
  | 'HOTEL_DESTINATION'
  | 'HOTEL'
  | 'AIRPORT'
  | 'CITY'
  | 'METRO_AREA';

export type AutocompleteModule = 'hotels' | 'flights' | 'all';

export interface ProviderMapping {
  provider: string;
  code: string;
  codeType: string;
}

export interface TravelSuggestion {
  id: string;
  module: 'hotels' | 'flights';
  type: AutocompleteSuggestionType;
  label: string;
  subtitle: string;
  code?: string;
  destinationCode?: string;
  canonicalHotelId?: string;
  providerMappings?: ProviderMapping[];
  searchPayload: Record<string, unknown>;
}
