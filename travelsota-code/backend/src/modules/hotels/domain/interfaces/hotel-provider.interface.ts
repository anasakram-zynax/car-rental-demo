import type {
  ProviderStatus,
  HotelSearchInput,
  NormalizedHotelSearchResponse,
  HotelDetailsInput,
  NormalizedHotelDetailsResponse,
  HotelRateValidationInput,
  ValidatedHotelRate,
  HotelCreateBookingInput,
  HotelSupplierBookingResult,
  HotelBookingStatusInput,
  HotelSupplierBookingStatus,
  HotelRetrieveBookingInput,
  HotelSupplierBookingDetails,
  HotelCancelBookingInput,
  HotelSupplierCancelResult,
  HotelChangeBookingInput,
  HotelSupplierChangeResult,
} from '../types/hotel-provider.types';

/**
 * Capability flags each hotel provider declares so the booking pipeline
 * can decide whether to hold-before-pay, book-after-auth, etc.
 */
export interface HotelProviderCapabilityFlags {
  /** Provider can create a booking/reservation without immediate payment */
  supportsPrePaymentHold: boolean;
  /** Provider can cancel/void a held or confirmed booking */
  supportsHoldCancellation: boolean;
  /** Provider requires payment before any supplier interaction */
  requiresInstantPayment: boolean;
  /**
   * What validateRate().supplierAmount represents:
   *  - false (default): TOTAL for the whole stay (Hotelbeds checkrate net,
   *    RateHawk prebook price, Amadeus offer.price.total — all stay totals).
   *  - true: per-night rate — the booking pipeline multiplies by the night
   *    count to derive the stay total.
   * Multiplying stay totals by nights overcharged multi-night bookings.
   */
  ratesArePerNight?: boolean;
}

/**
 * Provider-neutral contract for hotel suppliers.
 *
 * Each hotel provider (Hotelbeds, RateHawk, etc.) implements this interface,
 * and the HotelsProviderRegistryService resolves the active one.
 */
export interface HotelProvider {
  /** Unique provider key, used for routing and config lookups */
  readonly key: 'hotelbeds' | 'ratehawk' | 'amadeus' | 'travelport-stays' | 'manual';

  /** Capability flags for this provider */
  readonly capabilities: HotelProviderCapabilityFlags;

  /** Health check / connection test */
  checkStatus(): Promise<ProviderStatus>;

  /** Search for available hotels */
  search(input: HotelSearchInput): Promise<NormalizedHotelSearchResponse>;

  /** Get full hotel details and live rates for a specific hotel */
  getHotelDetails(input: HotelDetailsInput): Promise<NormalizedHotelDetailsResponse>;

  /** Validate a selected rate (checkrates / prebook) */
  validateRate(input: HotelRateValidationInput): Promise<ValidatedHotelRate>;

  /** Create a booking with the supplier */
  createBooking(input: HotelCreateBookingInput): Promise<HotelSupplierBookingResult>;

  /** Poll for async booking status (optional — some providers are synchronous) */
  checkBookingStatus?(input: HotelBookingStatusInput): Promise<HotelSupplierBookingStatus>;

  /** Retrieve full booking details from the supplier */
  retrieveBooking(input: HotelRetrieveBookingInput): Promise<HotelSupplierBookingDetails>;

  /** Cancel a confirmed booking with the supplier */
  cancelBooking(input: HotelCancelBookingInput): Promise<HotelSupplierCancelResult>;

  /** Change/modify a confirmed booking with the supplier (optional). */
  changeBooking?(input: HotelChangeBookingInput): Promise<HotelSupplierChangeResult>;
}
