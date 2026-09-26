import { Test } from '@nestjs/testing';
import { FlightBookingPublicService } from './flight-booking-public.service';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import { FlightsProviderRegistryService } from './flights-provider-registry.service';
import { TravelportBookingWorkflowService } from './travelport-booking-workflow.service';
import { CreatePaymentIntentUseCase } from '../../../payment/application/use-cases/create-payment-intent.use-case';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { FlightBookingRepoPortToken } from '../../application/ports/flight-booking-repo.port';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { PaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { TravelportAncillaryService } from './travelport-ancillary.service';
import { MarkupService } from '../../../markup/markup.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import { PromoCodeEligibilityService } from '../../../promo-codes/application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from '../../../promo-codes/application/services/promo-code-pricing.service';
import { PromoCodeRepositoryToken } from '../../../promo-codes/application/ports/promo-code.repository.port';
import { FlightOfferSnapshotService } from './flight-offer-snapshot.service';
import { WalletService } from '../../../wallet/wallet.service';
import { CustomerWalletService } from '../../../wallet/customer-wallet.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { InvoiceService } from '../../../invoices/application/services/invoice.service';

describe('FlightBookingPublicService', () => {
  let service: FlightBookingPublicService;
  let providerRegistry: jest.Mocked<FlightsProviderRegistryService>;
  let bookingWorkflow: jest.Mocked<TravelportBookingWorkflowService>;
  let createPaymentIntent: jest.Mocked<CreatePaymentIntentUseCase>;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let paymentOrchestrator: jest.Mocked<PaymentOrchestratorService>;
  let bookingRepo: { create: jest.Mock; update: jest.Mock; findById: jest.Mock; findAll: jest.Mock; findByUserId: jest.Mock; findPendingByUserAndOffer: jest.Mock; transitionStatus: jest.Mock };

  const mockBooking = {
    id: 'booking-1',
    provider: 'travelport',
    status: 'pending_payment',
    offerSnapshot: {
      offerId: 'offer-1',
      productId: 'product-1',
      catalogUuid: 'catalog-1',
      searchKey: 'search-key-1',
      from: 'LHR',
      to: 'JFK',
      departureDate: '2026-07-15',
      tripType: 'one_way' as const,
    },
    travelerSnapshot: [{ givenName: 'John', surname: 'Doe', gender: 'Male', birthDate: '1990-01-01', passengerTypeCode: 'ADT', phoneCountryCode: '1', phoneNumber: '555-0100', email: 'john@test.com' }],
    amount: 450.00,
    currency: 'USD',
    userId: 'user-1',
  };

  beforeEach(async () => {
    bookingRepo = {
      create: jest.fn().mockResolvedValue({ ...mockBooking, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
      update: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(null),
      findAll: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue([]),
      findPendingByUserAndOffer: jest.fn().mockResolvedValue(null),
      transitionStatus: jest.fn().mockResolvedValue(null),
    };

    providerRegistry = {
      resolveActiveProvider: jest.fn().mockResolvedValue(undefined),
    } as any;

    bookingWorkflow = {
      runWorkflow: jest.fn(),
    } as any;

    createPaymentIntent = {
      execute: jest.fn(),
    } as any;

    paymentRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByReference: jest.fn(),
      findByProviderPaymentId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    } as any;

    paymentOrchestrator = {
      getGateway: jest.fn(),
    } as any;

    const mockAncillaryService = {} as any;
    const mockMarkupService = {
      calculatePrice: jest.fn().mockResolvedValue({
        finalPrice: 450.00,
        effectiveMarkupPercent: 0,
        appliedRules: [],
      }),
    } as any;
    const mockConfigService = {
      travelport: {
        allowLegacyLocator: false,
        defaultContentSourceList: ['GDS'],
        ancillaryPriceTolerance: 0.03,
        strictReprice: false,
      },
      cache: { keyPrefix: 'test' },
    } as any;
    const mockCacheService = {
      get: jest.fn().mockImplementation(async (key: string) => {
        if (key === 'flight-search-provider-map:search-key-1') {
          return { 'offer-1': 'travelport' };
        }
        return null;
      }),
    } as any;
    const mockSelectedOfferCache = {
      store: jest.fn().mockResolvedValue(undefined),
      retrieve: jest.fn().mockResolvedValue(null),
    } as any;
    const mockCurrencyService = {
      getByCode: jest.fn().mockResolvedValue({ exchangeRate: 1, decimals: 2 }),
      getDecimals: jest.fn().mockResolvedValue(2),
      convert: jest
        .fn()
        .mockImplementation(async (amount: number, _from: string, to: string) => ({
          amount,
          currency: to,
        })),
      toSmallestUnit: jest.fn().mockImplementation(async (amount: number) => Math.round(amount * 100)),
      fromSmallestUnit: jest.fn().mockImplementation(async (minor: number) => minor / 100),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        FlightBookingPublicService,
        { provide: FlightsProviderRegistryService, useValue: providerRegistry },
        { provide: FlightBookingProviderRegistryService, useValue: { getProvider: jest.fn() } },
        { provide: TravelportBookingWorkflowService, useValue: bookingWorkflow },
        { provide: CreatePaymentIntentUseCase, useValue: createPaymentIntent },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: paymentOrchestrator },
        { provide: FlightBookingRepoPortToken, useValue: bookingRepo },
        { provide: TravelportAncillaryService, useValue: mockAncillaryService },
        { provide: MarkupService, useValue: mockMarkupService },
        { provide: AppConfigService, useValue: mockConfigService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: SelectedOfferCacheService, useValue: mockSelectedOfferCache },
        { provide: CurrencyService, useValue: mockCurrencyService },
        { provide: OutboxWriterService, useValue: { write: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationService, useValue: { notifyDirect: jest.fn().mockResolvedValue(undefined) } },
        { provide: PromoCodeRedemptionService, useValue: { refundByBookingId: jest.fn().mockResolvedValue(undefined), releaseByBookingId: jest.fn().mockResolvedValue(undefined) } },
        { provide: PromoCodeEligibilityService, useValue: {} },
        { provide: PromoCodePricingService, useValue: {} },
        { provide: PromoCodeRepositoryToken, useValue: {} },
        { provide: FlightOfferSnapshotService, useValue: {} },
        { provide: WalletService, useValue: { validateAgentBookingPermission: jest.fn(), reserveHoldForBooking: jest.fn(), releaseHold: jest.fn() } },
        { provide: CustomerWalletService, useValue: { reserveHoldForBooking: jest.fn() } },
        { provide: ImmediateOutboxDispatcherService, useValue: { dispatch: jest.fn() } },
        { provide: PrismaService, useValue: { walletHold: { update: jest.fn().mockResolvedValue({}) }, user: { findUnique: jest.fn().mockResolvedValue(null) } } },
        { provide: SiteSettingStore, useValue: { get: jest.fn().mockResolvedValue(null) } },
        { provide: PaymentGatewayConfigService, useValue: { getGatewaysSummary: jest.fn().mockResolvedValue([]) } },
        { provide: InvoiceService, useValue: { generateForBooking: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    service = module.get<FlightBookingPublicService>(FlightBookingPublicService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('preview', () => {
    const previewInput = {
      offerId: 'offer-1',
      productId: 'product-1',
      catalogUuid: 'catalog-1',
      searchKey: 'search-key-1',
      from: 'LHR',
      to: 'JFK',
      departureDate: '2026-07-15',
      totalPrice: 450.00,
      currency: 'USD',
      tripType: 'one_way' as const,
      travelers: [{ givenName: 'John', surname: 'Doe', gender: 'Male', birthDate: '1990-01-01', passengerTypeCode: 'ADT', phoneCountryCode: '1', phoneNumber: '555-0100', email: 'john@test.com' }],
    };

    it('creates a booking with pending_payment status', async () => {
      const result = await service.preview(previewInput, 'user-1');

      expect(result.status).toBe('pending_payment');
      expect(result.bookingId).toBeDefined();
      expect(result.amount).toBe(450.00);
      expect(result.currency).toBe('USD');
      expect(result.next).toBe('payment');
      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_payment', amount: 450.00, currency: 'USD', userId: 'user-1' }),
      );
    });

    it('uses totalPrice from input', async () => {
      const result = await service.preview({ ...previewInput });

      expect(result.amount).toBe(450.00);
      expect(result.currency).toBe('USD');
    });

    it('throws FLIGHTS_SEARCH_EXPIRED when no searchKey and no fallback price', async () => {
      await expect(service.preview({ ...previewInput, searchKey: undefined, totalPrice: undefined }))
        .rejects.toThrow(BusinessError);
    });

    it('throws FLIGHTS_PROVIDER_DISABLED when provider fails', async () => {
      providerRegistry.resolveActiveProvider.mockRejectedValue(
        new BusinessError('FLIGHTS_PROVIDER_DISABLED'),
      );
      await expect(service.preview(previewInput)).rejects.toThrow(BusinessError);
    });

    it('stores seatProductIds and baggageProductIds in offerSnapshot', async () => {
      const inputWithAncillaries = {
        ...previewInput,
        seatProductIds: ['seat-prod-1', 'seat-prod-2'],
        baggageProductIds: ['bag-prod-1'],
      };

      await service.preview(inputWithAncillaries, 'user-1');

      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          offerSnapshot: expect.objectContaining({
            seatProductIds: ['seat-prod-1', 'seat-prod-2'],
            baggageProductIds: ['bag-prod-1'],
          }),
        }),
      );
    });

    it('stores empty ancillary arrays when none provided', async () => {
      await service.preview(previewInput, 'user-1');

      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          offerSnapshot: expect.objectContaining({
            seatProductIds: undefined,
            baggageProductIds: undefined,
          }),
        }),
      );
    });

    it('decodes seat blobs into seat numbers and prices', async () => {
      const seatId =
        'seat:' +
        encodeURIComponent(
          JSON.stringify({ seat: '25F', priceText: '2863 INR' }),
        );
      await service.preview(
        { ...previewInput, seatProductIds: [seatId] },
        'user-1',
      );

      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          offerSnapshot: expect.objectContaining({
            ancillaries: expect.objectContaining({
              seats: [
                expect.objectContaining({ seatNumber: '25F' }),
              ],
            }),
          }),
        }),
      );
    });

    it('maps mealSelectionIds and serviceProductIds into snapshot ancillaries', async () => {
      const mealId =
        'meal:' +
        encodeURIComponent(
          JSON.stringify({
            productId: 'specialservices:meal:VGML',
            mealName: 'Vegetarian Meal',
            mealCode: 'VGML',
            dietaryType: 'Vegetarian',
          }),
        );
      const serviceId =
        'service:' +
        encodeURIComponent(
          JSON.stringify({
            productId: 'svc-1',
            label: 'Extra Legroom',
            serviceType: 'other',
            travelerIndex: 0,
          }),
        );
      await service.preview(
        { ...previewInput, mealSelectionIds: [mealId], serviceProductIds: [serviceId] },
        'user-1',
      );

      expect(bookingRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          offerSnapshot: expect.objectContaining({
            ancillaries: expect.objectContaining({
              meals: [
                expect.objectContaining({ mealCode: 'VGML', travelerIndex: 0 }),
              ],
              services: [
                expect.objectContaining({ ancillaryProductId: 'svc-1' }),
              ],
            }),
          }),
        }),
      );
    });
  });

  describe('checkout', () => {
    const checkoutInput = {
      offerId: 'offer-1',
      productId: 'product-1',
      catalogUuid: 'catalog-1',
      searchKey: 'search-key-1',
      from: 'LHR',
      to: 'JFK',
      departureDate: '2026-07-15',
      totalPrice: 450.00,
      currency: 'USD',
      tripType: 'one_way' as const,
      travelers: [{ givenName: 'John', surname: 'Doe', gender: 'Male', birthDate: '1990-01-01', passengerTypeCode: 'ADT', phoneCountryCode: '1', phoneNumber: '555-0100', email: 'john@test.com' }],
      gateway: PaymentGateway.STRIPE,
      successUrl: 'https://example.com/success',
      cancelUrl: 'https://example.com/cancel',
    };

    it('creates preview then payment intent', async () => {
      createPaymentIntent.execute.mockResolvedValue({
        paymentId: 'pay-1',
        clientSecret: 'secret_xxx',
        checkoutUrl: null,
      });

      const result = await service.checkout(checkoutInput, 'user-1');

      expect(result.bookingId).toBeDefined();
      expect(result.paymentId).toBe('pay-1');
      expect(result.clientSecret).toBe('secret_xxx');
      expect(createPaymentIntent.execute).toHaveBeenCalledWith(
        expect.objectContaining({ gateway: PaymentGateway.STRIPE, amount: 450.00, currency: 'USD' }),
      );
    });

    it('marks booking as failed when payment intent creation fails', async () => {
      createPaymentIntent.execute.mockRejectedValue(new Error('Gateway error'));

      await expect(service.checkout(checkoutInput, 'user-1')).rejects.toThrow('Gateway error');
      expect(bookingRepo.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'failed' }),
      );
    });

    it('holds without a gateway intent for bank_transfer', async () => {
      (service as any).siteSettings.get.mockResolvedValue(60);
      (service as any).gatewayConfigService.getGatewaysSummary.mockResolvedValue([
        { gateway: 'bank_transfer', enabled: true },
      ]);

      const result = await service.checkout(
        { ...checkoutInput, gateway: PaymentGateway.BANK_TRANSFER },
        'user-1',
      );

      expect(createPaymentIntent.execute).not.toHaveBeenCalled();
      expect(paymentRepo.create).toHaveBeenCalled();
      expect(result.paymentId).toBeDefined();
      expect(result.clientSecret).toBeNull();
      expect(result.holdExpiresAt).toBeDefined();
    });

    it('rejects a disabled manual method', async () => {
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

    describe('pre-payment hold failure (fake booking fallback)', () => {
      const ORIGINAL_ENV = { ...process.env };

      beforeEach(() => {
        process.env.DEMO_MODE_ENABLED = 'true';
        process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com';
        // Travelport bookings are gated by TRAVELPORT_FAKE_BOOKING_ENABLED
        // only — the DEMO_MODE_* vars above no longer apply to them.
        process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
        delete process.env.REAL_ADMIN_EMAIL; // defaults to superadmin@travelsota-dev.local
        delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;

        jest.spyOn(service as any, 'detectProviderFromSearch').mockResolvedValue('travelport');
        (service as any).bookingProviderRegistry = {
          getProvider: jest.fn().mockReturnValue({
            capabilities: { supportsPrePaymentHold: true },
          }),
        };
        createPaymentIntent.execute.mockResolvedValue({
          paymentId: 'pay-1',
          clientSecret: 'secret_xxx',
          checkoutUrl: null,
        });
      });

      afterEach(() => {
        process.env = { ...ORIGINAL_ENV };
      });

      it('now also lets a real, non-demo customer proceed on hold failure — Travelport inventory is unreliable for everyone', async () => {
        jest.spyOn(service, 'createHold').mockResolvedValue({ ok: false, message: 'FARE NOT AVAILABLE' });
        (service as any).prisma.user.findUnique.mockResolvedValue({ email: 'real.customer@example.com' });

        const result = await service.checkout(checkoutInput, 'user-1');

        expect(result.paymentId).toBe('pay-1');
      });

      it('blocks payment on hold failure for a real, non-demo customer when TRAVELPORT_FAKE_BOOKING_ENABLED is off', async () => {
        process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
        jest.spyOn(service, 'createHold').mockResolvedValue({ ok: false, message: 'FARE NOT AVAILABLE' });
        (service as any).prisma.user.findUnique.mockResolvedValue({ email: 'real.customer@example.com' });

        await expect(service.checkout(checkoutInput, 'user-1')).rejects.toThrow(
          'This fare is no longer available',
        );
        expect(createPaymentIntent.execute).not.toHaveBeenCalled();
      });

      it('never blocks payment on hold failure for the real super admin', async () => {
        jest.spyOn(service, 'createHold').mockResolvedValue({ ok: false, message: 'FARE NOT AVAILABLE' });
        (service as any).prisma.user.findUnique.mockResolvedValue({ email: 'superadmin@travelsota-dev.local' });

        await expect(service.checkout(checkoutInput, 'user-1')).rejects.toThrow(
          'This fare is no longer available',
        );
      });

      it('lets a demo-account session proceed to payment despite the hold failure', async () => {
        jest.spyOn(service, 'createHold').mockResolvedValue({ ok: false, message: 'FARE NOT AVAILABLE' });
        (service as any).prisma.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });

        const result = await service.checkout(checkoutInput, 'user-1');

        expect(result.paymentId).toBe('pay-1');
        expect(createPaymentIntent.execute).toHaveBeenCalled();
      });

      it('lets a guest session (no userId) proceed to payment when demo mode is on', async () => {
        jest.spyOn(service, 'createHold').mockResolvedValue({ ok: false, message: 'FARE NOT AVAILABLE' });

        const result = await service.checkout(checkoutInput);

        expect(result.paymentId).toBe('pay-1');
        expect(createPaymentIntent.execute).toHaveBeenCalled();
      });
    });
  });

  describe('confirm', () => {
    const confirmInput = { bookingId: 'booking-1' } as any;

    it('throws FLIGHTS_BOOKING_NOT_FOUND when booking missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.confirm(confirmInput)).rejects.toThrow(BusinessError);
    });

    it('returns already booked when status is booked', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'booked', locatorCode: 'ABC123' });
      const result = await service.confirm(confirmInput);
      expect(result.message).toBe('Booking already booked.');
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('throws FLIGHTS_BOOKING_FAILED when booking is in failed status', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'failed' });
      await expect(service.confirm(confirmInput)).rejects.toThrow(BusinessError);
    });

    it('throws FLIGHTS_BOOKING_CANCELLED when booking is cancelled', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'cancelled' });
      await expect(service.confirm(confirmInput)).rejects.toThrow(BusinessError);
    });

    it('runs workflow and marks booking as held on success', async () => {
      paymentRepo.findMany.mockResolvedValue([{ status: PaymentStatus.PAID }] as any);
      const heldBooking = { ...mockBooking, status: 'held', locatorCode: 'LOC123', workbenchId: 'wb-1', reservationId: 'res-1' };
      bookingRepo.findById
        .mockResolvedValueOnce(mockBooking)
        .mockResolvedValueOnce(mockBooking)
        .mockResolvedValue(heldBooking);
      bookingWorkflow.runWorkflow.mockResolvedValue({
        ok: true,
        identifiers: { locatorCode: 'LOC123', workbenchId: 'wb-1', reservationId: 'res-1' },
      });

      const result = await service.confirm(confirmInput);

      expect(result.locatorCode).toBe('LOC123');
      expect(bookingRepo.update).toHaveBeenCalledWith('booking-1', expect.objectContaining({ status: 'held' }));
    });

    it('marks booking as failed when workflow fails', async () => {
      paymentRepo.findMany.mockResolvedValue([{ status: PaymentStatus.PAID }] as any);
      bookingRepo.findById.mockResolvedValue(mockBooking);
      bookingWorkflow.runWorkflow.mockResolvedValue({ ok: false, failedStep: 'commit-booking', steps: [{ name: 'commit-booking', status: 'error', errors: [{ Code: 'ERR_001', Message: 'Booking failed at GDS' }] }] });

      await expect(service.confirm(confirmInput)).rejects.toThrow(BusinessError);
      expect(bookingRepo.update).toHaveBeenCalledWith('booking-1', expect.objectContaining({ status: 'failed' }));
    });

    it('passes offerSnapshot.ancillaries from booking to workflow', async () => {
      paymentRepo.findMany.mockResolvedValue([{ status: PaymentStatus.PAID }] as any);
      const bookingWithAncillaries = {
        ...mockBooking,
        offerSnapshot: {
          ...mockBooking.offerSnapshot,
          ancillaries: {
            seats: [{ type: 'seat', travelerIndex: 0, travelerRef: 't1', segmentRef: 's1', seatNumber: '12A', ancillaryProductId: 'seat-prod-1', price: { amount: 50, currency: 'USD' } }],
            baggage: [{ type: 'baggage', travelerIndex: 0, travelerRef: 't1', segmentRef: 's1', ancillaryProductId: 'bag-prod-1', label: 'Checked Bag', baggageType: 'Checked', weight: '23kg', pieces: 1, price: { amount: 75, currency: 'USD' } }],
            meals: [],
            services: [],
          },
        },
      };
      const heldBooking = { ...bookingWithAncillaries, status: 'held', locatorCode: 'LOC123' };
      bookingRepo.findById
        .mockResolvedValueOnce(bookingWithAncillaries)
        .mockResolvedValueOnce(bookingWithAncillaries)
        .mockResolvedValue(heldBooking);
      bookingWorkflow.runWorkflow.mockResolvedValue({
        ok: true,
        identifiers: { locatorCode: 'LOC123' },
      });

      await service.confirm(confirmInput);

      expect(bookingWorkflow.runWorkflow).toHaveBeenCalled();
      const calledArg = (bookingWorkflow.runWorkflow as jest.Mock).mock.calls[0][0];
      expect(calledArg.ancillaries).toBeDefined();
      expect(calledArg.ancillaries.seats).toHaveLength(1);
      expect(calledArg.ancillaries.seats[0].ancillaryProductId).toBe('seat-prod-1');
    });

    it('passes undefined ancillaries when not in offerSnapshot', async () => {
      paymentRepo.findMany.mockResolvedValue([{ status: PaymentStatus.PAID }] as any);
      const heldBooking = { ...mockBooking, status: 'held', locatorCode: 'LOC456' };
      bookingRepo.findById
        .mockResolvedValueOnce(mockBooking)
        .mockResolvedValueOnce(mockBooking)
        .mockResolvedValue(heldBooking);
      bookingWorkflow.runWorkflow.mockResolvedValue({
        ok: true,
        identifiers: { locatorCode: 'LOC456' },
      });

      await service.confirm(confirmInput);

      expect(bookingWorkflow.runWorkflow).toHaveBeenCalled();
      const calledArg = (bookingWorkflow.runWorkflow as jest.Mock).mock.calls[0][0];
      expect(calledArg.ancillaries).toBeUndefined();
    });
  });

  describe('cancelBooking', () => {
    it('cancels booking and refunds paid payment', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'booked' });
      const mockPayment = {
        id: 'pay-1',
        bookingId: 'booking-1',
        gateway: PaymentGateway.STRIPE,
        status: PaymentStatus.PAID,
        providerPaymentId: 'pi_xxx',
        amount: 450,
        currency: 'USD',
      };
      paymentRepo.findMany.mockResolvedValue([mockPayment] as any);
      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);

      const result = await service.cancelBooking('booking-1', 'Customer request');

      expect(result.status).toBe('cancelled');
      expect(paymentRepo.update).toHaveBeenCalled();
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'booked', 'cancelled', 'Customer request');
    });

    it('throws FLIGHTS_BOOKING_NOT_CANCELLABLE for non-cancellable status', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'failed' });
      await expect(service.cancelBooking('booking-1')).rejects.toThrow(BusinessError);
    });

    it('recovers a void_requested booking via cancel', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'void_requested' });
      paymentRepo.findMany.mockResolvedValue([]);

      const result = await service.cancelBooking('booking-1', 'Recovery cancel');

      expect(result.status).toBe('cancelled');
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith(
        'booking-1',
        'void_requested',
        'cancelled',
        'Recovery cancel',
      );
    });

    it('throws FLIGHTS_BOOKING_NOT_FOUND when booking missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.cancelBooking('not-found')).rejects.toThrow(BusinessError);
    });

    it('skips the supplier cancel call for a fake-PNR booking', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'held',
        locatorCode: 'TP-DEV/ABC123',
        workflowSummary: { demoMode: true },
      });
      const cancelBookingProvider = jest.fn();
      (service as any).bookingProviderRegistry = {
        getProvider: jest.fn().mockReturnValue({ cancelBooking: cancelBookingProvider }),
      };

      const result = await service.cancelBooking('booking-1', 'Cancelled by admin.');

      expect(result.status).toBe('cancelled');
      expect(cancelBookingProvider).not.toHaveBeenCalled();
    });

    it('still calls the supplier cancel for a real locator code', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'held',
        locatorCode: 'HN4VTH',
        workflowSummary: {},
      });
      const cancelBookingProvider = jest.fn().mockResolvedValue(undefined);
      (service as any).bookingProviderRegistry = {
        getProvider: jest.fn().mockReturnValue({ cancelBooking: cancelBookingProvider }),
      };

      const result = await service.cancelBooking('booking-1', 'Cancelled by admin.');

      expect(result.status).toBe('cancelled');
      expect(cancelBookingProvider).toHaveBeenCalled();
    });
  });

  describe('adminFlightDetail', () => {
    it('skips the live supplier retrieve for a fake-PNR booking', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'held',
        locatorCode: 'TP-DEV/ABC123',
        workflowSummary: { demoMode: true, realFailure: { status: 'failed_supplier_booking', message: 'BOOKING ERROR' } },
      });
      const retrieveBooking = jest.fn();
      (service as any).bookingProviderRegistry = {
        getProvider: jest.fn().mockReturnValue({ retrieveBooking }),
      };

      const result = await service.adminFlightDetail('booking-1');

      expect(retrieveBooking).not.toHaveBeenCalled();
      expect(result.demoBooking).toBe(true);
    });

    it('attempts a live supplier retrieve for a real booking', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'ticketed',
        locatorCode: 'HN4VTH',
        workflowSummary: {},
      });
      const retrieveBooking = jest.fn().mockResolvedValue({ ok: true, raw: { some: 'data' } });
      (service as any).bookingProviderRegistry = {
        getProvider: jest.fn().mockReturnValue({ retrieveBooking }),
      };

      const result = await service.adminFlightDetail('booking-1');

      expect(retrieveBooking).toHaveBeenCalled();
      expect(result.demoBooking).toBe(false);
    });
  });

  describe('getBooking', () => {
    it('returns booking when found', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking);
      const result = await service.getBooking('booking-1');
      expect(result.id).toBe('booking-1');
      expect(result.status).toBe('pending_payment');
    });

    it('throws FLIGHTS_BOOKING_NOT_FOUND when missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.getBooking('not-found')).rejects.toThrow(BusinessError);
    });
  });

  describe('getBookingProgress', () => {
    it('returns success for ticketed bookings', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'ticketed', provider: 'travelport' });
      const result = await service.getBookingProgress('booking-1');
      expect(result.status).toBe('success');
      expect(result.bookingId).toBe('booking-1');
      expect(result.module).toBe('flights');
      expect(result.title).toBe('Ticket issued');
      expect(result.percent).toBe(100);
      expect(result.customerMessage).toBeUndefined();
    });

    it('returns success for held bookings', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'held', provider: 'travelport' });
      const result = await service.getBookingProgress('booking-1');
      expect(result.status).toBe('success');
      expect(result.title).toBe('Booking confirmed');
      expect(result.percent).toBe(100);
    });

    it('returns failed for failed bookings with customer-safe message', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'failed', provider: 'travelport' });
      const result = await service.getBookingProgress('booking-1');
      expect(result.status).toBe('failed');
      expect(result.customerMessage).toBe('We were unable to complete your booking. Please contact support for assistance.');
      expect(result.title).toBe('Booking failed');
    });

    it('returns running for booking_in_progress', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, status: 'booking_in_progress', provider: 'travelport' });
      const result = await service.getBookingProgress('booking-1');
      expect(result.status).toBe('running');
      expect(result.percent).toBe(65);
      expect(result.customerMessage).toBe('Please wait while we finalize your flight reservation.');
    });

    it('sanitizes summary steps in adminTrace', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'failed',
        provider: 'travelport',
        workflowSummary: {
          percent: 70,
          steps: [
            { id: 'travelport_commit', label: 'Creating PNR', status: 'failed', provider: 'travelport', durationMs: 5000, message: 'API_ERROR: GDS returned error code 155' },
          ],
        },
      });
      const result = await service.getBookingProgress('booking-1');
      expect(result.adminTrace).toBeDefined();
      expect(result.adminTrace!.steps[0].message).toBe('An error occurred during this step.');
      expect(result.adminTrace!.steps[0].message).not.toContain('API_ERROR');
    });

    it('throws FLIGHTS_BOOKING_NOT_FOUND when booking missing', async () => {
      bookingRepo.findById.mockResolvedValue(null);
      await expect(service.getBookingProgress('not-found')).rejects.toThrow(BusinessError);
    });
  });

  describe('list', () => {
    it('returns all bookings for admin', async () => {
      bookingRepo.findAll.mockResolvedValue([mockBooking]);
      const result = await service.list({ id: 'admin-1', role: 'admin' });
      expect(result).toHaveLength(1);
      expect(bookingRepo.findAll).toHaveBeenCalled();
    });

    it('returns user bookings for non-admin', async () => {
      bookingRepo.findByUserId.mockResolvedValue([mockBooking]);
      const result = await service.list({ id: 'user-1' });
      expect(result).toHaveLength(1);
      expect(bookingRepo.findByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('ticketBooking (fake booking fallback)', () => {
    const ORIGINAL_ENV = { ...process.env };
    let prismaMock: { user: { findUnique: jest.Mock } };

    beforeEach(() => {
      process.env.DEMO_MODE_ENABLED = 'true';
      process.env.DEMO_MODE_EMAILS = 'admin@travelsota.com';
      // Travelport bookings are gated by TRAVELPORT_FAKE_BOOKING_ENABLED
      // only — the DEMO_MODE_* vars above no longer apply to them.
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'true';
      delete process.env.REAL_ADMIN_EMAIL; // defaults to superadmin@travelsota-dev.local
      delete process.env.ENABLE_FAKE_BOOKING_FALLBACK;
      prismaMock = (service as any).prisma;
    });

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV };
    });

    function spyInternal(result: any) {
      return jest
        .spyOn(service as any, 'ticketBookingInternal')
        .mockResolvedValue(result);
    }

    it('passes through a real success unchanged', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'user-1' });
      spyInternal({ ok: true, status: 'held', locatorCode: 'HN4VTH' });

      const result = await service.ticketBooking('booking-1');

      expect(result).toEqual({ ok: true, status: 'held', locatorCode: 'HN4VTH' });
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('fakes success for a demo-account booking on supplier failure', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'user-1', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
      expect(result.status).toBe('held');
      expect(result.locatorCode).toMatch(/^TP[A-Z0-9]{4}$/);
      expect(bookingRepo.update).toHaveBeenCalledWith(
        'booking-1',
        expect.objectContaining({
          status: 'held',
          locatorCode: expect.stringMatching(/^TP[A-Z0-9]{4}$/),
          workflowSummary: expect.objectContaining({
            demoMode: true,
            realFailure: expect.objectContaining({ status: 'failed_supplier_booking' }),
          }),
        }),
      );
    });

    it('fakes success for a guest booking (no userId) when demo mode is on', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: undefined, locatorCode: null });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'BOOKING ERROR' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
      expect(result.locatorCode).toMatch(/^TP[A-Z0-9]{4}$/);
    });

    it('never fakes success for the real super admin', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'admin-user', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'superadmin@travelsota-dev.local' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(false);
      expect(result.status).toBe('failed_supplier_booking');
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('now also fakes success for a real customer not on the demo list — Travelport inventory is unreliable for everyone', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'real-user', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'real.customer@example.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
      expect(result.locatorCode).toMatch(/^TP[A-Z0-9]{4}$/);
    });

    it('never fakes success for a real customer (or anyone) when TRAVELPORT_FAKE_BOOKING_ENABLED is off', async () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'real-user', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'real.customer@example.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(false);
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('never overwrites an existing real locator code', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'user-1', locatorCode: 'HN4VTH' });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'TICKETING FAILED' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(false);
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('always tickets (no hold_only mode — auto-issue toggle governs)', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        userId: 'user-1',
        status: 'held',
        locatorCode: 'HN4XKL',
      });
      (service as any).bookingWorkflowService.runTicketingWorkflow = jest
        .fn()
        .mockResolvedValue({
          ok: true,
          identifiers: { ticketNumbers: ['T1'], locatorCode: 'HN4XKL' },
        });

      const ticketed = await service.ticketBooking('booking-1');
      expect(ticketed.ok).toBe(true);
      expect(ticketed.status).toBe('ticketed');
      expect(ticketed.ticketNumbers).toEqual(['T1']);
      expect(
        (service as any).bookingWorkflowService.runTicketingWorkflow,
      ).toHaveBeenCalled();
    });

    it('skips the fallback entirely for non-Travelport providers', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, provider: 'duffel', userId: 'user-1' });
      const internalSpy = spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'REAL ERROR' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(false);
      expect(internalSpy).toHaveBeenCalledWith('booking-1', undefined);
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('refunds a real PAID payment before faking success, so no money is silently kept', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: undefined, locatorCode: null });
      const paidPayment = { status: PaymentStatus.PAID, providerPaymentId: 'pi_123', gateway: PaymentGateway.STRIPE, updatedAt: new Date() };
      paymentRepo.findMany.mockResolvedValue([paidPayment]);
      const refundPayment = jest.fn().mockResolvedValue(undefined);
      paymentOrchestrator.getGateway.mockReturnValue({ refundPayment } as any);
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'BOOKING ERROR' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
      expect(refundPayment).toHaveBeenCalledWith('pi_123');
      expect(paidPayment.status).toBe(PaymentStatus.REFUNDED);
    });

    it('ENABLE_FAKE_BOOKING_FALLBACK no longer gates Travelport — only TRAVELPORT_FAKE_BOOKING_ENABLED does', async () => {
      process.env.ENABLE_FAKE_BOOKING_FALLBACK = 'false';
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'user-1', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
    });

    it('respects the TRAVELPORT_FAKE_BOOKING_ENABLED kill switch', async () => {
      process.env.TRAVELPORT_FAKE_BOOKING_ENABLED = 'false';
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: 'user-1', locatorCode: null });
      prismaMock.user.findUnique.mockResolvedValue({ email: 'admin@travelsota.com' });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FARE NOT AVAILABLE' });

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(false);
      expect(bookingRepo.update).not.toHaveBeenCalled();
    });

    it('raises a provider-failure alert so the real admin still sees the faked failure', async () => {
      bookingRepo.findById.mockResolvedValue({ ...mockBooking, userId: undefined, locatorCode: null });
      spyInternal({ ok: false, status: 'failed_supplier_booking', message: 'FLIGHT CAN NOT BE BOARDED AT THIS CITY' });
      const write = jest.fn().mockResolvedValue('evt-1');
      (service as any).outboxWriter = { write };

      const result = await service.ticketBooking('booking-1');

      expect(result.ok).toBe(true);
      expect(write).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'provider.travelport.failure',
          aggregateId: 'booking-1',
          payload: expect.objectContaining({
            reason: expect.stringContaining('FLIGHT CAN NOT BE BOARDED AT THIS CITY'),
          }),
        }),
      );
    });
  });

  describe('fake-PNR bookings never reach the supplier again', () => {
    const fakeBooking = (over: Record<string, unknown> = {}) => ({
      ...mockBooking,
      status: 'held',
      locatorCode: 'TP-DEV/AB12CD',
      workflowSummary: { demoMode: true },
      ...over,
    });

    it('ticketBooking keeps the existing fake PNR and skips the supplier', async () => {
      bookingRepo.findById.mockResolvedValue(fakeBooking({ status: 'booking_in_progress' }));
      const internal = jest.spyOn(service as any, 'ticketBookingInternal');

      const result = await service.ticketBooking('booking-1');

      expect(internal).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, status: 'held', locatorCode: 'TP-DEV/AB12CD' });
      expect(bookingRepo.update).toHaveBeenCalledWith('booking-1', expect.objectContaining({ status: 'held' }));
    });

    it('an admin Issue (forceTicket) settles a fake booking locally as ticketed', async () => {
      bookingRepo.findById.mockResolvedValue(fakeBooking());
      const internal = jest.spyOn(service as any, 'ticketBookingInternal');

      const result = await service.ticketBooking('booking-1', { forceTicket: true });

      expect(internal).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, status: 'ticketed', locatorCode: 'TP-DEV/AB12CD' });
    });

    it('voidBooking voids a fake ticket locally without calling the supplier', async () => {
      bookingRepo.findById.mockResolvedValue(fakeBooking({ status: 'ticketed' }));
      const getProvider = jest.fn();
      (service as any).bookingProviderRegistry = { getProvider };

      const result = await service.voidBooking('booking-1', 'admin void');

      expect(result.status).toBe('voided');
      expect(getProvider).not.toHaveBeenCalled();
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'void_requested', 'voided', expect.any(String));
    });

    it('requestRefund settles a fake booking locally without calling the supplier', async () => {
      bookingRepo.findById.mockResolvedValue(fakeBooking({ status: 'ticketed' }));
      const getProvider = jest.fn();
      (service as any).bookingProviderRegistry = { getProvider };

      const result = await service.requestRefund('booking-1');

      expect(result.status).toBe('refund_pending');
      expect(getProvider).not.toHaveBeenCalled();
    });

    it('quoteRefund answers from the stored fare rules for a fake booking', async () => {
      bookingRepo.findById.mockResolvedValue(
        fakeBooking({ offerSnapshot: { display: { refundPolicy: { allowed: false } } } }),
      );
      const getProvider = jest.fn();
      (service as any).bookingProviderRegistry = { getProvider };

      const quote = await service.quoteRefund('booking-1');

      expect(getProvider).not.toHaveBeenCalled();
      expect(quote).toMatchObject({ ok: true, refundable: false });
    });

    it('a real booking is still voided through the supplier', async () => {
      bookingRepo.findById.mockResolvedValue({
        ...mockBooking,
        status: 'ticketed',
        locatorCode: 'HN4VTH',
        workflowSummary: {},
      });
      const voidTicket = jest.fn().mockResolvedValue({ ok: true });
      (service as any).bookingProviderRegistry = { getProvider: jest.fn().mockReturnValue({ voidTicket }) };

      await service.voidBooking('booking-1');

      expect(voidTicket).toHaveBeenCalledWith(expect.objectContaining({ locatorCode: 'HN4VTH' }));
    });
  });
});
