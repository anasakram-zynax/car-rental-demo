import { describe, it, expect, vi } from 'vitest';
import { cancelBooking } from '../cancel-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('cancelBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true });

    await cancelBooking({ bookingId: 'hb-1', reason: 'Guest request' });

    expect(apiRequest).toHaveBeenCalledWith('/hotels/bookings/hb-1/cancel', {
      method: 'POST',
      body: { reason: 'Guest request' },
      auth: true,
    });
  });

  it('omits reason when not provided', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ success: true });

    await cancelBooking({ bookingId: 'hb-1' });

    expect(apiRequest).toHaveBeenCalledWith('/hotels/bookings/hb-1/cancel', {
      method: 'POST',
      body: { reason: undefined },
      auth: true,
    });
  });

  it('propagates errors', async () => {
    const error = { statusCode: 400, message: 'Cannot cancel this booking' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(cancelBooking({ bookingId: 'hb-1' })).rejects.toEqual(error);
  });
});
