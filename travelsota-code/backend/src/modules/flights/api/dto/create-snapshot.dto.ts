import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * DTO for POST /flights/offers/:offerId/snapshot
 *
 * When the user clicks "Select" on a flight card, the frontend sends this
 * to create a persisted snapshot of the selected offer.
 */
export class CreateSnapshotDto {
  @IsString()
  @IsIn(['travelport', 'duffel', 'amadeus', 'manual'])
  provider!: 'travelport' | 'duffel' | 'amadeus' | 'manual';

  @IsString()
  searchKey!: string;

  @IsOptional()
  @IsString()
  displayCurrency?: string;

  @IsOptional()
  @IsString()
  @IsIn(['one_way', 'round_trip', 'multi_city'])
  tripType?: 'one_way' | 'round_trip' | 'multi_city';

  /** Full flight offer data from the frontend search card (segments, pricing, display). */
  @IsOptional()
  offerData?: Record<string, any>;
}
