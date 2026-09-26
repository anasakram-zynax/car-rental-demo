import { describe, it, expect, vi } from 'vitest';
import { getHotelBooking } from '../get-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('getHotelBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      id: 'hb-1', status: 'booked', rateKey: 'rk-1',
      holder: { name: 'John', surname: 'Doe' },
      clientReference: 'ref-1', paxes: [],
      amount: 350, currency: 'USD',
      reference: 'REF123', hotelStatus: 'CONFIRMED',
      hotel: null, message: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    });

    await getHotelBooking('hb-1');

    expect(apiRequest).toHaveBeenCalledWith('/hotels/bookings/hb-1', {
      method: 'GET',
      auth: true,
    });
  });

  it('returns the hotel booking detail', async () => {
    const expected = {
      id: 'hb-1', status: 'booked', rateKey: 'rk-1',
      holder: { name: 'John', surname: 'Doe' },
      clientReference: 'ref-1', paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
      amount: 350, currency: 'USD', reference: 'REF123',
      hotelStatus: 'CONFIRMED', hotel: { name: 'Test Hotel' }, message: null,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await getHotelBooking('hb-1');

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 404, message: 'Hotel booking not found' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(getHotelBooking('invalid')).rejects.toEqual(error);
  });
});
