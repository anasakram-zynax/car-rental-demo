import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

export type FlightBookingStatus =
  | 'pending_payment'
  | 'held_pending_payment'
  | 'awaiting_issue'
  | 'booking_in_progress'
  | 'booked'
  | 'held'
  | 'ticketed'
  | 'hold_expired'
  | 'cancelled'
  | 'failed'
  | 'failed_supplier_booking'
  | 'ticketing_failed_refund_needed'
  | 'payment_failed'
  | 'payment_expired'
  | 'void_requested'
  | 'voided'
  | 'refund_requested';

/**
 * Standardized workflow summary shape (Phase 2).
 * Typed interface for new workflowSummary writes. The entity field remains
 * `unknown` for backward-compatible deserialization of existing data.
 * Use `as WorkflowSummary` when reading from the entity.
 */
export interface WorkflowSummaryStep {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  duration: number;
  error?: string;
}

export interface WorkflowSummary {
  ticketingMode?: 'hold_only' | 'ticket_after_payment';
  locatorCode?: string | null;
  ticketNumbers?: string[];
  steps?: WorkflowSummaryStep[];
  warnings?: string[];
  percent?: number;
  message?: string;
  createdAt?: string;
}

export interface FlightBookingEntity {
  id: string;
  publicRef?: string | null;
  provider: FlightsProviderKey;
  status: FlightBookingStatus;
  createdAt: string;
  updatedAt: string;

  offerSnapshot: {
    offerId: string;
    productId?: string;
    productIds?: string[];
    productSelections?: Array<{
      offeringId: string;
      productIds: string[];
    }>;
    seatProductIds?: string[];
    baggageProductIds?: string[];
    serviceProductIds?: string[];
    mealSelectionIds?: string[];
    catalogUuid?: string;
    offeringIdentifierValue?: string;
    searchKey?: string;
    sessionKey?: string;
    tripType?: 'one_way' | 'round_trip' | 'multi_city';
    returnDate?: string;
    legs?: Array<{ origin: string; destination: string; departureDate: string }>;
    from?: string;
    to?: string;
    departureDate?: string;
    selectedOfferContext?: Record<string, unknown>;
    /** Travelport content channel ('NDC' | 'GDS') — persisted for post-booking
     *  ops (cancel/retrieve/void) so they route to the correct channel. */
    contentSource?: string;
    /** Payload path used for this offer ('ndc' | 'gds'). */
    workflowKind?: string;
    /** Travelport offer identifier from the selected-offer cache — required for
     *  NDC cancellation (OfferQueryCancelOffer). */
    offerIdentifier?: string;
    // Unified ancillary selections (Phase 4)
    ancillaries?: {
      seats: Array<{
        type: 'seat';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        seatNumber: string;
        ancillaryProductId: string;
        catalogOfferingsIdentifier?: string;
        catalogOfferingIdentifierValue?: string;
        price: { amount: number; currency: string };
      }>;
      baggage: Array<{
        type: 'baggage';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        catalogOfferingIdentifier?: string;
        catalogOfferingsIdentifier?: string;
        label: string;
        baggageType: string;
        weight: string;
        pieces: number;
        price: { amount: number; currency: string };
      }>;
      meals: Array<{
        type: 'meal';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        mealCode: string;
        mealName: string;
        dietaryType: string;
        price: { amount: number; currency: string };
      }>;
      services: Array<{
        type: 'sports_equipment' | 'priority' | 'lounge' | 'wifi' | 'pet' | 'other';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        catalogOfferingIdentifier?: string;
        catalogOfferingsIdentifier?: string;
        label: string;
        serviceType: string;
        quantity: number;
        price: { amount: number; currency: string };
      }>;
    };
  };

  travelerSnapshot: Array<{
    givenName: string;
    surname: string;
    gender: string;
    birthDate: string;
    passengerTypeCode: string;
    phoneCountryCode: string;
    phoneNumber: string;
    email: string;
    // Optional travel document fields for international bookings
    documentNumber?: string;
    documentType?: string;
    issueCountry?: string;
    issueDate?: string;
    expiryDate?: string;
    nationality?: string;
    birthPlace?: string;
  }>;

  amount: number | null;
  /** Original supplier/base price before markup — used for price re-validation at confirm time */
  baseAmount: number | null;
  currency: string | null;

  // Manage Extras tracking (Phase 3)
  extrasStatus?: string;         // 'none' | 'pending' | 'confirmed' | 'partial'
  extrasTotalAmount?: number;
  extrasCurrency?: string;
  lastExtrasSyncAt?: string;

  // workflow refs
  workbenchId?: string;
  reservationId?: string;
  locatorCode?: string;
  holdExpiresAt?: string;
  /** Supplier-side hold deadline (Travelport PNR window). */
  supplierHoldExpiresAt?: string;
  /** Admin-set hold deadline (pay-later / bank-transfer window). */
  adminHoldExpiresAt?: string;
  /** Bank-transfer receipt screenshot URL (Cloudinary) for admin verification. */
  receiptUrl?: string;
  workflowSummary?: unknown;

  // error/debug
  message?: string;

  userId?: string;

  /** Display currency + exchange rate used when this booking was created —
   *  mirrors HotelBooking's rateSnapshot.chargeExchangeRate. Lets refunds/
   *  invoices reconstruct the exact amount shown to the customer without
   *  re-converting against today's possibly-different rate. */
  rateSnapshot?: { displayCurrency: string; displayExchangeRate: number } | null;
}

export type CreateFlightBookingInput = Omit<FlightBookingEntity, 'createdAt' | 'updatedAt'>;

export type UpdateFlightBookingInput = Partial<Pick<FlightBookingEntity, 'status' | 'amount' | 'baseAmount' | 'currency' | 'workbenchId' | 'reservationId' | 'locatorCode' | 'holdExpiresAt' | 'supplierHoldExpiresAt' | 'adminHoldExpiresAt' | 'receiptUrl' | 'workflowSummary' | 'message' | 'extrasStatus' | 'offerSnapshot' | 'rateSnapshot'>>;
