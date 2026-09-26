import { describe, it, expect, vi } from 'vitest';
import { checkoutBooking } from '../checkout-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  offerId: 'offer-1',
  productId: 'product-1',
  catalogUuid: 'cat-1',
  from: 'JFK',
  to: 'LHR',
  departureDate: '2026-06-10',
  searchKey: 'sk-1',
  totalPrice: 450,
  currency: 'USD',
  travelers: [{
    givenName: 'John', surname: 'Doe', gender: 'Male' as const,
    birthDate: '1990-01-01', passengerTypeCode: 'ADT' as const,
    phoneCountryCode: '1', phoneNumber: '1234567890', email: 'john@test.com',
  }],
  gateway: 'STRIPE' as const,
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel',
};

describe('checkoutBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      bookingId: 'b-1', paymentId: 'p-1', amount: 450, currency: 'USD',
      clientSecret: 'cs_secret', checkoutUrl: null,
    });

    await checkoutBooking(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/bookings/checkout', {
      method: 'POST',
      body: mockInput,
      auth: true,
    });
  });

  it('returns the checkout response with clientSecret', async () => {
    const expected = {
      bookingId: 'b-1', paymentId: 'p-1', amount: 450, currency: 'USD',
      clientSecret: 'cs_secret', checkoutUrl: null,
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await checkoutBooking(mockInput);

    expect(result).toEqual(expected);
  });

  it('returns the checkout response with checkoutUrl for PayPal', async () => {
    const paypalInput = { ...mockInput, gateway: 'PAYPAL' as const };
    const expected = {
      bookingId: 'b-1', paymentId: 'p-1', amount: 450, currency: 'USD',
      clientSecret: null, checkoutUrl: 'https://paypal.com/checkout',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await checkoutBooking(paypalInput);

    expect(result.clientSecret).toBeNull();
    expect(result.checkoutUrl).toBe('https://paypal.com/checkout');
  });

  it('propagates errors', async () => {
    const error = { statusCode: 402, message: 'Payment failed' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(checkoutBooking(mockInput)).rejects.toEqual(error);
  });
});
