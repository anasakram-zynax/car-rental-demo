import { describe, it, expect, vi } from 'vitest';
import { checkRateApi } from '../check-rate';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('checkRateApi', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ currency: 'USD', rooms: [] });

    await checkRateApi({ rateKey: 'rk-1' });

    expect(apiRequest).toHaveBeenCalledWith('/hotels/check-rate', {
      method: 'POST',
      body: { rateKey: 'rk-1' },
    });
  });

  it('returns the rate check response', async () => {
    const expected = {
      currency: 'USD',
      rooms: [{ code: 'DBL', name: 'Double', rates: [{ rateKey: 'rk-1', net: '350.00', adults: 2 }] }],
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await checkRateApi({ rateKey: 'rk-1' });

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 404, message: 'Rate key not found' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(checkRateApi({ rateKey: 'invalid' })).rejects.toEqual(error);
  });
});
