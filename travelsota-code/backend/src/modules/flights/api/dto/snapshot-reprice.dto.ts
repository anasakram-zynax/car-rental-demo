import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class SnapshotRepriceProductSelectionDto {
  @IsString() offeringId!: string;

  @IsArray()
  @IsString({ each: true })
  productIds!: string[];
}

/**
 * Snapshot-based reprice request.
 *
 * Phase 5: The detail page sends only the snapshotId. Backend loads all
 * supplier identifiers from the persisted FlightOfferSnapshot — no raw
 * Travelport identifiers are accepted from the frontend.
 */
export class SnapshotRepriceDto {
  @IsString() snapshotId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SnapshotRepriceProductSelectionDto)
  selectedAncillaries?: SnapshotRepriceProductSelectionDto[];

  @IsOptional()
  @IsString()
  displayCurrency?: string;

  @IsOptional()
  @IsNumber()
  totalPrice?: number;
}
