import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { CarCheckoutService } from './car-checkout.service';

describe('CarCheckoutService', () => {
  const booking = {
    id: 'booking-1',
    publicRef: 'CAR-REF',
    userId: 'user-1',
    status: 'pending_payment',
    total: 70,
    currency: 'USD',
  };
  const input = {
    serviceType: 'rental' as const,
    fleetId: 'fleet-1',
    pickupLocation: 'Lahore Airport',
    pickupAt: '2026-10-01T10:00:00Z',
    dropoffAt: '2026-10-03T10:00:00Z',
    quantity: 1,
    contactName: 'Test Customer',
    contactEmail: 'TEST@example.com',
    contactPhone: '+923001234567',
    gateway: PaymentGateway.STRIPE,
    idempotencyKey: 'checkout-attempt-1',
    clientTotal: 1,
  };
  let carsService: {
    reserveRentalForCheckout: jest.Mock;
    reserveTransferForCheckout: jest.Mock;
  };
  let payment: { execute: jest.Mock };
  let bookings: { atomicClaimStatus: jest.Mock };
  let service: CarCheckoutService;

  beforeEach(() => {
    carsService = {
      reserveRentalForCheckout: jest
        .fn()
        .mockImplementation((command) =>
          Promise.resolve({ ...booking, userId: command.userId ?? null }),
        ),
      reserveTransferForCheckout: jest.fn().mockImplementation((command) =>
        Promise.resolve({
          ...booking,
          userId: command.userId ?? null,
          transferPackageId: 'package-1',
        }),
      ),
    };
    payment = {
      execute: jest.fn().mockResolvedValue({
        paymentId: 'payment-1',
        reference: 'PAY-1',
        clientSecret: 'secret',
        checkoutUrl: null,
      }),
    };
    bookings = { atomicClaimStatus: jest.fn().mockResolvedValue(true) };
    service = new CarCheckoutService(
      carsService as never,
      payment as never,
      bookings as never,
    );
  });

  it('uses authenticated identity and authoritative booking total', async () => {
    const result = await service.checkout(input, 'user-1');
    expect(carsService.reserveRentalForCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', quantity: 1 }),
    );
    expect(payment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'booking-1',
        amount: 70,
        currency: 'USD',
        bookingType: 'CAR',
      }),
    );
    expect(result.amount).toBe(70);
  });

  it('derives the same booking reference for checkout retries', async () => {
    await service.checkout(input, 'user-1');
    await service.checkout(input, 'user-1');
    const first =
      carsService.reserveRentalForCheckout.mock.calls[0][0].publicRef;
    const second =
      carsService.reserveRentalForCheckout.mock.calls[1][0].publicRef;
    expect(second).toBe(first);
  });

  it('creates a guest reservation with null ownership', async () => {
    await service.checkout(input);
    expect(carsService.reserveRentalForCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
    );
  });

  it('uses stable guest idempotency scoped to the booking context', async () => {
    await service.checkout(input);
    await service.checkout({ ...input, contactEmail: 'another@example.com' });
    await service.checkout({ ...input, fleetId: 'fleet-2' });
    const calls = carsService.reserveRentalForCheckout.mock.calls;
    expect(calls[1][0].publicRef).toBe(calls[0][0].publicRef);
    expect(calls[2][0].publicRef).not.toBe(calls[0][0].publicRef);
  });

  it('does not let a guest reuse an authenticated booking reference', async () => {
    carsService.reserveRentalForCheckout.mockResolvedValueOnce({
      ...booking,
      userId: 'another-user',
    });
    await expect(service.checkout(input)).rejects.toThrow(
      'This checkout reference is already in use.',
    );
  });

  it('checks out transfers using the package-authoritative reservation', async () => {
    await service.checkout(
      {
        ...input,
        serviceType: 'transfer',
        fleetId: undefined,
        transferPackageId: 'package-1',
        dropoffAt: undefined,
      },
      'user-1',
    );
    expect(carsService.reserveTransferForCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        transferPackageId: 'package-1',
        userId: 'user-1',
      }),
    );
  });

  it('releases a newly pending reservation when payment intent creation fails', async () => {
    payment.execute.mockRejectedValue(new Error('gateway unavailable'));
    await expect(service.checkout(input, 'user-1')).rejects.toThrow(
      'gateway unavailable',
    );
    expect(bookings.atomicClaimStatus).toHaveBeenCalledWith(
      'booking-1',
      'pending_payment',
      'failed_payment',
    );
  });
});
