import { Logger } from '@nestjs/common';

/**
 * Shared booking state machine for all booking types (flights, hotels).
 *
 * Every status transition MUST go through `canTransition()` or `transition()`
 * to prevent invalid state changes. This centralizes the previously-scattered
 * status logic across flight-payment.listener, hotel-payment.listener,
 * ratehawk-webhook.service, and ratehawk-booking-status-fallback.service.
 */

// ── All valid booking statuses ────────────────────────────────────

export type BookingStatus =
  | 'pending_payment'
  | 'held_pending_payment'
  | 'payment_processing'
  | 'awaiting_issue'
  | 'booking_in_progress'
  | 'held'
  | 'booked'
  | 'ticketed'
  | 'cancelled'
  | 'cancellation_requested'
  | 'void_requested'
  | 'voided'
  | 'refund_requested'
  | 'failed'
  | 'failed_supplier_booking'
  | 'failed_payment'
  | 'hold_expired'
  | 'refund_pending'
  | 'refunded'
  | 'ticketing_failed_refund_needed'
  | 'payment_failed'
  | 'payment_expired';

// ── Valid transitions ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending_payment:           ['held_pending_payment', 'payment_processing', 'booking_in_progress', 'awaiting_issue', 'cancelled', 'failed', 'payment_failed', 'payment_expired'],
  held_pending_payment:      ['payment_processing', 'booking_in_progress', 'held', 'awaiting_issue', 'hold_expired', 'cancelled', 'failed', 'payment_failed', 'payment_expired'],
  payment_processing:        ['booking_in_progress', 'awaiting_issue', 'failed', 'failed_payment', 'cancelled'],
  // Auto-Issue After Payment is off: payment succeeded, admin must click
  // Issue. Never a supplier-confirmed state — the same admin-issue call
  // (ticketBooking/confirm) that would have run automatically now waits
  // for booking_in_progress to be claimed by hand.
  awaiting_issue:            ['booking_in_progress', 'held', 'cancelled', 'failed', 'payment_failed'],
  booking_in_progress:       ['held', 'booked', 'failed', 'failed_supplier_booking', 'held_pending_payment', 'ticketed', 'ticketing_failed_refund_needed'],
  held:                      ['ticketed', 'booking_in_progress', 'awaiting_issue', 'failed', 'cancelled', 'payment_failed'],
  booked:                    ['cancelled', 'cancellation_requested', 'refund_pending', 'failed', 'void_requested'],
  ticketed:                  ['cancelled', 'refund_pending', 'void_requested', 'refund_requested'],
  cancellation_requested:    ['cancelled', 'booked'],
  void_requested:            ['voided', 'failed'],
  voided:                    ['refund_pending'],
  refund_requested:          ['refund_pending', 'failed'],
  hold_expired:              [],
  cancelled:                 ['refund_pending', 'refunded'],
  failed:                    ['pending_payment', 'refund_pending'],
  failed_supplier_booking:   ['refund_pending', 'pending_payment'],
  failed_payment:            ['pending_payment'],
  refund_pending:            ['refunded', 'failed'],
  refunded:                  [],
  ticketing_failed_refund_needed: ['refund_pending', 'cancelled'],
  payment_failed:            ['cancelled', 'refund_pending'],
  payment_expired:           ['cancelled', 'refund_pending'],
};

// ── Terminal statuses (no further transitions expected) ────────────

const TERMINAL_STATUSES: ReadonlySet<BookingStatus> = new Set([
  'ticketed',
  'refunded',
]);

// ── Supplier status classification (centralized) ──────────────────

/**
 * Supplier webhook/API status strings → our internal classification.
 * Used by ratehawk-webhook.service, ratehawk-booking-status-fallback.service,
 * and any future provider adapters.
 */
const SUPPLIER_SUCCESS_STATES = ['confirmed', 'ok', 'booked', 'completed'];
const SUPPLIER_FAILURE_STATES = ['failed', 'error', 'cancelled'];
const SUPPLIER_PENDING_STATES = ['processing', 'pending', '3ds', 'waiting_webhook'];

