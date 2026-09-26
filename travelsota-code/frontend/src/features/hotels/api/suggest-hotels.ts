import { apiRequest } from "@/lib/api/client";
import { ROUTES } from "@/lib/routes";

export interface HotelSuggestion {
  code: string;
  name: string;
  city: string;
  countryCode: string;
}

export async function suggestHotels(
  destinationCode?: string,
  q: string = "",
): Promise<HotelSuggestion[]> {
  const params = new URLSearchParams();
  if (destinationCode?.trim()) {
    params.set("destinationCode", destinationCode.trim());
  }
  if (q.trim()) {
    params.set("q", q.trim());
  }
  // If nothing to search, return empty
  if (!destinationCode?.trim() && !q.trim()) return [];
  return apiRequest<HotelSuggestion[]>(
    `${ROUTES.HOTELS.SUGGEST_HOTELS}?${params.toString()}`,
  );
}
