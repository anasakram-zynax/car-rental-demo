import { describe, it, expect, vi } from 'vitest';
import { searchFlights } from '../search-flights';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  from: 'JFK',
  to: 'LHR',
  departureDate: '2026-06-10',
  adults: 1,
  tripType: 'one_way' as const,
  cabinClass: 'Economy' as const,
};

describe('searchFlights', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ offers: [] });

    await searchFlights(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/search', {
      method: 'POST',
      body: mockInput,
    });
  });

  it('returns the search view from apiRequest', async () => {
    const expected = { offers: [{ id: 'offer-1', price: { total: 450, currency: 'USD' } }], searchKey: 'sk-1' };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await searchFlights(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates apiRequest errors', async () => {
    const error = { statusCode: 500, message: 'Search failed' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(searchFlights(mockInput)).rejects.toEqual(error);
  });
});
