import { describe, it, expect, vi } from 'vitest';
import { previewBooking } from '../preview-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  offerId: 'offer-1',
  productId: 'product-1',
  catalogUuid: 'cat-1',
  from: 'JFK',
  to: 'LHR',
  departureDate: '2026-06-10',
  searchKey: 'sk-1',
  travelers: [{
    givenName: 'John', surname: 'Doe', gender: 'Male' as const,
    birthDate: '1990-01-01', passengerTypeCode: 'ADT' as const,
    phoneCountryCode: '1', phoneNumber: '1234567890', email: 'john@test.com',
  }],
};

describe('previewBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ bookingId: 'b-1', status: 'previewed', next: 'confirm' });

    await previewBooking(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/bookings/preview', {
      method: 'POST',
      body: mockInput,
      auth: true,
    });
  });

  it('returns the preview response', async () => {
    const expected = { bookingId: 'b-1', status: 'previewed' as const, next: 'confirm' as const };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await previewBooking(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 400, message: 'Invalid input' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(previewBooking(mockInput)).rejects.toEqual(error);
  });
});
