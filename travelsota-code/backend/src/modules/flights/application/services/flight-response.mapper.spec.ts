import { FlightResponseMapper } from './flight-response.mapper';

describe('FlightResponseMapper.toBookingDetailView', () => {
  const mapper = new FlightResponseMapper();

  it('passes paymentStatus through — the success page shows it as a badge and it must not be silently dropped', () => {
    const view = mapper.toBookingDetailView({
      id: 'b1',
      provider: 'travelport',
      status: 'held',
      paymentStatus: 'PAID',
      amount: 733.13,
      currency: 'USD',
      locatorCode: 'TPVYF8',
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    });

    expect(view.paymentStatus).toBe('PAID');
  });

  it('defaults paymentStatus to null when the service found no payment row', () => {
    const view = mapper.toBookingDetailView({
      id: 'b1',
      provider: 'travelport',
      status: 'pending_payment',
      amount: 100,
      currency: 'USD',
      createdAt: '2026-09-24T00:00:00.000Z',
      updatedAt: '2026-09-24T00:00:00.000Z',
    });

    expect(view.paymentStatus).toBeNull();
  });
});
