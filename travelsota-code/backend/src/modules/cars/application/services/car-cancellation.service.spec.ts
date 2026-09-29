import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { CarCancellationService } from './car-cancellation.service';

describe('CarCancellationService', () => {
  const now = new Date('2026-10-09T10:00:00Z');
  const booking = {
    id: 'booking-1',
    userId: 'customer-1',
    status: 'booked',
    pickupAt: new Date('2026-10-10T10:00:00Z'),
    quantity: 1,
  };
  let bookings: {
    findById: jest.Mock;
    atomicCancel: jest.Mock;
    atomicClaimStatus: jest.Mock;
  };
  let payments: { findMany: jest.Mock; update: jest.Mock };
  let gateway: { refundPayment: jest.Mock; cancelPayment: jest.Mock };
  let outbox: { writeSafe: jest.Mock };
  let notifications: { notifyDirect: jest.Mock };
  let service: CarCancellationService;

  beforeEach(() => {
    bookings = {
      findById: jest.fn().mockResolvedValue(booking),
      atomicCancel: jest.fn().mockResolvedValue(true),
      atomicClaimStatus: jest.fn().mockResolvedValue(true),
    };
    payments = { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() };
    gateway = { refundPayment: jest.fn(), cancelPayment: jest.fn() };
    outbox = { writeSafe: jest.fn() };
    notifications = { notifyDirect: jest.fn().mockResolvedValue(null) };
    service = new CarCancellationService(
      bookings as never,
      payments as never,
      { getGateway: () => gateway } as never,
      outbox as never,
      notifications as never,
    );
  });

  it.each([['2026-10-09T09:59:00Z'], ['2026-10-09T10:00:00Z']])(
    'allows cancellation at least 24 hours before pickup (%s)',
    async (cancelAt) => {
      await expect(
        service.cancelOwnBooking(
          'booking-1',
          'customer-1',
          undefined,
          new Date(cancelAt),
        ),
      ).resolves.toEqual(expect.objectContaining({ status: 'cancelled' }));
      expect(bookings.atomicCancel).toHaveBeenCalled();
    },
  );

  it('rejects cancellation less than 24 hours before pickup', async () => {
    await expect(
      service.cancelOwnBooking(
        'booking-1',
        'customer-1',
        undefined,
        new Date('2026-10-09T10:01:00Z'),
      ),
    ).rejects.toThrow('at least 24 hours');
  });

  it('does not reveal or cancel another customer booking', async () => {
    await expect(
      service.cancelOwnBooking('booking-1', 'customer-2', undefined, now),
    ).rejects.toThrow('not found');
    expect(bookings.atomicCancel).not.toHaveBeenCalled();
  });

  it('returns an already-cancelled booking idempotently without notifications', async () => {
    bookings.findById.mockResolvedValue({ ...booking, status: 'cancelled' });
    await expect(
      service.cancelOwnBooking('booking-1', 'customer-1', undefined, now),
    ).resolves.toEqual({
      bookingId: 'booking-1',
      status: 'cancelled',
      alreadyCancelled: true,
    });
    expect(outbox.writeSafe).not.toHaveBeenCalled();
    expect(notifications.notifyDirect).not.toHaveBeenCalled();
  });

  it.each(['payment_failed', 'payment_expired'])(
    'cancels %s consistently',
    async (status) => {
      bookings.findById.mockResolvedValue({ ...booking, status });
      await service.cancelOwnBooking('booking-1', 'customer-1', undefined, now);
      expect(bookings.atomicCancel).toHaveBeenCalled();
    },
  );

  it('refunds a paid booking before marking it cancelled', async () => {
    const payment = {
      status: PaymentStatus.PAID,
      amount: 70,
      currency: 'USD',
      gateway: 'STRIPE',
      providerPaymentId: 'pi_1',
      updatedAt: now,
    };
    payments.findMany.mockResolvedValue([payment]);
    await service.cancelOwnBooking(
      'booking-1',
      'customer-1',
      'Changed plans',
      now,
    );
    expect(gateway.refundPayment).toHaveBeenCalledWith('pi_1', 70, 'USD');
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(bookings.atomicCancel.mock.invocationCallOrder[0]).toBeGreaterThan(
      gateway.refundPayment.mock.invocationCallOrder[0],
    );
  });

  it('restores a paid booking reservation when refund fails', async () => {
    payments.findMany.mockResolvedValue([
      {
        status: PaymentStatus.PAID,
        amount: 70,
        currency: 'USD',
        gateway: 'STRIPE',
        providerPaymentId: 'pi_1',
        updatedAt: now,
      },
    ]);
    gateway.refundPayment.mockRejectedValue(new Error('refund failed'));
    await expect(
      service.cancelOwnBooking('booking-1', 'customer-1', undefined, now),
    ).rejects.toThrow('refund failed');
    expect(bookings.atomicClaimStatus).toHaveBeenLastCalledWith(
      'booking-1',
      'cancellation_requested',
      'booked',
    );
    expect(bookings.atomicCancel).not.toHaveBeenCalled();
  });

  it('emits cancellation outbox/direct notifications only after a successful claim', async () => {
    await service.cancelOwnBooking('booking-1', 'customer-1', undefined, now);
    expect(outbox.writeSafe).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'cars-booking-cancelled:booking-1',
        eventType: 'booking.cancelled',
      }),
    );
    expect(notifications.notifyDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'cars-booking-cancelled:booking-1',
      }),
    );
  });
});
