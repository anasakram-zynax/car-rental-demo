import { IsOptional, IsString } from 'class-validator';

export class FlightOfferDetailQueryDto {
  @IsOptional()
  @IsString()
  searchKey?: string;
}
