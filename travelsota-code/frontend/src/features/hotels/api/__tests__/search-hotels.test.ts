import { describe, it, expect, vi } from 'vitest';
import { searchHotels } from '../search-hotels';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  checkIn: '2026-07-01',
  checkOut: '2026-07-05',
  occupancies: [{ rooms: 1, adults: 2, children: 0 }],
  destinationCode: 'NYC',
};

describe('searchHotels', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ hotels: [] });

    await searchHotels(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/hotels/search', {
      method: 'POST',
      body: mockInput,
    });
  });

  it('returns the hotel search view', async () => {
    const expected = { hotels: [{ code: 123, name: 'Test Hotel' }], currency: 'USD' };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await searchHotels(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 500, message: 'Search failed' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(searchHotels(mockInput)).rejects.toEqual(error);
  });
});
