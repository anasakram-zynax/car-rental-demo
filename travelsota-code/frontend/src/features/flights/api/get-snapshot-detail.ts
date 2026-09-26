import { apiRequest } from '@/lib/api/client';
import type { FlightOfferDetailView } from '@/features/flights/types/flight-offer-detail-view';

export interface SnapshotDetailResponse {
  snapshotId: string;
  provider: string;
  /** Supplier offer ID for ancillary and reprice operations */
  offerId: string;
  /** Search cache key for cached-offer lookups */
  searchKey: string;
  normalizedOffer: Record<string, unknown>;
  pricing: {
    amount: number;
    currency: string;
    supplierPrice?: { amount: number; currency: string };
  };
  baggage: unknown;
  fareRules: {
    cabin?: string;
    fareBrand?: string;
    refundPolicy?: unknown;
    changePolicy?: unknown;
  };
  expiresAt: string;
  tripType: string;
  detailView: FlightOfferDetailView;
}

/**
 * Fetch a flight offer snapshot by ID.
 *
 * Used by the detail page to load the canonical offer data
 * without reconstructing identifiers from URL params.
 */
export function getFlightSnapshotDetail(
  snapshotId: string,
): Promise<SnapshotDetailResponse> {
  return apiRequest<SnapshotDetailResponse>(
    `/flights/offers/snapshots/${encodeURIComponent(snapshotId)}`,
    { method: 'GET' },
  );
}
