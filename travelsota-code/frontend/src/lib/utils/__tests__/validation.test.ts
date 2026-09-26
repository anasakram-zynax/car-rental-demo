import { describe, expect, it } from 'vitest';
import {
  MIN_BOOKING_AGE,
  isValidDateOfBirth,
  isValidPassportExpiry,
  isValidPhone,
  normalizePhoneParts,
} from '@/lib/utils/validation';

const dialCodes = ['+1', '+44', '+92', '+971'];

describe('booking phone validation', () => {
  it('normalizes a pasted international number and avoids duplicating the code', () => {
    expect(normalizePhoneParts('+1', '+971 50 123 4567', dialCodes)).toEqual({
      countryCode: '971',
      subscriberNumber: '501234567',
      e164: '+971501234567',
    });
  });

  it('supports the 00 international prefix and local trunk zero', () => {
    expect(normalizePhoneParts('+44', '0044 20 8016 0508', dialCodes).e164).toBe('+442080160508');
    expect(normalizePhoneParts('+44', '020 8016 0508', dialCodes).e164).toBe('+442080160508');
  });

  it('accepts formatting characters but rejects letters and invalid lengths', () => {
    expect(isValidPhone('+971', '50 123 4567', dialCodes)).toBe(true);
    expect(isValidPhone('+971', '50ABC4567', dialCodes)).toBe(false);
    expect(isValidPhone('+971', '123', dialCodes)).toBe(false);
  });

  it('accepts a spaced 00 prefix and rejects malformed punctuation or unknown codes', () => {
    expect(normalizePhoneParts('+1', '00 971 50 123 4567', dialCodes).e164).toBe('+971501234567');
    expect(isValidPhone('+971', '++971 50 123 4567', dialCodes)).toBe(false);
    expect(isValidPhone('+971', '(50) 123 4567', dialCodes)).toBe(true);
    expect(isValidPhone('+971', '50) 123(4567', dialCodes)).toBe(false);
    expect(isValidPhone('+999', '50 123 4567', dialCodes)).toBe(false);
  });
});

describe('booking date validation', () => {
  it('rejects impossible or future dates of birth', () => {
    expect(isValidDateOfBirth('31', 'Feb', '1990')).toBe(false);
    expect(isValidDateOfBirth('01', 'Jan', '2099')).toBe(false);
    expect(isValidDateOfBirth('15', 'May', '1990')).toBe(true);
  });

  it('requires the guest to meet the minimum booking age', () => {
    const thisYear = new Date().getUTCFullYear();
    expect(isValidDateOfBirth('01', 'Jan', String(thisYear - (MIN_BOOKING_AGE - 2)))).toBe(false);
    expect(isValidDateOfBirth('01', 'Jan', String(thisYear - (MIN_BOOKING_AGE + 2)))).toBe(true);
  });

  it('requires passport expiry to be a real date after today', () => {
    expect(isValidPassportExpiry('31', 'Feb', '2099')).toBe(false);
    expect(isValidPassportExpiry('01', 'Jan', '2000')).toBe(false);
    expect(isValidPassportExpiry('01', 'Jan', '2099')).toBe(true);
  });
});
