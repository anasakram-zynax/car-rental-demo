import { apiRequest } from '@/lib/api/client';

export interface SnapshotRepriceInput {
  snapshotId: string;
  displayCurrency?: string;
  totalPrice?: number;
  selectedAncillaries?: Array<{ offeringId: string; productIds: string[] }>;
}

export interface SnapshotRepriceResponse {
  snapshotId: string;
  offerId: string;
  amount: number;
  currency: string;
  displayPrice: number;
  /** Raw supplier base + applied markup in display currency (admin/agent) */
  supplierBase?: number;
  markupAmount?: number;
  freshRepriceAvailable: boolean;
  priceChanged: boolean;
  /** QA R4: what checkout actually charges (native supplier currency) */
  chargeAmount: number;
  chargeCurrency: string;
  /** Live fare conditions from the priced offer (Travelport). Overrides the search-time policy. */
  fareRules?: {
    refundPolicy?: FarePolicy | null;
    changePolicy?: FarePolicy | null;
  };
}

export interface FarePolicy {
  label?: string;
  allowed?: boolean | null;
  penaltyAmount?: number | string | null;
  penaltyCurrency?: string | null;
  penaltyPercent?: number | null;
  free?: boolean | null;
}

/**
 * Phase 5: Reprice a flight offer using its persisted snapshot.
 *
 * The backend loads all supplier identifiers from FlightOfferSnapshot.
 * No raw Travelport identifiers are sent from the frontend.
 */
export function repriceFlightSnapshot(
  input: SnapshotRepriceInput,
): Promise<SnapshotRepriceResponse> {
  const { snapshotId, ...body } = input;
  return apiRequest<SnapshotRepriceResponse>(
    `/flights/offers/snapshots/${encodeURIComponent(snapshotId)}/reprice`,
    {
      method: 'POST',
      body,
    },
  );
}
