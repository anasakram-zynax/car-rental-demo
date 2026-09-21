import { InvalidBookingTransitionError } from './booking-errors.js';

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
}

export function assertCanCancelBooking(currentStatus: BookingStatus): void {
  if (currentStatus !== BookingStatus.CONFIRMED) {
    throw new InvalidBookingTransitionError(
      `Booking cannot be cancelled from status "${currentStatus}".`,
    );
  }
}
