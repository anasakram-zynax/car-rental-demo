import { isEmailLike, sanitizeBookingReference } from './booking-reference.util';

describe('isEmailLike', () => {
  it('recognizes a plain email address', () => {
    expect(isEmailLike('guest@example.com')).toBe(true);
  });

  it('recognizes an email with surrounding whitespace', () => {
    expect(isEmailLike('  guest@example.com  ')).toBe(true);
  });

  it('does not flag a real PNR', () => {
    expect(isEmailLike('HN4JTG')).toBe(false);
  });

  it('does not flag a fake PNR', () => {
    expect(isEmailLike('TP-DEV/A1B2C3')).toBe(false);
  });

  it('does not flag an internal publicRef', () => {
    expect(isEmailLike('TQ-2026-000123')).toBe(false);
  });

  it('handles null/undefined/empty', () => {
    expect(isEmailLike(null)).toBe(false);
    expect(isEmailLike(undefined)).toBe(false);
    expect(isEmailLike('')).toBe(false);
  });
});

describe('sanitizeBookingReference', () => {
  it('passes through a real PNR unchanged', () => {
    expect(sanitizeBookingReference('HN4JTG')).toBe('HN4JTG');
  });

  it('passes through a non-email clientReference (agent/manual bookings)', () => {
    expect(sanitizeBookingReference('agent-1700000000000')).toBe(
      'agent-1700000000000',
    );
  });

  it('strips an email-shaped reference to null', () => {
    expect(sanitizeBookingReference('guest@example.com')).toBeNull();
  });

  it('returns null for null/undefined/empty input', () => {
    expect(sanitizeBookingReference(null)).toBeNull();
    expect(sanitizeBookingReference(undefined)).toBeNull();
    expect(sanitizeBookingReference('')).toBeNull();
  });
});
