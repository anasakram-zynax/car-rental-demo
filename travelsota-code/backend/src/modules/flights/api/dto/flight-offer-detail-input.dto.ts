import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class FlightOfferDetailInputDto {
  @IsString()
  offerId!: string;

  @IsOptional()
  @IsString()
  searchKey?: string;

  @IsString()
  @IsIn(['duffel', 'travelport', 'amadeus'])
  provider!: 'duffel' | 'travelport' | 'amadeus' | 'manual';

  @IsOptional()
  @IsString()
  catalogUuid?: string;

  @IsOptional()
  @IsObject()
  offerData?: Record<string, any>;
}
