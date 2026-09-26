import { describe, it, expect, vi } from 'vitest';
import { getOfferDetailView } from '../get-offer-detail-view';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  offerId: 'off_00001',
  searchKey: 'sk_test',
  provider: 'duffel' as const,
  catalogUuid: 'cat_1',
  offerData: { some: 'data' },
};

describe('getOfferDetailView', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ detailAvailable: false });

    await getOfferDetailView(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/offers/detail', {
      method: 'POST',
      body: mockInput,
    });
  });

  it('returns the detail view from apiRequest', async () => {
    const expected = {
      offerId: 'off_00001',
      detailAvailable: true,
      detailView: {
        offerId: 'off_00001',
        provider: 'duffel',
        route: { from: { code: 'JFK', label: 'JFK' }, to: { code: 'LHR', label: 'LHR' }, tripType: 'one_way' },
        journeys: [],
        fare: {},
        pricing: { currency: 'USD' },
        airline: {},
      },
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await getOfferDetailView(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates apiRequest errors', async () => {
    const error = { statusCode: 500, message: 'Failed to generate detail view' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(getOfferDetailView(mockInput)).rejects.toEqual(error);
  });
});
