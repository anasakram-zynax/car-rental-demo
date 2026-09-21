import { InvalidBookingDateError } from './booking-errors.js';

export interface DateRange {
  start: Date;
  end: Date;
}

export function validateDateRange(start: Date, end: Date): void {
  if (end <= start) {
    throw new InvalidBookingDateError('Return date must be after pickup date.');
  }
}

export function dateRangesOverlap(
  first: DateRange,
  second: DateRange,
): boolean {
  return first.start < second.end && first.end > second.start;
}

export function calculateRentalDays(pickupAt: Date, returnAt: Date): number {
  validateDateRange(pickupAt, returnAt);

  const milliseconds = returnAt.getTime() - pickupAt.getTime();

  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.ceil(milliseconds / millisecondsPerDay);
}
