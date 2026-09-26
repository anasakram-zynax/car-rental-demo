import { describe, it, expect, vi } from 'vitest';
import { hotelCheckout } from '../hotel-checkout';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  rateKey: 'rk-1',
  holder: { name: 'John', surname: 'Doe' },
  clientReference: 'ref-1',
  paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
  gateway: 'STRIPE' as const,
};

describe('hotelCheckout', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      bookingId: 'hb-1', paymentId: 'p-1', amount: 350, currency: 'USD',
      clientSecret: 'cs_secret', checkoutUrl: undefined,
    });

    await hotelCheckout(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/hotels/bookings/checkout', {
      method: 'POST',
      body: mockInput,
      auth: true,
    });
  });

  it('returns checkout response with clientSecret for Stripe', async () => {
    const expected = {
      bookingId: 'hb-1', paymentId: 'p-1', amount: 350, currency: 'USD',
      clientSecret: 'cs_secret',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await hotelCheckout(mockInput);

    expect(result.clientSecret).toBe('cs_secret');
  });

  it('returns checkout response with checkoutUrl for PayPal', async () => {
    const paypalInput = { ...mockInput, gateway: 'PAYPAL' as const };
    const expected = {
      bookingId: 'hb-1', paymentId: 'p-1', amount: 350, currency: 'USD',
      checkoutUrl: 'https://paypal.com/checkout',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await hotelCheckout(paypalInput);

    expect(result.checkoutUrl).toBe('https://paypal.com/checkout');
  });

  it('propagates errors', async () => {
    const error = { statusCode: 402, message: 'Payment declined' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(hotelCheckout(mockInput)).rejects.toEqual(error);
  });
});
