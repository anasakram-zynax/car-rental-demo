import { assertCanCancelBooking, BookingStatus } from './booking-status.js';

describe('BookingStatus', () => {
  it('should allow confirmed booking cancellation', () => {
    expect(() => assertCanCancelBooking(BookingStatus.CONFIRMED)).not.toThrow();
  });

  it('should reject cancelling an already cancelled booking', () => {
    expect(() => assertCanCancelBooking(BookingStatus.CANCELLED)).toThrow();
  });
});
