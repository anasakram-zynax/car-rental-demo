import { describe, it, expect, vi } from 'vitest';
import { bookHotel } from '../book-hotel';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  rateKey: 'rk-1',
  clientReference: 'ref-1',
  holder: { name: 'John', surname: 'Doe' },
  paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
};

describe('bookHotel', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ bookingId: 'hb-1', status: 'booked' });

    await bookHotel(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/hotels/book', {
      method: 'POST',
      body: mockInput,
      auth: true,
    });
  });

  it('returns the booking response', async () => {
    const expected = { bookingId: 'hb-1', status: 'booked', reference: 'ABC123' };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await bookHotel(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 409, message: 'Rate expired' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(bookHotel(mockInput)).rejects.toEqual(error);
  });
});
