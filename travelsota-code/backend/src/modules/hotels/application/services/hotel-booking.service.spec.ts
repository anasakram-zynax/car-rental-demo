import { Test } from '@nestjs/testing';
import { HotelBookingService } from './hotel-booking.service';
import { HotelBookingRepoPortToken } from '../ports/hotel-booking-repo.port';
import { HotelsProviderRegistryService } from '../../providers/registry/hotels-provider-registry.service';
import { CreatePaymentIntentUseCase } from '../../../payment/application/use-cases/create-payment-intent.use-case';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { MarkupService } from '../../../markup/markup.service';
import { HotelConfirmationSyncService } from './hotel-confirmation-sync.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import { PromoCodeEligibilityService } from '../../../promo-codes/application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from '../../../promo-codes/application/services/promo-code-pricing.service';
import { PromoCodeRepositoryToken } from '../../../promo-codes/application/ports/promo-code.repository.port';
import { NotificationService } from '../../../notifications/application/notification.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { PolicyAggregatorService } from '../../policies/policy-aggregator.service';
import { HotelbedsPolicyNormalizer } from '../../policies/hotelbeds-policy-normalizer';
import { AmadeusPolicyNormalizer } from '../../policies/amadeus-policy-normalizer';
import { RateHawkPolicyNormalizer } from '../../policies/ratehawk-policy-normalizer';
import { WalletService } from '../../../wallet/wallet.service';
import { CustomerWalletService } from '../../../wallet/customer-wallet.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { InvoiceService } from '../../../invoices/application/services/invoice.service';

// Avoid loading the real PrismaService (pulls generated clients + SQLite/PG
// adapters) into the jest environment — DI only needs a matching token.
jest.mock('../../../../shared/database/prisma.service', () => ({
  PrismaService: class PrismaServiceMock {},
}));
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';

