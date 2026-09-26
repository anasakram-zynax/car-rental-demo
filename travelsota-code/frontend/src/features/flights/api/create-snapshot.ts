import { apiRequest } from '@/lib/api/client';
import type { FlightOfferView } from '@/lib/schema/flight';

export interface CreateSnapshotInput {
  offerId: string;
  provider: 'travelport' | 'duffel' | 'amadeus';
  searchKey: string;
  displayCurrency?: string;
  tripType?: 'one_way' | 'round_trip' | 'multi_city';
  /** Full offer data from the search card (segments, pricing, display). Stored in the snapshot for detail page rendering. */
  offerData?: FlightOfferView;
}

export interface CreateSnapshotResponse {
  snapshotId: string;
}

/**
 * Create a persisted snapshot of a selected flight offer.
 *
 * Called when user clicks "Select" on a flight card.
 * Returns a snapshotId used for all downstream operations.
 */
export function createFlightSnapshot(
  input: CreateSnapshotInput,
): Promise<CreateSnapshotResponse> {
  const { offerId, ...body } = input;
  return apiRequest<CreateSnapshotResponse>(
    `/flights/offers/${encodeURIComponent(offerId)}/snapshot`,
    {
      method: 'POST',
      body,
    },
  );
}
