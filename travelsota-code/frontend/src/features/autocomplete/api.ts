import { apiRequest } from '@/lib/api/client';
import type { TravelSuggestion, AutocompleteModule } from './types';

export interface TravelAutocompleteParams {
  q: string;
  module?: AutocompleteModule;
  limit?: number;
}

export async function searchTravelLocations(
  params: TravelAutocompleteParams,
): Promise<TravelSuggestion[]> {
  const query = new URLSearchParams();
  query.set('q', params.q);
  if (params.module) query.set('module', params.module);
  // NOTE: deliberately not sending `limit` — older backend deployments
  // whitelist only q/module and reject the request with 400 outright,
  // which broke the deep-link city resolver. The backend caps results
  // server-side anyway, so client-side limiting is unnecessary.

  return apiRequest<TravelSuggestion[]>(
    `/autocomplete/travel?${query.toString()}`,
    { method: 'GET' },
  );
}
