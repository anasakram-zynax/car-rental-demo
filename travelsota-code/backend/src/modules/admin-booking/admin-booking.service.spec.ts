import { AdminBookingService } from './admin-booking.service';

function makeService(
  overrides: {
    flightBooking?: any;
    hotelBooking?: any;
    ticketResult?: any;
    hotelConfirmResult?: any;
  } = {},
  paymentRepoOverride?: any,
) {
  const prisma: any = {
    flightBooking: {
      findUnique: jest.fn().mockResolvedValue(
        overrides.flightBooking ??
          (overrides.hotelBooking
            ? null
            : {
                id: 'b1',
                status: 'held',
                userId: null,
                amount: 100,
                currency: 'USD',
                createdAt: new Date(),
              }),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    hotelBooking: {
      findUnique: jest.fn().mockResolvedValue(overrides.hotelBooking ?? null),
    },
  };
  const hotelBookingService: any = {
    confirm: jest
      .fn()
      .mockResolvedValue(
        overrides.hotelConfirmResult ?? { status: 'booked', reference: 'HB123' },
      ),
  };
  const flightBookingService: any = {
    ticketBooking: jest
      .fn()
      .mockResolvedValue(
        overrides.ticketResult ?? { ok: true, status: 'held', locatorCode: 'ABC123' },
      ),
  };
  const auditLog: any = { log: jest.fn().mockResolvedValue({}) };
  const notifications: any = { notifyDirect: jest.fn().mockResolvedValue({}) };
  const svc = new AdminBookingService(
    prisma,
    auditLog,
    {} as any,
    {} as any,
    {} as any,
    flightBookingService,
    notifications,
    paymentRepoOverride ?? ({ findMany: jest.fn().mockResolvedValue([]) } as any),
    { getGateway: jest.fn() } as any,
    { write: jest.fn().mockResolvedValue('outbox-1') } as any,
    hotelBookingService,
  );
  return { svc, prisma, flightBookingService, hotelBookingService, auditLog, notifications };
}

describe('AdminBookingService.adminIssueBooking', () => {
  it('refuses already-ticketed bookings', async () => {
    const { svc, flightBookingService } = makeService({
      flightBooking: {
        id: 'b1',
        status: 'ticketed',
        userId: null,
        amount: 100,
        currency: 'USD',
        createdAt: new Date(),
      },
    });
    await expect(svc.adminIssueBooking('b1', 'admin1')).rejects.toThrow(
      'already issued',
    );
    expect(flightBookingService.ticketBooking).not.toHaveBeenCalled();
  });

  it('refuses terminal states', async () => {
    const { svc, flightBookingService } = makeService({
      flightBooking: {
        id: 'b1',
        status: 'cancelled',
        userId: null,
        amount: 100,
        currency: 'USD',
        createdAt: new Date(),
      },
    });
    await expect(svc.adminIssueBooking('b1', 'admin1')).rejects.toThrow(
      'cannot be issued',
    );
    expect(flightBookingService.ticketBooking).not.toHaveBeenCalled();
  });

  it('issues a held booking, audits + notifies', async () => {
    const { svc, flightBookingService, auditLog, notifications } =
      makeService();
    const res = await svc.adminIssueBooking('b1', 'admin1');
    expect(res.ok).toBe(true);
    expect(flightBookingService.ticketBooking).toHaveBeenCalledWith('b1', {
      forceTicket: true,
    });
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_ISSUE', userId: 'admin1' }),
    );
    expect(notifications.notifyDirect).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'booking.issued' }),
    );
  });

  it('surfaces supplier ticketing failure', async () => {
    const { svc } = makeService({
      ticketResult: { ok: false, message: 'fare gone' },
    });
    await expect(svc.adminIssueBooking('b1', 'admin1')).rejects.toThrow(
      'fare gone',
    );
  });

  it('marks a PENDING bank-transfer payment PAID on issue', async () => {
    const pending: any = {
      id: 'pay-9',
      gateway: 'BANK_TRANSFER',
      status: 'PENDING',
      updatedAt: new Date(),
    };
    const paymentRepo: any = {
      findMany: jest.fn().mockResolvedValue([pending]),
      update: jest.fn(),
    };
    const { svc } = makeService({}, paymentRepo);
    const res = await svc.adminIssueBooking('b1', 'admin1');
    expect(res.ok).toBe(true);
    expect(pending.status).toBe('PAID');
    expect(paymentRepo.update).toHaveBeenCalled();
  });

  it('issues a pending hotel booking via supplier confirm', async () => {
    const { svc, hotelBookingService, auditLog, notifications } = makeService({
      hotelBooking: {
        id: 'h1',
        status: 'pending_payment',
        userId: null,
        amount: 200,
        currency: 'USD',
        createdAt: new Date(),
      },
    });
    const res = await svc.adminIssueBooking('h1', 'admin1');
    expect(res.ok).toBe(true);
    expect(res.status).toBe('booked');
    expect(hotelBookingService.confirm).toHaveBeenCalledWith('h1');
    expect(auditLog.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BOOKING_ISSUE', entity: 'HotelBooking' }),
    );
    expect(notifications.notifyDirect).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'booking.issued' }),
    );
  });

  it('refuses an already-booked hotel booking', async () => {
    const { svc, hotelBookingService } = makeService({
      hotelBooking: {
        id: 'h1',
        status: 'booked',
        userId: null,
        amount: 200,
        currency: 'USD',
        createdAt: new Date(),
      },
    });
    await expect(svc.adminIssueBooking('h1', 'admin1')).rejects.toThrow(
      'already issued',
    );
    expect(hotelBookingService.confirm).not.toHaveBeenCalled();
  });
});
