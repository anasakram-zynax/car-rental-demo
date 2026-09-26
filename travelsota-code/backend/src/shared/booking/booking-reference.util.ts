/**
 * Guards the "reference"/PNR field shown to admins, agents and customers.
 *
 * Some supplier-tracking fields (e.g. HotelBooking.clientReference, which the
 * public checkout sets to the guest's email so RateHawk/Hotelbeds can key the
 * booking) were never meant to be displayed as a booking reference — they
 * only leaked into the reference column when a booking failed before a real
 * or fake PNR existed to fall back to. This strips anything email-shaped
 * before it reaches a reference field, so the column shows a real PNR, a
 * fake PNR, or nothing — never a customer's email address.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value?: string | null): boolean {
  return !!value && EMAIL_PATTERN.test(value.trim());
}

/** Returns `value` unless it looks like an email address, in which case null. */
export function sanitizeBookingReference(value?: string | null): string | null {
  if (!value) return null;
  return isEmailLike(value) ? null : value;
}
