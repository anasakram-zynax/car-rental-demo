import { describe, it, expect, vi } from 'vitest';
import { retrieveBooking } from '../retrieve-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

describe('retrieveBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: 'hb-1' });

    await retrieveBooking({ reference: 'REF-123', provider: 'hotelbeds' });

    expect(apiRequest).toHaveBeenCalledWith(
      '/hotels/bookings/REF-123/by-reference?provider=hotelbeds',
      { method: 'GET' },
    );
  });

  it('URL-encodes the reference', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id: 'hb-1' });

    await retrieveBooking({ reference: 'REF 123|X', provider: 'hotelbeds' });

    expect(apiRequest).toHaveBeenCalledWith(
      '/hotels/bookings/REF%20123%7CX/by-reference?provider=hotelbeds',
      { method: 'GET' },
    );
  });

  it('propagates errors', async () => {
    const error = { statusCode: 404, message: 'Booking not found' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(retrieveBooking({ reference: 'NOPE', provider: 'hotelbeds' })).rejects.toEqual(error);
  });
});
