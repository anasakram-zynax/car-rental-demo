import type { AutocompleteSuggestion } from '../../domain/autocomplete.types';

export const AutocompleteRepoPortToken = Symbol('AutocompleteRepoPort');

export interface AutocompleteRepoPort {
  searchSupplierDestinationss(query: string, limit: number): Promise<AutocompleteSuggestion[]>;
  searchHotels(
    query: string,
    destinationCode?: string,
    limit?: number,
  ): Promise<AutocompleteSuggestion[]>;
  searchFlightLocations(query: string, limit: number): Promise<AutocompleteSuggestion[]>;
}
