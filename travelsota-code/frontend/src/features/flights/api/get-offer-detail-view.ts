import { apiRequest } from '@/lib/api/client';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';

export interface OfferDetailViewInput {
  offerId: string;
  searchKey?: string;
  provider: 'duffel' | 'travelport' | 'amadeus';
  catalogUuid?: string;
  offerData?: Record<string, unknown>;
}

export interface OfferDetailViewResponse {
  offerId: string;
  detailAvailable: boolean;
  detailView?: FlightOfferDetailView;
  message?: string;
}

export function getOfferDetailView(
  input: OfferDetailViewInput,
): Promise<OfferDetailViewResponse> {
  return apiRequest<OfferDetailViewResponse>('/flights/offers/detail', {
    method: 'POST',
    body: input,
  });
}
