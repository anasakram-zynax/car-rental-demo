import { Test } from '@nestjs/testing';
import { FlightHoldExpiryCron } from './flight-hold-expiry.cron';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';

describe('FlightHoldExpiryCron', () => {
  let cron: FlightHoldExpiryCron;
  let prisma: jest.Mocked<PrismaService>;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let orchestrator: jest.Mocked<PaymentOrchestratorService>;
  let notifications: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    prisma = {
      $queryRawUnsafe: jest.fn(),
      flightBooking: {
        update: jest.fn(),
      },
    } as any;

    paymentRepo = {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    } as any;

    orchestrator = {
      getGateway: jest.fn(),
    } as any;

    notifications = {
      notifyDirect: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        FlightHoldExpiryCron,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: orchestrator },
        { provide: NotificationService, useValue: notifications },
        { provide: FlightBookingProviderRegistryService, useValue: { getProvider: jest.fn() } },
      ],
    }).compile();

    cron = module.get<FlightHoldExpiryCron>(FlightHoldExpiryCron);
  });

  afterEach(() => jest.clearAllMocks());

  it('skips when no stale holds found', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    await cron.expireStaleHolds();

    expect(prisma.flightBooking.update).not.toHaveBeenCalled();
  });

  it('skips when previous run is still in progress', async () => {
    let resolveQuery: () => void;
    prisma.$queryRawUnsafe.mockReturnValue(
      new Promise((resolve) => { resolveQuery = () => resolve([{ id: 'booking-1', userId: 'user-1' }]); }),
    );

    const firstRun = cron.expireStaleHolds();
    // Second call while first is still in progress (query not resolved yet)
    await cron.expireStaleHolds();
    resolveQuery!();
    await firstRun;

    // Only one run should have processed — the second was skipped by circuit breaker
    expect(prisma.flightBooking.update).toHaveBeenCalledTimes(1);
  });

  it('cancels pending payments and marks booking cancelled', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'booking-1', userId: 'user-1' },
    ]);
    paymentRepo.findMany.mockResolvedValue([
      {
        id: 'pay-1',
        bookingId: 'booking-1',
        gateway: 'stripe',
        status: PaymentStatus.PENDING,
        providerPaymentId: 'pi_xxx',
      },
    ] as any);
    const mockGateway = { cancelPayment: jest.fn().mockResolvedValue(undefined) };
    orchestrator.getGateway.mockReturnValue(mockGateway as any);

    await cron.expireStaleHolds();

    expect(mockGateway.cancelPayment).toHaveBeenCalledWith('pi_xxx');
    expect(paymentRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.CANCELLED }),
    );
    expect(prisma.flightBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'booking-1' }, data: { status: 'hold_expired', message: 'Pre-payment hold expired.' } }),
    );
    expect(notifications.notifyDirect).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'booking.hold_expired', aggregateId: 'booking-1' }),
    );
  });

  it('cancels AUTHORIZED payments on hold expiry', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'booking-2', userId: null },
    ]);
    paymentRepo.findMany.mockResolvedValue([
      {
        id: 'pay-2',
        bookingId: 'booking-2',
        gateway: 'stripe',
        status: PaymentStatus.AUTHORIZED,
        providerPaymentId: 'pi_yyy',
      },
    ] as any);
    const mockGateway = { cancelPayment: jest.fn().mockResolvedValue(undefined) };
    orchestrator.getGateway.mockReturnValue(mockGateway as any);

    await cron.expireStaleHolds();

    expect(mockGateway.cancelPayment).toHaveBeenCalledWith('pi_yyy');
    expect(paymentRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentStatus.CANCELLED }),
    );
  });

  it('handles payment cancel failure gracefully', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'booking-3', userId: 'user-3' },
    ]);
    paymentRepo.findMany.mockResolvedValue([
      {
        id: 'pay-3',
        bookingId: 'booking-3',
        gateway: 'stripe',
        status: PaymentStatus.PENDING,
        providerPaymentId: 'pi_zzz',
      },
    ] as any);
    const mockGateway = { cancelPayment: jest.fn().mockRejectedValue(new Error('Stripe error')) };
    orchestrator.getGateway.mockReturnValue(mockGateway as any);

    await cron.expireStaleHolds();

    // Should still mark booking as hold_expired even if payment cancel fails
    expect(prisma.flightBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'booking-3' },
        data: expect.objectContaining({ status: 'hold_expired' }),
      }),
    );
  });
});
