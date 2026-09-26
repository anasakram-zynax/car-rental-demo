import { describe, it, expect, vi } from 'vitest';
import { getCancelEstimate } from '../cancel-estimate';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('getCancelEstimate', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      bookingId: 'hb-1',
      bookingType: 'HOTEL',
      status: 'booked',
      totalAmount: 350,
      currency: 'EUR',
      cancellationFee: 50,
      refundAmount: 300,
      isFreeCancellation: false,
      policyDescription: 'Cancellation: 50',
    });

    await getCancelEstimate('hb-1');

    expect(apiRequest).toHaveBeenCalledWith('/hotels/bookings/hb-1/cancel-estimate', {
      method: 'GET',
      auth: true,
    });
  });

  it('propagates errors', async () => {
    const error = { statusCode: 400, message: 'Booking not cancellable' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(getCancelEstimate('hb-1')).rejects.toEqual(error);
  });
});
