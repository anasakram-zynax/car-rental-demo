import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

export interface BookingProviderInput {
  bookingId: string;
  provider: FlightsProviderKey;
  searchKey?: string;
  offerId?: string;
  catalogUuid?: string;
  offeringId?: string;
  productId?: string;
  productIds?: string[];
  productSelections?: Array<{ offeringId: string; productIds: string[] }>;
  seatProductIds?: string[];
  baggageProductIds?: string[];
  ancillaries?: unknown;
  travelers: Array<Record<string, unknown>>;
  from?: string;
  to?: string;
  departureDate?: string;
  tripType?: string;
  returnDate?: string;
  legs?: Array<{ origin: string; destination: string; departureDate: string }>;
  selectedOfferContext?: Record<string, unknown>;
}

export interface BookingProviderResult {
  ok: boolean;
  locatorCode?: string;
  supplierBookingId?: string;
  supplierStatus?: string;
  message?: string;
  failedStep?: string;
  /** Actual charged amount + currency after confirm (providers return this
   *  so the booking record reflects the real payment, not the snapshot price). */
  chargedAmount?: number;
  chargedCurrency?: string;
  workflowData?: Record<string, unknown>;
}

export interface TicketProviderResult {
  ok: boolean;
  locatorCode?: string;
  ticketNumbers?: string[];
  message?: string;
}

export interface RepriceResult {
  amount: number;
  currency: string;
}

export interface BookingCancelResult {
  ok: boolean;
  supplierStatus?: string;
  message?: string;
}

export interface VoidResult {
  ok: boolean;
  supplierStatus?: string;
  message?: string;
}

export interface RefundQuoteResult {
  ok: boolean;
  refundable: boolean;
  refundAmount?: number;
  refundCurrency?: string;
  penaltyAmount?: number;
  penaltyCurrency?: string;
  reason?: string;
  message?: string;
}

export interface RefundRequestResult {
  ok: boolean;
  supplierRefundId?: string;
  supplierStatus?: string;
  message?: string;
}

/**
 * Capability flags each provider declares so the booking pipeline
 * can decide whether to hold-before-pay, ticket-after-pay, etc.
 */
export interface ProviderCapabilityFlags {
  /** Provider can create a reservation/PNR without ticketing (skipTicketing) */
  supportsPrePaymentHold: boolean;
  /** Provider supports issuing tickets against an existing held reservation */
  supportsPostPaymentTicketing: boolean;
  /** Provider can cancel/void a held reservation */
  supportsHoldCancellation: boolean;
  /** Provider requires payment before any supplier interaction */
  requiresInstantPayment: boolean;
}

/**
 * Provider-neutral contract for flight booking operations.
 *
 * Each flight provider (Travelport, Duffle, etc.) implements this interface,
 * and a FlightBookingProviderRegistry resolves the correct one per booking.
 */
export interface FlightBookingProvider {
  readonly key: FlightsProviderKey;

  /** Capability flags for this provider */
  readonly capabilities: ProviderCapabilityFlags;

  /** Confirm/create a booking with the supplier after payment is authorized */
  confirmBooking(input: BookingProviderInput): Promise<BookingProviderResult>;

  /** Issue tickets for an already-confirmed booking (optional — some providers ticket inline) */
  ticketBooking?(locatorCode: string, input: BookingProviderInput): Promise<TicketProviderResult>;

  /** Cancel a booking with the supplier */
  cancelBooking?(input: {
    bookingId: string;
    supplierBookingId?: string;
    locatorCode?: string;
    /** Travelport content channel ('NDC' | 'GDS') — selects the official cancel
     *  path (NDC: canceloffer / GDS: cancelitems). Legacy bookings omit it and
     *  default to GDS. */
    contentSource?: string;
    /** Travelport offer identifier — required for NDC cancellation. */
    offerIdentifier?: string;
  }): Promise<BookingCancelResult>;

  /** Void a ticketed booking (within airline void window) */
  voidTicket?(input: {
    bookingId: string;
    locatorCode?: string;
    /** Known ticket numbers (stored at ticketing) — avoids re-deriving. */
    ticketNumbers?: string[];
  }): Promise<VoidResult>;

  /** Quote refund eligibility and penalties for a ticketed booking */
  quoteRefund?(input: {
    bookingId: string;
    locatorCode?: string;
    supplierBookingId?: string;
    /** Travelport content channel ('NDC' | 'GDS') — selects the same
     *  official quote path as cancelBooking (NDC: canceloffer / GDS:
     *  cancelitems), stopping before commit so nothing is actually cancelled. */
    contentSource?: string;
    /** Travelport offer identifier — required for an NDC quote. */
    offerIdentifier?: string;
  }): Promise<RefundQuoteResult>;

  /** Request a refund from the supplier */
  requestRefund?(input: { bookingId: string; locatorCode?: string; supplierBookingId?: string }): Promise<RefundRequestResult>;

  /** Re-price an offer (optional — falls back to cached search price) */
  reprice?(searchKey: string, offerId: string): Promise<RepriceResult>;

  /** Retrieve supplier booking details (optional — for admin detail/reconciliation) */
  retrieveBooking?(input: { supplierBookingId?: string; locatorCode?: string }): Promise<{
    ok: boolean;
    supplierStatus?: string;
    locatorCode?: string;
    raw?: unknown;
    message?: string;
  }>;

  /** Change/modify a booking (optional — provider-dependent) */
  changeBooking?(input: {
    bookingId: string;
    supplierBookingId?: string;
    newOfferId?: string;
  }): Promise<{
    ok: boolean;
    supplierStatus?: string;
    message?: string;
  }>;
}