describe('HotelBookingService', () => {
  let service: HotelBookingService;
  let providerRegistry: jest.Mocked<HotelsProviderRegistryService>;
  let mockProvider: jest.Mocked<HotelProvider>;
  let createPaymentIntent: jest.Mocked<CreatePaymentIntentUseCase>;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let paymentOrchestrator: jest.Mocked<PaymentOrchestratorService>;
  let markupService: jest.Mocked<MarkupService>;
  let bookingRepo: { create: jest.Mock; update: jest.Mock; findById: jest.Mock; findAll: jest.Mock; findByUserId: jest.Mock };
  let moduleRef: any;
  let walletMock: any;
  let dispatcherMock: any;

  const mockHotelBooking = {
    id: 'hb-1',
    provider: 'hotelbeds',
    status: 'pending_payment',
    searchKey: null,
    hotelId: null,
    providerHotelId: null,
    supplierRateId: 'rate-key-1',
    supplierReference: null,
    supplierStatus: null,
    supplierBookingId: null,
    supplierOrderId: null,
    supplierItemId: null,
    guests: null,
    supplierAmount: 350.00,
    supplierCurrency: 'EUR',
    customerAmount: 350.00,
    customerCurrency: 'EUR',
    markupAmount: null,
    markupSnapshot: null,
    rateSnapshot: { roomAdults: 2, roomChildren: 0, checkedAt: '2026-06-16T00:00:00.000Z' },
    supplierPayload: null,
    workflowTrace: null,
    rateKey: 'rate-key-1',
    holder: { name: 'John', surname: 'Doe' },
    clientReference: 'john@test.com',
    paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
    amount: 350.00,
    currency: 'EUR',
    hotelbedsRef: null,
    hotelbedsStatus: null,
    hotelSnapshot: null,
    priceSnapshot: { roomAdults: 2, roomChildren: 0, checkedAt: '2026-06-16T00:00:00.000Z' },
    message: null,
    userId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockValidatedRate = {
    rateId: 'rate-key-1',
    provider: 'hotelbeds',
    supplierAmount: 350.00,
    supplierCurrency: 'EUR',
    currency: 'EUR',
    rooms: [{ rates: [{ net: 350.00, adults: 2, children: 0, rateKey: 'rate-key-fresh' }] }],
  };

  beforeEach(async () => {
    bookingRepo = {
      create: jest.fn().mockResolvedValue(mockHotelBooking),
      update: jest.fn().mockResolvedValue(mockHotelBooking),
      findById: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue([]),
      atomicClaimStatus: jest.fn().mockResolvedValue(true),
      findPendingByUserAndRateKey: jest.fn().mockResolvedValue(null),
    };

    mockProvider = {
      key: 'hotelbeds',
      validateRate: jest.fn(),
      createBooking: jest.fn(),
      retrieveBooking: jest.fn(),
      cancelBooking: jest.fn(),
    } as any;

    providerRegistry = {
      getProvider: jest.fn().mockReturnValue(mockProvider),
      getBookingProviders: jest.fn().mockResolvedValue([mockProvider]),
    } as any;

    createPaymentIntent = { execute: jest.fn() } as any;

    paymentRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByReference: jest.fn(),
      findByProviderPaymentId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    } as any;

    paymentOrchestrator = { getGateway: jest.fn() } as any;

    const mockHcnSync = {
      checkAndSyncConfirmationNumbers: jest.fn().mockResolvedValue(undefined),
      scheduleNextCheck: jest.fn().mockResolvedValue(undefined),
    } as any;

    markupService = {
      calculatePrice: jest.fn().mockResolvedValue({
        finalPrice: 350.00,
        effectiveMarkupPercent: 0,
        appliedRules: [],
      }),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        HotelBookingService,
        { provide: HotelBookingRepoPortToken, useValue: bookingRepo },
        { provide: HotelsProviderRegistryService, useValue: providerRegistry },
        { provide: CreatePaymentIntentUseCase, useValue: createPaymentIntent },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: paymentOrchestrator },
        { provide: MarkupService, useValue: markupService },
        { provide: HotelConfirmationSyncService, useValue: mockHcnSync },
        { provide: OutboxWriterService, useValue: { write: jest.fn().mockResolvedValue({ id: 'outbox-1' }) } },
        { provide: PromoCodeRedemptionService, useValue: { redeemByBookingId: jest.fn().mockResolvedValue(undefined), releaseByBookingId: jest.fn().mockResolvedValue(undefined), refundByBookingId: jest.fn().mockResolvedValue(undefined) } },
        { provide: PromoCodeEligibilityService, useValue: {} },
        { provide: PromoCodePricingService, useValue: {} },
        { provide: PromoCodeRepositoryToken, useValue: {} },
        { provide: NotificationService, useValue: { notifyDirect: jest.fn().mockResolvedValue(undefined) } },
        { provide: CurrencyService, useValue: { convert: jest.fn(), getDecimals: jest.fn().mockResolvedValue(2), toSmallestUnit: jest.fn().mockImplementation(async (a: number) => Math.round(a * 100)), fromSmallestUnit: jest.fn().mockImplementation(async (m: number) => m / 100) } },
        { provide: AppConfigService, useValue: { hotelbeds: { tolerancePercent: 5 } } },
        { provide: PrismaService, useValue: { agentProfile: { findUnique: jest.fn().mockResolvedValue(null) }, user: { findUnique: jest.fn().mockResolvedValue(null) }, walletHold: { update: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null) } } },
        { provide: PolicyAggregatorService, useValue: { aggregate: jest.fn().mockResolvedValue([]) } },
        { provide: HotelbedsPolicyNormalizer, useValue: { normalize: jest.fn() } },
        { provide: AmadeusPolicyNormalizer, useValue: { normalize: jest.fn() } },
        { provide: RateHawkPolicyNormalizer, useValue: { normalize: jest.fn() } },
        { provide: WalletService, useValue: { reserveHoldForBooking: jest.fn().mockResolvedValue({ id: 'hold-1' }), isSufficient: jest.fn().mockResolvedValue(true), validateAgentBookingPermission: jest.fn().mockResolvedValue(undefined) } },
        { provide: CustomerWalletService, useValue: { reserveHoldForBooking: jest.fn().mockResolvedValue({ id: 'hold-1' }), isSufficient: jest.fn().mockResolvedValue(true) } },
        { provide: ImmediateOutboxDispatcherService, useValue: { dispatch: jest.fn() } },
        { provide: SiteSettingStore, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: PaymentGatewayConfigService, useValue: { getGatewaysSummary: jest.fn().mockResolvedValue([]) } },
        { provide: InvoiceService, useValue: { generateForBooking: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<HotelBookingService>(HotelBookingService);
    moduleRef = module;
    walletMock = moduleRef.get(WalletService, { strict: false }) as any;
    dispatcherMock = moduleRef.get(ImmediateOutboxDispatcherService, { strict: false }) as any;
  });

  afterEach(() => jest.clearAllMocks());

  describe('preview', () => {
    const previewInput = {
      rateKey: 'rate-key-1',
      holder: { name: 'John', surname: 'Doe' },
      clientReference: 'john@test.com',
      paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
      roomAdults: 2,
      roomChildren: 0,
    };

    it('creates booking with pending_payment after rate validation via provider', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      bookingRepo.create.mockResolvedValue(mockHotelBooking);

      const result = await service.preview(previewInput, 'user-1');

      expect(result.status).toBe('pending_payment');
      expect(result.bookingId).toBeDefined();
      expect(result.amount).toBe(350.00);
      expect(providerRegistry.getProvider).toHaveBeenCalledWith('hotelbeds');
      expect(providerRegistry.getBookingProviders).toHaveBeenCalled();
      expect(mockProvider.validateRate).toHaveBeenCalledWith(
        expect.objectContaining({ rateId: 'rate-key-1' }),
      );
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_payment', amount: 350.00, currency: 'EUR', userId: 'user-1' }),
      );
    });

    it('uses rateId when provided (preferred over rateKey)', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      await service.preview({ ...previewInput, rateId: 'rate-id-1' }, 'user-1');
      expect(mockProvider.validateRate).toHaveBeenCalledWith(
        expect.objectContaining({ rateId: 'rate-id-1' }),
      );
    });

    it('throws HOTELS_RATE_CHECK_FAILED when net is zero', async () => {
      mockProvider.validateRate.mockResolvedValue({
        ...mockValidatedRate,
        supplierAmount: 0,
      });
      await expect(service.preview(previewInput, 'user-1')).rejects.toThrow(BusinessError);
    });

    it('throws when provider rate validation fails', async () => {
      mockProvider.validateRate.mockRejectedValue(new Error('Provider error'));
      await expect(service.preview(previewInput, 'user-1')).rejects.toThrow(Error);
    });
  });

  describe('checkout', () => {
    const checkoutInput = {
      rateKey: 'rate-key-1',
      holder: { name: 'John', surname: 'Doe' },
      clientReference: 'john@test.com',
      paxes: [{ roomId: '1', type: 'ADT', name: 'John', surname: 'Doe' }],
      roomAdults: 2,
      roomChildren: 0,
      gateway: PaymentGateway.STRIPE,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    it('creates preview then payment intent', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      createPaymentIntent.execute.mockResolvedValue({
        paymentId: 'pay-1',
        clientSecret: 'secret_xxx',
        checkoutUrl: null,
      });

      const result = await service.checkout(checkoutInput, 'user-1');

      expect(result.bookingId).toBeDefined();
      expect(result.paymentId).toBe('pay-1');
      expect(result.clientSecret).toBe('secret_xxx');
    });

    it('marks booking as failed when payment fails', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      createPaymentIntent.execute.mockRejectedValue(new Error('Stripe error'));

      await expect(service.checkout(checkoutInput, 'user-1')).rejects.toThrow('Stripe error');
      expect(bookingRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('holds without a gateway intent for bank_transfer', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      (service as any).gatewayConfigService.getGatewaysSummary.mockResolvedValue([
        { gateway: 'bank_transfer', enabled: true },
      ]);

      const result = await service.checkout(
        { ...checkoutInput, gateway: PaymentGateway.BANK_TRANSFER },
        'user-1',
      );

      expect(createPaymentIntent.execute).not.toHaveBeenCalled();
      expect(result.paymentId).toBeDefined();
      expect(result.clientSecret).toBeNull();
      expect(result.paymentMethod).toBe(PaymentGateway.BANK_TRANSFER);
    });

    it('rejects a disabled manual method', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      (service as any).gatewayConfigService.getGatewaysSummary.mockResolvedValue([
        { gateway: 'pay_later', enabled: false },
      ]);

      await expect(
        service.checkout(
          { ...checkoutInput, gateway: PaymentGateway.PAY_LATER },
          'user-1',
        ),
      ).rejects.toThrow('is not enabled');
      expect(createPaymentIntent.execute).not.toHaveBeenCalled();
    });

    // Characterization test (unified-pipeline plan Phase 1, R6): pins the
    // guest checkout price contract so the unification phases cannot drift it.
    // Contract: customerAmount = supplierAmount + markup (guests/customers are
    // charged the marked-up price; supplierAmount stays the net).
    it('guest checkout charges the marked-up price, not the net (characterization)', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      createPaymentIntent.execute.mockResolvedValue({
        paymentId: 'pay-1',
        clientSecret: 'secret_xxx',
        checkoutUrl: null,
      });
      // 5% markup over the 350.00 net
      markupService.calculatePrice.mockResolvedValue({
        finalPrice: 367.5,
        effectiveMarkupPercent: 5,
        appliedRules: [],
      });

      const result = await service.checkout(checkoutInput, 'user-1');

      expect(result.bookingId).toBeDefined();
      // The persisted booking must carry net in supplierAmount and the
      // marked-up total in customerAmount.
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierAmount: 350.0,
          customerAmount: 367.5,
        }),
      );
      expect(result.paymentId).toBe('pay-1');
    });

    // Characterization test (unified pipeline Phase 5, R4): agent checkout
    // takes the wallet reserve-commit branch — hold reserved, payment.succeeded
    // fired with a wallet paymentId, NO gateway PaymentIntent.
    it('agent checkout reserves wallet hold and fires payment.succeeded (characterization)', async () => {
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      // 3% agent markup over the 350.00 net
      markupService.calculatePrice.mockResolvedValue({
        finalPrice: 360.5,
        effectiveMarkupPercent: 3,
        appliedRules: [],
      });
      const result = await service.checkout(checkoutInput, 'agent-user-1', {
        userType: 'AGENT',
        agentProfileId: 'agent-profile-1',
      });

      expect(walletMock.reserveHoldForBooking).toHaveBeenCalledWith(
        'agent-profile-1',
        360.5,
        'hotel',
        'EUR',
      );
      expect(result.paymentMethod).toBe('wallet');
      expect(result.bookingId).toBeDefined();
      expect(result.holdId).toBe('hold-1');
      // No PaymentIntent for wallet bookings
      expect(createPaymentIntent.execute).not.toHaveBeenCalled();
    });

    it('passes captureMethod: manual for Ratehawk provider', async () => {
      mockProvider.key = 'ratehawk';
      mockProvider.capabilities = { supportsManualCapture: true };
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      createPaymentIntent.execute.mockResolvedValue({
        paymentId: 'pay-1',
        clientSecret: 'secret_xxx',
        checkoutUrl: null,
      });

      const result = await service.checkout({ ...checkoutInput, provider: 'ratehawk' }, 'user-1');

      expect(result.bookingId).toBeDefined();
      expect(createPaymentIntent.execute).toHaveBeenCalledWith(
        expect.objectContaining({ captureMethod: 'manual' }),
      );
    });
  });

  describe('confirm', () => {
    it('throws HOTELS_BOOKING_NOT_FOUND when booking missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.confirm('not-found')).rejects.toThrow(BusinessError);
    });

    it('returns already booked when status is booked', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'booked', hotelbedsRef: 'HB123', supplierReference: 'HB123' });
      const result = await service.confirm('hb-1');
      expect(result.message).toBe('Already booked.');
    });

    it('throws HOTELS_BOOKING_CANCELLED when booking is cancelled', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'cancelled' });
      await expect(service.confirm('hb-1')).rejects.toThrow(BusinessError);
    });

    it('throws HOTELS_RATE_PRICE_CHANGED when price diff > 5%', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      mockProvider.validateRate.mockResolvedValue({
        ...mockValidatedRate,
        supplierAmount: 400.00,
      });

      await expect(service.confirm('hb-1')).rejects.toThrow(BusinessError);
    });

    it('books hotel successfully and captures manual payment', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      mockProvider.createBooking.mockResolvedValue({
        provider: 'ratehawk',
        booking: { reference: 'RH123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);
      mockProvider.retrieveBooking.mockResolvedValue({
        provider: 'ratehawk',
        booking: { reference: 'RH123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);
      const mockCapturePayment = jest.fn().mockResolvedValue({ status: 'succeeded' });
      const mockGateway = { capturePayment: mockCapturePayment };
      paymentRepo.findMany.mockResolvedValue([
        { id: 'pay-1', bookingId: 'hb-1', gateway: 'stripe', status: 'AUTHORIZED', captureMethod: 'manual', providerPaymentId: 'pi_xxx' },
      ] as any);
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.confirm('hb-1');

      expect(result.status).toBe('booked');
      expect(mockCapturePayment).toHaveBeenCalledWith('pi_xxx');
      expect(paymentRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.PAID }),
      );
    });

    it('books hotel successfully via provider and marks as booked', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      mockProvider.createBooking.mockResolvedValue({
        provider: 'hotelbeds',
        booking: { reference: 'HB123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);
      mockProvider.retrieveBooking.mockResolvedValue({
        provider: 'hotelbeds',
        booking: { reference: 'HB123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);

      const result = await service.confirm('hb-1');

      expect(result.status).toBe('booked');
      expect(result.reference).toBe('HB123');
      expect(bookingRepo.update).toHaveBeenCalledWith('hb-1', expect.objectContaining({ status: 'booked' }));
      expect(mockProvider.createBooking).toHaveBeenCalled();
      expect(mockProvider.retrieveBooking).toHaveBeenCalled();
    });

    it('tolerates retrieveBooking failure and still returns booked', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      mockProvider.createBooking.mockResolvedValue({
        provider: 'hotelbeds',
        booking: { reference: 'HB123', status: 'CONFIRMED', hotel: null, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);
      mockProvider.retrieveBooking.mockRejectedValue(new Error('Network error'));

      const result = await service.confirm('hb-1');

      expect(result.status).toBe('booked');
      expect(result.reference).toBe('HB123');
    });

    it('confirms from awaiting_issue (admin Issue after Auto-Issue-After-Payment was off)', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'awaiting_issue' });
      // Only the 'pending_payment' claim attempt should fail — the admin-issue
      // path must fall back to claiming from 'awaiting_issue' instead of
      // throwing HOTELS_BOOKING_ALREADY_PROCESSED.
      bookingRepo.atomicClaimStatus.mockImplementation((_id: string, from: string) =>
        Promise.resolve(from === 'awaiting_issue'),
      );
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      mockProvider.createBooking.mockResolvedValue({
        provider: 'hotelbeds',
        booking: { reference: 'HB123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);
      mockProvider.retrieveBooking.mockResolvedValue({
        provider: 'hotelbeds',
        booking: { reference: 'HB123', status: 'CONFIRMED', hotel: { name: 'Test Hotel', hotelId: '12345' }, rooms: [], price: { totalNet: 350, currency: 'EUR' } },
      } as any);

      const result = await service.confirm('hb-1');

      expect(result.status).toBe('booked');
      expect(bookingRepo.atomicClaimStatus).toHaveBeenCalledWith(
        'hb-1',
        'pending_payment',
        'booking_in_progress',
        expect.any(String),
      );
      expect(bookingRepo.atomicClaimStatus).toHaveBeenCalledWith(
        'hb-1',
        'awaiting_issue',
        'booking_in_progress',
        expect.any(String),
      );
    });

    it('marks booking as failed when provider booking fails', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      mockProvider.validateRate.mockResolvedValue(mockValidatedRate);
      mockProvider.createBooking.mockRejectedValue(new Error('Provider confirmation error'));

      await expect(service.confirm('hb-1')).rejects.toThrow(BusinessError);
      expect(bookingRepo.update).toHaveBeenCalledWith('hb-1', expect.objectContaining({ status: 'failed_supplier_booking' }));
    });
  });

  describe('cancelBooking', () => {
    it('cancels booking and refunds paid payment', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'booked', supplierReference: 'HB123' });
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'hb-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PAID,
        providerPaymentId: 'pi_xxx',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);
      mockProvider.cancelBooking.mockResolvedValue({
        provider: 'hotelbeds',
        reference: 'HB123',
        status: 'cancelled',
      });

      const result = await service.cancelBooking('hb-1', 'Guest changed mind');

      expect(result.status).toBe('cancelled');
      expect(bookingRepo.update).toHaveBeenCalledWith('hb-1', expect.objectContaining({ status: 'cancelled' }));
      // Should call supplier cancellation for confirmed bookings
      expect(mockProvider.cancelBooking).toHaveBeenCalledWith(
        expect.objectContaining({ reference: 'HB123' }),
      );
    });

    it('skips supplier cancellation for non-booked bookings', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking); // Status: pending_payment
      const result = await service.cancelBooking('hb-1');
      expect(result.status).toBe('cancelled');
      expect(mockProvider.cancelBooking).not.toHaveBeenCalled();
    });

    it('charges supplier cancellation fee and refunds partially', async () => {
      const withPolicies = {
        ...mockHotelBooking,
        status: 'booked',
        supplierReference: 'HB123',
        rateSnapshot: {
          roomAdults: 2,
          roomChildren: 0,
          checkedAt: '2026-08-01T00:00:00.000Z',
          cancellationPolicies: [
            { amount: '100', from: '2026-08-01T00:00:00' },
          ],
        },
        amount: 350.0,
      };
      bookingRepo.findById.mockResolvedValue(withPolicies);
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'hb-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PAID,
        providerPaymentId: 'pi_xxx',
        amount: 350,
        currency: 'EUR',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);
      mockProvider.cancelBooking.mockResolvedValue({
        provider: 'hotelbeds',
        reference: 'HB123',
        status: 'cancelled',
      });

      const result = await service.cancelBooking('hb-1');

      expect(result.status).toBe('cancelled');
      expect(result.cancellationFee).toBe(100);
      expect(result.refundAmount).toBe(250);
      expect(result.isFreeCancellation).toBe(false);
      expect(mockGateway.refundPayment).toHaveBeenCalledWith('pi_xxx', 250, 'EUR');
    });

    it('returns free cancellation with full refund when no policies', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'booked', supplierReference: 'HB123' });
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'hb-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PAID,
        providerPaymentId: 'pi_xxx',
        amount: 350,
        currency: 'EUR',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);
      mockProvider.cancelBooking.mockResolvedValue({
        provider: 'hotelbeds',
        reference: 'HB123',
        status: 'cancelled',
      });

      const result = await service.cancelBooking('hb-1');

      expect(result.cancellationFee).toBe(0);
      expect(result.refundAmount).toBe(350);
      expect(result.isFreeCancellation).toBe(true);
      expect(mockGateway.refundPayment).toHaveBeenCalledWith('pi_xxx', 350, 'EUR');
    });

    it('returns cancellation estimate without cancelling', async () => {
      const withPolicies = {
        ...mockHotelBooking,
        status: 'booked',
        rateSnapshot: {
          cancellationPolicies: [
            { percentage: '50', from: '2026-08-01T00:00:00' },
          ],
        },
      };
      bookingRepo.findById.mockResolvedValue(withPolicies);
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'hb-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PAID,
        amount: 200,
        currency: 'EUR',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);

      const result = await service.getCancelEstimate('hb-1');

      expect(result.cancellationFee).toBe(100);
      expect(result.refundAmount).toBe(100);
      expect(result.isFreeCancellation).toBe(false);
      expect(mockProvider.cancelBooking).not.toHaveBeenCalled();
    });

    it('throws HOTELS_BOOKING_NOT_CANCELLABLE for non-cancellable status', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'failed' });
      await expect(service.cancelBooking('hb-1')).rejects.toThrow(BusinessError);
    });

    it('throws HOTELS_BOOKING_NOT_FOUND when missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.cancelBooking('not-found')).rejects.toThrow(BusinessError);
    });

    it('cancels AUTHORIZED payment on cancel', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking); // pending_payment
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'hb-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.AUTHORIZED,
        providerPaymentId: 'pi_xxx',
        captureMethod: 'manual',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { cancelPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.cancelBooking('hb-1');

      expect(result.status).toBe('cancelled');
      expect(mockGateway.cancelPayment).toHaveBeenCalledWith('pi_xxx');
      expect(paymentRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.CANCELLED }),
      );
    });
  });

  describe('getBooking', () => {
    it('returns booking when found', async () => {
      bookingRepo.findById.mockResolvedValue(mockHotelBooking);
      const result = await service.getBooking('hb-1');
      expect(result.id).toBe('hb-1');
      expect(result.status).toBe('pending_payment');
      expect(result.reference).toBeNull();
    });

    it('returns supplierReference with hotelbedsRef fallback for old bookings', async () => {
      // Simulate an old booking that only has hotelbedsRef set
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, hotelbedsRef: 'HB-LEGACY', supplierReference: null });
      const result = await service.getBooking('hb-1');
      expect(result.reference).toBe('HB-LEGACY');
      expect(result.supplierReference).toBe('HB-LEGACY');
    });

    it('throws HOTELS_BOOKING_NOT_FOUND when missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.getBooking('not-found')).rejects.toThrow(BusinessError);
    });
  });

  describe('getBookingProgress', () => {
    it('returns success for booked bookings', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'booked', provider: 'hotelbeds' });
      const result = await service.getBookingProgress('hb-1');
      expect(result.status).toBe('success');
      expect(result.bookingId).toBe('hb-1');
      expect(result.module).toBe('hotels');
      expect(result.percent).toBe(100);
      expect(result.customerMessage).toBeUndefined();
      expect(result.adminTrace).toBeUndefined();
    });

    it('returns failed for failed_supplier_booking with customer-safe message', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'failed_supplier_booking', provider: 'hotelbeds' });
      const result = await service.getBookingProgress('hb-1');
      expect(result.status).toBe('failed');
      expect(result.customerMessage).toBe('The supplier could not confirm this booking. Our team will review it and contact you if needed.');
      expect(result.title).toBe('Booking failed');
    });

    it('returns running for booking_in_progress with sanitized trace', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockHotelBooking,
        status: 'booking_in_progress',
        provider: 'ratehawk',
        workflowTrace: {
          percent: 42,
          steps: [
            { id: 'payment_verify', label: 'Verifying payment', status: 'success', provider: 'payment' },
            { id: 'ratehawk_prebook', label: 'Rechecking price', status: 'running', provider: 'ratehawk' },
          ],
        },
      });
      const result = await service.getBookingProgress('hb-1');
      expect(result.status).toBe('running');
      expect(result.customerMessage).toBe('Your booking has been submitted to the supplier. Confirmation typically arrives within a few seconds.');
      expect(result.adminTrace).toBeDefined();
      expect(result.adminTrace!.steps).toHaveLength(2);
      expect(result.adminTrace!.steps[0].message).toBeUndefined(); // success steps have no message
      expect(result.adminTrace!.percent).toBe(42);
    });

    it('sanitizes failed step messages in adminTrace', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockHotelBooking,
        status: 'failed',
        provider: 'hotelbeds',
        workflowTrace: {
          steps: [
            { id: 'hotelbeds_booking', label: 'Creating booking', status: 'failed', provider: 'hotelbeds', durationMs: 2300, message: 'NETWORK_TIMEOUT: connection to Hotelbeds API failed after 30s' },
          ],
        },
      });
      const result = await service.getBookingProgress('hb-1');
      expect(result.adminTrace!.steps[0].message).toBe('An error occurred during this step.');
      expect(result.adminTrace!.steps[0].message).not.toContain('NETWORK_TIMEOUT');
    });

    it('sanitizes warning step messages in adminTrace', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockHotelBooking,
        status: 'booked',
        provider: 'ratehawk',
        workflowTrace: {
          steps: [
            { id: 'hotel_confirmation_number', label: 'Hotel confirmation', status: 'warning', provider: 'ratehawk', durationMs: 500, message: 'Pending from hotel — will update automatically' },
          ],
        },
      });
      const result = await service.getBookingProgress('hb-1');
      expect(result.adminTrace!.steps[0].message).toBe('Pending from hotel — will update automatically');
    });

    it('throws HOTELS_BOOKING_NOT_FOUND when booking missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.getBookingProgress('not-found')).rejects.toThrow(BusinessError);
    });

    it('returns customerMessage for failed statuses', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockHotelBooking, status: 'failed', provider: 'hotelbeds' });
      const result = await service.getBookingProgress('hb-1');
      expect(result.customerMessage).toBe('We were unable to process your booking. Please contact support for assistance.');
    });
  });

  describe('list', () => {
    it('returns all bookings for admin', async () => {
      bookingRepo.findAll.mockResolvedValue([mockHotelBooking]);
      const result = await service.list({ id: 'admin-1', role: 'admin' });
      expect(result).toHaveLength(1);
    });

    it('returns user bookings for non-admin with id', async () => {
      bookingRepo.findByUserId.mockResolvedValue([mockHotelBooking]);
      const result = await service.list({ id: 'user-1' });
      expect(result).toHaveLength(1);
    });

    it('returns empty for user without id', async () => {
      const result = await service.list({});
      expect(result).toEqual([]);
    });
  });
});
