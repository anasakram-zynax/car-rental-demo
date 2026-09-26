import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class QuotePromoCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  /**
   * Server-side booking or payment ID. The endpoint derives all pricing
   * context (subtotal, currency, product type, route, hotel, provider, user)
   * from this record so the client cannot manipulate eligibility or discount.
   */
  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  paymentId?: string;

  /**
   * @deprecated Kept for server-to-server calls only. Ignored when
   * bookingId or paymentId is provided. Client-facing checkout must
   * always supply a server-owned identifier.
   */
  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @IsString()
  routeCode?: string;

  @IsOptional()
  @IsString()
  airlineCode?: string;

  @IsOptional()
  @IsString()
  cabinClass?: string;

  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsString()
  destinationCode?: string;

  @IsOptional()
  @IsString()
  providerKey?: string;
}
