import { apiRequest } from "@/lib/api/client";
import { ROUTES } from "@/lib/routes";

export interface DestinationSuggestion {
  code: string;
  name: string;
  countryCode: string;
  contentStatus?: string;
}

export async function suggestDestinations(q: string): Promise<DestinationSuggestion[]> {
  if (!q.trim()) return [];
  return apiRequest<DestinationSuggestion[]>(
    `${ROUTES.HOTELS.DESTINATIONS}?q=${encodeURIComponent(q.trim())}`,
  );
}

/**
 * Fetch all enabled/ready destinations for the search form (no query = top destinations).
 */
export async function fetchTopDestinations(): Promise<DestinationSuggestion[]> {
  return apiRequest<DestinationSuggestion[]>(ROUTES.HOTELS.DESTINATIONS);
}
