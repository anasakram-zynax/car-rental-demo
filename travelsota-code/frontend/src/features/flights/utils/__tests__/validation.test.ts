import { describe, it, expect } from 'vitest';
import { validateSearchInput, validateTravelerInput } from '@/features/flights/utils/validation';

describe('validateSearchInput', () => {
  it('returns error when from is empty', () => {
    const result = validateSearchInput({ from: '', to: 'LHR', departureDate: '2026-06-10' });
    expect(result).toBe('From, To, and Departure Date are required.');
  });

  it('returns error when to is empty', () => {
    const result = validateSearchInput({ from: 'JFK', to: '', departureDate: '2026-06-10' });
    expect(result).toBe('From, To, and Departure Date are required.');
  });

  it('returns error when date is invalid', () => {
    const result = validateSearchInput({ from: 'JFK', to: 'LHR', departureDate: 'not-a-date' });
    expect(result).toBe('Departure Date must be YYYY-MM-DD.');
  });

  it('returns error when from and to are identical', () => {
    const result = validateSearchInput({ from: 'KHI', to: 'khi', departureDate: '2026-06-10' });
    expect(result).toBe('Origin and destination cannot be the same.');
  });

  it('returns null for valid input', () => {
    const result = validateSearchInput({ from: 'JFK', to: 'LHR', departureDate: '2026-06-10' });
    expect(result).toBeNull();
  });
});

describe('validateTravelerInput', () => {
  it('returns error when name is missing', () => {
    const result = validateTravelerInput({
      givenName: '', surname: '', birthDate: '1990-01-01',
      email: 'a@b.com', phoneCountryCode: '1', phoneNumber: '123',
    });
    expect(result).toBe('Given name and surname are required.');
  });

  it('returns error when birth date is invalid', () => {
    const result = validateTravelerInput({
      givenName: 'John', surname: 'Doe', birthDate: 'bad-date',
      email: 'a@b.com', phoneCountryCode: '1', phoneNumber: '123',
    });
    expect(result).toBe('Birth date must be YYYY-MM-DD.');
  });

  it('returns error when email is missing', () => {
    const result = validateTravelerInput({
      givenName: 'John', surname: 'Doe', birthDate: '1990-01-01',
      email: '', phoneCountryCode: '1', phoneNumber: '123',
    });
    expect(result).toBe('Email is required.');
  });

  it('returns null for valid input', () => {
    const result = validateTravelerInput({
      givenName: 'John', surname: 'Doe', birthDate: '1990-01-01',
      email: 'john@example.com', phoneCountryCode: '92', phoneNumber: '3001234567',
    });
    expect(result).toBeNull();
  });
});