export type SupplierStatusClassification = 'success' | 'failure' | 'pending' | 'unknown';

/**
 * Classify a raw supplier status string into a normalized category.
 */
export function classifySupplierStatus(status: string | null | undefined): SupplierStatusClassification {
  const normalized = (status ?? '').toLowerCase().trim();
  if (!normalized) return 'unknown';
  if (SUPPLIER_SUCCESS_STATES.includes(normalized)) return 'success';
  if (SUPPLIER_FAILURE_STATES.includes(normalized)) return 'failure';
  if (SUPPLIER_PENDING_STATES.includes(normalized)) return 'pending';
  return 'unknown';
}

// ── State machine API ─────────────────────────────────────────────

const logger = new Logger('BookingStateMachine');

/**
 * Check whether a transition from `fromStatus` to `toStatus` is valid.
 */
export function canTransition(fromStatus: string, toStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[fromStatus as BookingStatus];
  if (!allowed) return false;
  return allowed.includes(toStatus as BookingStatus);
}

/**
 * Assert that a transition is valid. Logs a warning and returns false if not.
 * Does NOT throw — callers can decide whether to enforce or just log.
 */
export function assertTransition(fromStatus: string, toStatus: string): boolean {
  if (canTransition(fromStatus, toStatus)) return true;

  logger.warn(
    `[STATE_MACHINE] Invalid transition: ${fromStatus} → ${toStatus}. ` +
    `Allowed: ${VALID_TRANSITIONS[fromStatus as BookingStatus]?.join(', ') ?? 'NONE (unknown source status)'}`,
  );
  return false;
}

/**
 * Get all statuses that are considered "success" from the supplier's perspective.
 * Bookings in these statuses are fully confirmed with the supplier.
 */
export const BOOKED_STATUSES: ReadonlySet<string> = new Set(['booked', 'held', 'ticketed']);

/**
 * Get all statuses that are considered terminal (booking lifecycle complete).
 */
export { TERMINAL_STATUSES };

/**
 * Get all statuses that represent a failure requiring refund.
 */
export const REFUND_REQUIRED_STATUSES: ReadonlySet<string> = new Set([
  'failed_supplier_booking',
  'failed',
]);

/**
 * Check if a booking status represents a successful booking.
 */
export function isBookingSuccess(status: string | undefined | null): boolean {
  if (!status) return false;
  return BOOKED_STATUSES.has(status);
}

/**
 * Check if a booking status represents a terminal state (no more transitions expected).
 */
export function isBookingTerminal(status: string | undefined | null): boolean {
  if (!status) return false;
  return TERMINAL_STATUSES.has(status as BookingStatus);
}

/**
 * Check if a booking status represents a failure.
 */
export function isBookingFailure(status: string | undefined | null): boolean {
  if (!status) return false;
  const s = status as BookingStatus;
  return s === 'failed' || s === 'failed_supplier_booking' || s === 'failed_payment' || s === 'payment_failed' || s === 'payment_expired';
}

/**
 * Check if a booking status represents a pending state (processing, not yet resolved).
 */
export function isBookingPending(status: string | undefined | null): boolean {
  if (!status) return false;
  const s = status as BookingStatus;
  return s === 'pending_payment' || s === 'held_pending_payment' || s === 'payment_processing' || s === 'booking_in_progress' || s === 'awaiting_issue';
}

/**
 * Payment succeeded but Auto-Issue After Payment is off — the booking is not
 * supplier-confirmed yet (isBookingPending is still true), but display layers
 * should show it as a payment-received success variant, not a spinner: same
 * distinction the fake-settlement grace window already draws for a different
 * reason (see isFakeSettlementPending in the flight/hotel services).
 */
export function isAwaitingManualIssue(status: string | undefined | null): boolean {
  return status === 'awaiting_issue';
}
