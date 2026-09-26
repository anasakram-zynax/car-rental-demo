import { describe, it, expect, vi } from 'vitest';
import { fetchAncillaryPrice } from '../ancillaries';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  offerId: 'offer-1',
  productId: 'product-1',
  catalogUuid: 'cat-1',
  seatProductIds: ['seat:{"seat":"12A","flightLabel":"EK001","brand":"Economy","priceText":"25.00 USD"}'],
  baggageProductIds: ['baggage:{"productId":"BG-1","label":"Extra 23kg","priceText":"50.00 USD"}'],
};

describe('fetchAncillaryPrice', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await fetchAncillaryPrice(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/ancillaries/price', {
      method: 'POST',
      body: mockInput,
    });
  });

  it('returns the ancillary price response', async () => {
    const expected = [{ productId: 'P1', price: { total: 25, currency: 'USD' } }];
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await fetchAncillaryPrice(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 500, message: 'Ancillary price request failed' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(fetchAncillaryPrice(mockInput)).rejects.toEqual(error);
  });

  it('works without seat or baggage IDs', async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await fetchAncillaryPrice({ offerId: 'offer-1', productId: 'product-1' });

    expect(apiRequest).toHaveBeenCalled();
  });
});
