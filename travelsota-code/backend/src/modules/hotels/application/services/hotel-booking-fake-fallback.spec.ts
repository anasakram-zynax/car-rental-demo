import { Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { HotelBookingService } from './hotel-booking.service';

describe('HotelBookingService.confirm (Travelport Stays fake fallback)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: any;
  let bookingRepo: { findById: jest.Mock; update: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const failedBooking = (over: Record<string, unknown> = {}) => ({
    id: 'hb-1',
    provider: 'travelport-stays',
    status: 'failed_supplier_booking',
    supplierReference: null,
    userId: undefined,
    workflowTrace: {},
    ...over,
  });

  beforeEach(() => {
    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com';
    // Travelport Stays is gated by TRAVELPORT_FAKE_BOOKING_ENABLED only —
    // the DEMO_MODE_* vars above no longer apply to it.
    process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
    delete process.env.REAL_ADMIN_EMAIL;
    delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;

    bookingRepo = { findById: jest.fn(), update: jest.fn().mockResolvedValue(null) };
    prisma = { user: { findUnique: jest.fn() } };
    service = Object.create(HotelBookingService.prototype);
    service.bookingRepo = bookingRepo;
    service.prisma = prisma;
    service.logger = new Logger('test');
    jest.spyOn(service, 'confirmInternal').mockRejectedValue(
      new BusinessError('HOTELS_SUPPLIER_BOOKING_FAILED', 'REQUESTED PROPERTY IS UNAVAILABLE'),
    );
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('fakes a confirmed booking for a guest when demo mode is on', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking());

    const result = await service.confirm('hb-1');

    expect(result.status).toBe('booked');
    expect(result.reference).toMatch(/^TS[A-Z0-9]{4}$/);
    expect(bookingRepo.update).toHaveBeenCalledWith(
      'hb-1',
      expect.objectContaining({
        status: 'booked',
        supplierReference: expect.stringMatching(/^TS[A-Z0-9]{4}$/),
        workflowTrace: expect.objectContaining({
          demoMode: true,
          realFailure: expect.objectContaining({ message: 'REQUESTED PROPERTY IS UNAVAILABLE' }),
        }),
      }),
    );
  });

  it('fakes a confirmed booking for a demo account', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking({ userId: 'u1' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });

    const result = await service.confirm('hb-1');

    expect(result.status).toBe('booked');
  });

  it('rethrows the real error for the real super admin', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking({ userId: 'u2' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'superadmin@travelsota-dev.local' });

    await expect(service.confirm('hb-1')).rejects.toThrow('REQUESTED PROPERTY IS UNAVAILABLE');
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });

  it('now also fakes a booking for a real customer not on the demo list — Travelport Stays inventory is unreliable for everyone', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking({ userId: 'u3' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'real@example.com' });

    const result = await service.confirm('hb-1');

    expect(result.status).toBe('booked');
  });

  it('rethrows the real error for a real customer (or anyone) when TRAVELPORT_FAKE_BOOKING_ENABLED is off', async () => {
    process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
    bookingRepo.findById.mockResolvedValue(failedBooking({ userId: 'u3' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'real@example.com' });

    await expect(service.confirm('hb-1')).rejects.toThrow();
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });

  it('rebuilds the hotel snapshot from what was captured at booking time', async () => {
    bookingRepo.findById.mockResolvedValue(
      failedBooking({
        rateSnapshot: { hotelName: 'Mercure Gold', roomName: 'Superior Room', boardName: 'Room Only' },
        supplierPayload: { checkIn: '2026-11-10', checkOut: '2026-11-12' },
      }),
    );

    await service.confirm('hb-1');

    expect(bookingRepo.update).toHaveBeenCalledWith(
      'hb-1',
      expect.objectContaining({
        hotelSnapshot: expect.objectContaining({
          name: 'Mercure Gold',
          checkIn: '2026-11-10',
          checkOut: '2026-11-12',
        }),
      }),
    );
  });

  it('cancelSupplier never calls the supplier for a fake reference', async () => {
    const getProvider = jest.fn();
    service.providerRegistry = { getProvider };
    bookingRepo.findById.mockResolvedValue(
      failedBooking({ status: 'booked', supplierReference: 'TS-DEV/ABC123' }),
    );

    const result = await service.cancelSupplier('hb-1');

    expect(result.supplierCancelled).toBe(false);
    expect(getProvider).not.toHaveBeenCalled();
  });

  it('estimates a fake booking cancel from the stored policies even after the payment was refunded', async () => {
    const retrieveBooking = jest.fn();
    service.providerRegistry = { getProvider: jest.fn().mockReturnValue({ retrieveBooking }) };
    service.paymentRepository = {
      findMany: jest.fn().mockResolvedValue([{ status: 'REFUNDED', amount: 200, currency: 'AED' }]),
    };
    bookingRepo.findById.mockResolvedValue(
      failedBooking({
        status: 'booked',
        supplierReference: 'TS-DEV/ABC123',
        amount: 200,
        currency: 'AED',
        provider: 'travelport-stays',
        rateSnapshot: {
          cancellationPolicies: [{ percentage: '100', policyType: 'CANCELLATION' }],
          chargeExchangeRate: 1,
        },
      }),
    );

    const estimate = await service.getCancelEstimate('hb-1');

    expect(retrieveBooking).not.toHaveBeenCalled();
    expect(estimate.policiesKnown).toBe(true);
    expect(estimate.cancellationFee).toBe(200);
    expect(estimate.refundAmount).toBe(0);
  });

  it('reports a fresh failed stay of a guest as still processing on the success page', async () => {
    bookingRepo.findById.mockResolvedValue(
      failedBooking({ updatedAt: new Date().toISOString(), workflowTrace: {} }),
    );

    const progress = await service.getBookingProgress('hb-1');

    expect(progress.status).toBe('running');
    expect((await service.getBooking('hb-1')).status).toBe('booking_in_progress');
  });

  it('shows the real stays failure to the real admin and after the grace period', async () => {
    bookingRepo.findById.mockResolvedValue(
      failedBooking({ userId: 'u2', updatedAt: new Date().toISOString(), workflowTrace: {} }),
    );
    prisma.user.findUnique.mockResolvedValue({ email: 'superadmin@travelsota-dev.local' });
    expect((await service.getBookingProgress('hb-1')).status).toBe('failed');

    bookingRepo.findById.mockResolvedValue(
      failedBooking({ updatedAt: new Date(Date.now() - 5 * 60_000).toISOString(), workflowTrace: {} }),
    );
    expect((await service.getBookingProgress('hb-1')).status).toBe('failed');
  });

  it('never fakes other providers', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking({ provider: 'hotelbeds' }));

    await expect(service.confirm('hb-1')).rejects.toThrow();
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });

  it('DEMO_MODE_ENABLED no longer gates Travelport Stays — only TRAVELPORT_FAKE_BOOKING_ENABLED does', async () => {
    process.env.DEMO_MODE_ENABLED = 'false';
    bookingRepo.findById.mockResolvedValue(failedBooking());

    const result = await service.confirm('hb-1');

    expect(result.status).toBe('booked');
  });

  it('never fakes when TRAVELPORT_FAKE_BOOKING_ENABLED is off', async () => {
    process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
    bookingRepo.findById.mockResolvedValue(failedBooking());

    await expect(service.confirm('hb-1')).rejects.toThrow();
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });

  it('does not fake if the booking never reached failed_supplier_booking', async () => {
    bookingRepo.findById.mockResolvedValue(failedBooking({ status: 'cancelled' }));

    await expect(service.confirm('hb-1')).rejects.toThrow();
    expect(bookingRepo.update).not.toHaveBeenCalled();
  });
});
