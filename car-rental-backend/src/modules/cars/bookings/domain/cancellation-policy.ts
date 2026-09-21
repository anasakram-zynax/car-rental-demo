import { InvalidBookingTransitionError } from './booking-errors.js';

const CANCELLATION_WINDOW_HOURS = 24;

export function assertCancellationAllowed(
  pickupAt: Date,
  currentTime: Date,
): void {
  const millisecondsUntilPickup = pickupAt.getTime() - currentTime.getTime();

  const minimumCancellationWindow = CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;

  if (millisecondsUntilPickup < minimumCancellationWindow) {
    throw new InvalidBookingTransitionError(
      'Booking can only be cancelled at least 24 hours before pickup.',
    );
  }
}
