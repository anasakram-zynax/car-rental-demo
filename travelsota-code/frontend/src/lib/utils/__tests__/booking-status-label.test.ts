import { describe, it, expect } from 'vitest';
import { bookingStatusLabel } from '../booking-status-label';

describe('bookingStatusLabel', () => {
  it('unifies Travelport "held" to Confirmed', () => {
    expect(bookingStatusLabel('held')).toBe('Confirmed');
  });

  it('unifies default/Duffel "ticketed" to Confirmed', () => {
    expect(bookingStatusLabel('ticketed')).toBe('Confirmed');
  });

  it('unifies "booked" to Confirmed', () => {
    expect(bookingStatusLabel('booked')).toBe('Confirmed');
  });

  it('leaves an already-correct "confirmed" untouched', () => {
    expect(bookingStatusLabel('confirmed')).toBe('confirmed');
  });

  it('leaves an already-correct "CONFIRMED" untouched', () => {
    expect(bookingStatusLabel('CONFIRMED')).toBe('CONFIRMED');
  });

  it('leaves unrelated statuses untouched apart from underscore spacing', () => {
    expect(bookingStatusLabel('held_pending_payment')).toBe('held pending payment');
    expect(bookingStatusLabel('hold_expired')).toBe('hold expired');
    expect(bookingStatusLabel('failed')).toBe('failed');
  });

  it('returns an em dash for null/undefined/empty', () => {
    expect(bookingStatusLabel(null)).toBe('—');
    expect(bookingStatusLabel(undefined)).toBe('—');
    expect(bookingStatusLabel('')).toBe('—');
  });
});
