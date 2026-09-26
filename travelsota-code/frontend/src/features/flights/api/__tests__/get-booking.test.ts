import { describe, it, expect, vi } from 'vitest';
import { getBooking } from '../get-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('getBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: 'b-1', status: 'booked', provider: 'travelport', amount: 450, currency: 'USD', createdAt: '2026-01-01', updatedAt: '2026-01-01' });

    await getBooking('b-1');

    expect(apiRequest).toHaveBeenCalledWith('/flights/bookings/b-1', {
      method: 'GET',
      auth: true,
    });
  });

  it('returns the booking detail', async () => {
    const expected = {
      id: 'b-1', provider: 'travelport', status: 'booked' as const,
      amount: 450, currency: 'USD', locatorCode: 'ABC123',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await getBooking('b-1');

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 404, message: 'Booking not found' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(getBooking('b-1')).rejects.toEqual(error);
  });
});
