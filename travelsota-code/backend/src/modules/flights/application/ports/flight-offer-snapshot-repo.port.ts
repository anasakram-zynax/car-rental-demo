import type {
  FlightOfferSnapshotEntity,
  CreateFlightOfferSnapshotInput,
} from '../../domain/entities/flight-offer-snapshot.entity';

export interface FlightOfferSnapshotRepoPort {
  create(data: CreateFlightOfferSnapshotInput): Promise<FlightOfferSnapshotEntity>;
  findById(id: string): Promise<FlightOfferSnapshotEntity | null>;
  findBySearchKeyAndOfferId(
    searchKey: string,
    offerId: string,
  ): Promise<FlightOfferSnapshotEntity | null>;
  /** Replace the stored normalized offer (e.g. after fresh fare rules arrive). */
  updateNormalizedOffer(
    id: string,
    normalizedOffer: Record<string, unknown>,
  ): Promise<void>;
  deleteExpired(): Promise<number>;
}

export const FlightOfferSnapshotRepoPortToken = Symbol(
  'FlightOfferSnapshotRepoPort',
);
