/**
 * Canonical booking-status DISPLAY label.
 *
 * Suppliers settle a completed booking under different internal statuses —
 * Travelport leaves it "held", Duffel/default leaves it "ticketed", ATS/hotel
 * leaves it "booked"/"CONFIRMED". That's fine behind the scenes (business
 * logic, transitions, and hold-expiry still key off the real status), but
 * every dashboard — admin, agent, customer — should show one word for it:
 * "Confirmed". This is the single place that unification lives; components
 * that render a booking status for a human should call this for the label
 * text (colors/variants can still vary per component).
 */
// 'confirmed'/'CONFIRMED' are already the target label as-is (just cased
// differently in different callers) — left untouched here on purpose so this
// stays a no-op for anything that was already showing the right word.
const CONFIRMED_ALIASES = new Set([
  'held', 'HELD',
  'ticketed', 'TICKETED',
  'booked', 'BOOKED',
]);

export function bookingStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  if (CONFIRMED_ALIASES.has(status)) return 'Confirmed';
  // Unchanged fallback for every other status (including non-booking ones —
  // this helper is called from the shared, generic StatusBadge) so this stays
  // display-only for bookings and doesn't restyle unrelated status badges.
  return status.replace(/_/g, ' ');
}
