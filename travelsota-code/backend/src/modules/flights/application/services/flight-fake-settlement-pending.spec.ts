import { FlightBookingPublicService } from './flight-booking-public.service';

describe('FlightBookingPublicService — fake settlement grace (success page)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: any;
  let bookingRepo: { findById: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const booking = (over: Record<string, unknown> = {}) => ({
    id: 'b1',
    provider: 'travelport',
    status: 'failed_supplier_booking',
    userId: undefined,
    updatedAt: new Date().toISOString(),
    workflowSummary: {},
    locatorCode: null,
    ...over,
  });

  beforeEach(() => {
    process.env.DEMO_MODE_ENABLED = 'true';
    process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com';
    // Travelport bookings are gated by TRAVELPORT_FAKE_BOOKING_ENABLED only —
    // DEMO_MODE_ENABLED/DEMO_MODE_EMAILS above no longer apply to them.
    process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
    delete process.env.REAL_ADMIN_EMAIL;
    delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;
    bookingRepo = { findById: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    service = Object.create(FlightBookingPublicService.prototype);
    service.bookingRepo = bookingRepo;
    service.prisma = prisma;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('reports a fresh failure of a guest booking as still processing', async () => {
    bookingRepo.findById.mockResolvedValue(booking());
    const progress = await service.getBookingProgress('b1');
    expect(progress.status).toBe('running');
    expect(progress.title).toBe('Processing your booking');
    expect((await service.getBooking('b1')).status).toBe('booking_in_progress');
  });

  it('reports a fresh failure of a demo account as still processing', async () => {
    bookingRepo.findById.mockResolvedValue(booking({ userId: 'u1' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });
    expect((await service.getBookingProgress('b1')).status).toBe('running');
  });

  it('shows the real failure to the real super admin', async () => {
    bookingRepo.findById.mockResolvedValue(booking({ userId: 'u2' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'superadmin@travelsota-dev.local' });
    expect((await service.getBookingProgress('b1')).status).toBe('failed');
  });

  it('masks the failure for a real, non-demo customer too — Travelport fakes for everyone but the real admin', async () => {
    bookingRepo.findById.mockResolvedValue(booking({ userId: 'u3' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'real@example.com' });
    expect((await service.getBookingProgress('b1')).status).toBe('running');
  });

  it('shows the real failure to everyone, including a real customer, when TRAVELPORT_FAKE_BOOKING_ENABLED is off', async () => {
    process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
    bookingRepo.findById.mockResolvedValue(booking({ userId: 'u3' }));
    prisma.user.findUnique.mockResolvedValue({ email: 'real@example.com' });
    expect((await service.getBookingProgress('b1')).status).toBe('failed');
  });

  it('stops masking once the grace period has passed', async () => {
    bookingRepo.findById.mockResolvedValue(
      booking({ updatedAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
    );
    expect((await service.getBookingProgress('b1')).status).toBe('failed');
  });

  it('does not mask other providers or an already-settled fake booking', async () => {
    bookingRepo.findById.mockResolvedValue(booking({ provider: 'duffel' }));
    expect((await service.getBookingProgress('b1')).status).toBe('failed');
    bookingRepo.findById.mockResolvedValue(
      booking({ status: 'held', locatorCode: 'TP-DEV/ABC123', workflowSummary: { demoMode: true } }),
    );
    expect((await service.getBookingProgress('b1')).status).toBe('success');
  });

  it('never leaks the real failure text to the booking owner', async () => {
    bookingRepo.findById.mockResolvedValue(
      booking({
        status: 'held',
        locatorCode: 'TP-DEV/ABC123',
        workflowSummary: { demoMode: true, realFailure: { message: 'FARE NOT AVAILABLE' }, steps: [] },
      }),
    );
    const result = await service.getBooking('b1');
    expect(result.workflowSummary.realFailure).toBeUndefined();
    expect(result.workflowSummary.demoMode).toBe(true);
  });
});
