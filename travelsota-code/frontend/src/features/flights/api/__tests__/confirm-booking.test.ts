import { describe, it, expect, vi } from 'vitest';
import { confirmBooking } from '../confirm-booking';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from '@/lib/api/client';

const mockInput = {
  bookingId: 'b-1',
  offerId: 'offer-1',
  productId: 'product-1',
  catalogUuid: 'cat-1',
  from: 'JFK',
  to: 'LHR',
  departureDate: '2026-06-10',
  travelers: [{
    givenName: 'John', surname: 'Doe', gender: 'Male' as const,
    birthDate: '1990-01-01', passengerTypeCode: 'ADT' as const,
    phoneCountryCode: '1', phoneNumber: '1234567890', email: 'john@test.com',
  }],
};

describe('confirmBooking', () => {
  it('calls apiRequest with correct arguments', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ bookingId: 'b-1', status: 'booked' });

    await confirmBooking(mockInput);

    expect(apiRequest).toHaveBeenCalledWith('/flights/bookings/confirm', {
      method: 'POST',
      body: mockInput,
      auth: true,
    });
  });

  it('returns the confirm response with locatorCode', async () => {
    const expected = {
      bookingId: 'b-1', status: 'booked',
      locatorCode: 'ABC123', workbenchId: 'wb-1', reservationId: 'res-1',
    };
    vi.mocked(apiRequest).mockResolvedValue(expected);

    const result = await confirmBooking(mockInput);

    expect(result).toEqual(expected);
  });

  it('propagates errors', async () => {
    const error = { statusCode: 409, message: 'Booking already confirmed' };
    vi.mocked(apiRequest).mockRejectedValue(error);

    await expect(confirmBooking(mockInput)).rejects.toEqual(error);
  });
});
