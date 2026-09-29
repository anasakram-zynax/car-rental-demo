import { CarPaymentListener } from './car-payment.listener';

describe('CarPaymentListener', () => {
  let handlers: Record<string, (event: { payload: unknown }) => Promise<void>>;
  let repository: {
    atomicClaimStatus: jest.Mock;
    expirePendingPaymentRentals: jest.Mock;
  };
  let listener: CarPaymentListener;
  let outbox: { writeSafe: jest.Mock };
  let notifications: { notifyDirect: jest.Mock };

  beforeEach(() => {
    handlers = {};
    const dispatcher = {
      register: jest.fn(
        (
          name: string,
          handler: (event: { payload: unknown }) => Promise<void>,
        ) => {
          handlers[name] = handler;
        },
      ),
    };
    repository = {
      atomicClaimStatus: jest.fn().mockResolvedValue(true),
      expirePendingPaymentRentals: jest.fn().mockResolvedValue(0),
    };
    outbox = { writeSafe: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyDirect: jest.fn().mockResolvedValue(undefined) };
    listener = new CarPaymentListener(
      dispatcher as never,
      repository as never,
      outbox as never,
      notifications as never,
    );
    listener.onModuleInit();
  });

  it('finalizes payment once without allocating inventory again', async () => {
    await handlers['payment.succeeded']({
      payload: { bookingType: 'CAR', bookingId: 'booking-1' },
    });
    expect(repository.atomicClaimStatus).toHaveBeenNthCalledWith(
      1,
      'booking-1',
      'pending_payment',
      'booking_in_progress',
    );
    expect(repository.atomicClaimStatus).toHaveBeenNthCalledWith(
      2,
      'booking-1',
      'booking_in_progress',
      'booked',
    );
    expect(outbox.writeSafe).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDirect).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate confirmation notifications on payment replay', async () => {
    repository.atomicClaimStatus
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false);
    const event = { payload: { bookingType: 'CAR', bookingId: 'booking-1' } };
    await handlers['payment.succeeded'](event);
    await handlers['payment.succeeded'](event);
    expect(outbox.writeSafe).toHaveBeenCalledTimes(1);
    expect(notifications.notifyDirect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['payment.failed', 'payment_failed'],
    ['payment.expired', 'payment_expired'],
  ])('releases inventory on %s', async (eventName, status) => {
    await handlers[eventName]({
      payload: { bookingType: 'CAR', bookingId: 'booking-1' },
    });
    expect(repository.atomicClaimStatus).toHaveBeenCalledWith(
      'booking-1',
      'pending_payment',
      status,
    );
  });

  it('ignores non-Cars payments', async () => {
    await handlers['payment.succeeded']({
      payload: { bookingType: 'HOTEL', bookingId: 'booking-1' },
    });
    expect(repository.atomicClaimStatus).not.toHaveBeenCalled();
  });

  it('runs expiry only in the configured worker process', async () => {
    const previousRole = process.env.APP_ROLE;
    const previousScheduler = process.env.ENABLE_PAYMENT_SCHEDULER;
    process.env.ENABLE_PAYMENT_SCHEDULER = 'true';
    process.env.APP_ROLE = 'api';
    await listener.expireStalePendingRentals();
    expect(repository.expirePendingPaymentRentals).not.toHaveBeenCalled();
    process.env.APP_ROLE = 'worker';
    await listener.expireStalePendingRentals();
    expect(repository.expirePendingPaymentRentals).toHaveBeenCalledTimes(1);
    process.env.APP_ROLE = previousRole;
    process.env.ENABLE_PAYMENT_SCHEDULER = previousScheduler;
  });
});
