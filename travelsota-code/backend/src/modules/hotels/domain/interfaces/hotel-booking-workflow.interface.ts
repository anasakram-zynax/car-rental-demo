/**
 * Provider-neutral hotel booking workflow interface.
 *
 * Each hotel provider (Hotelbeds, RateHawk, future providers) implements
 * this interface to abstract the differences between their booking flows:
 *
 * - Hotelbeds: Synchronous AT_WEB booking (books AFTER payment)
 * - RateHawk:  Asynchronous webhook-driven booking (books BEFORE payment)
 *
 * The booking service calls these methods at the appropriate lifecycle points
 * without needing provider-specific branching logic.
 */

export interface HotelReservationInput {
  bookingId: string;
  searchKey: string;
  hotelId: string;
  providerHotelId: string;
  rateId: string;
  holder: Record<string, unknown>;
  clientReference: string;
  paxes: Array<{
    roomId: string;
    type: 'ADULT' | 'CHILD';
    name: string;
    surname: string;
  }>;
  currency?: string;
}

export interface HotelReservationResult {
  ok: boolean;
  status: 'booked' | 'held' | 'processing' | 'failed';
  supplierReference?: string | null;
  supplierOrderId?: string | null;
  supplierItemId?: string | null;
  supplierStatus?: string | null;
  prebookToken?: string | null;
  partnerOrderId?: string | null;
  message?: string;
  raw?: unknown;
}

export interface HotelBookingStatusResult {
  status: string;
  supplierStatus?: string;
}

export interface HotelCancelResult {
  ok: boolean;
  status: string;
  message?: string;
  raw?: unknown;
}

export interface HotelBookingWorkflow {
  /** Unique provider key (e.g., 'hotelbeds', 'ratehawk'). */
  readonly provider: string;

  /**
   * Whether this provider books BEFORE or AFTER payment.
   *
   * - 'PRE_PAYMENT': Supplier reservation is created before payment (RateHawk).
   *   Payment success triggers confirmation, not booking.
   *
   * - 'POST_PAYMENT': Supplier reservation is created after payment succeeds (Hotelbeds).
   *   Payment success triggers the actual supplier booking call.
   */
  readonly bookingTiming: 'PRE_PAYMENT' | 'POST_PAYMENT';

  /** Create the supplier reservation. */
  createReservation(input: HotelReservationInput): Promise<HotelReservationResult>;

  /** Check reservation status with the supplier. */
  checkStatus(bookingId: string, partnerOrderId?: string): Promise<HotelBookingStatusResult>;

  /** Cancel reservation with the supplier. */
  cancelReservation(bookingId: string, supplierReference: string, reason?: string): Promise<HotelCancelResult>;
}

export const HotelBookingWorkflowToken = Symbol('HotelBookingWorkflow');
