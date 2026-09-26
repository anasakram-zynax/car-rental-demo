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
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { InvoiceService } from '../../../invoices/application/services/invoice.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { PrismaService } from '../../../../shared/database/prisma.service';

describe('FlightBookingPublicService — Cancel / Void / Refund', () => {
  let service: FlightBookingPublicService;
  let bookingRepo: { create: jest.Mock; update: jest.Mock; findById: jest.Mock; findAll: jest.Mock; findByUserId: jest.Mock; findPendingByUserAndOffer: jest.Mock; transitionStatus: jest.Mock };
  let bookingProviderRegistry: jest.Mocked<Pick<FlightBookingProviderRegistryService, 'getProvider'>>;
  let paymentRepo: jest.Mocked<Pick<PaymentRepository, 'findMany' | 'update'>>;
  let paymentOrchestrator: jest.Mocked<Pick<PaymentOrchestratorService, 'getGateway'>>;
  let promoRedemption: jest.Mocked<Pick<PromoCodeRedemptionService, 'refundByBookingId' | 'releaseByBookingId'>>;

  const mockBooking = (overrides: Partial<any> = {}) => ({
    id: 'booking-1',
    provider: 'travelport',
    status: 'ticketed',
    locatorCode: 'ABC123',
    workbenchId: 'wb-1',
    amount: 450.00,
    currency: 'USD',
    userId: 'user-1',
    workflowSummary: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    offerSnapshot: { offerId: 'offer-1', searchKey: 'search-key-1' },
    travelerSnapshot: [],
    ...overrides,
  });

  beforeEach(async () => {
    bookingRepo = {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      findAll: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue([]),
      findPendingByUserAndOffer: jest.fn().mockResolvedValue(null),
      transitionStatus: jest.fn().mockResolvedValue(null),
    };

    bookingProviderRegistry = {
      getProvider: jest.fn(),
    };

    paymentRepo = {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(null),
    };

    paymentOrchestrator = {
      getGateway: jest.fn(),
    };

    promoRedemption = {
      refundByBookingId: jest.fn().mockResolvedValue(undefined),
      releaseByBookingId: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        FlightBookingPublicService,
        { provide: FlightsProviderRegistryService, useValue: { resolveActiveProvider: jest.fn() } },
        { provide: FlightBookingProviderRegistryService, useValue: bookingProviderRegistry },
        { provide: TravelportBookingWorkflowService, useValue: {} },
        { provide: TravelportAncillaryService, useValue: {} },
        { provide: CreatePaymentIntentUseCase, useValue: {} },
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: paymentOrchestrator },
        { provide: MarkupService, useValue: {} },
        { provide: FlightBookingRepoPortToken, useValue: bookingRepo },
        { provide: AppConfigService, useValue: { travelport: {} } },
        { provide: CacheService, useValue: {} },
        { provide: SelectedOfferCacheService, useValue: {} },
        { provide: CurrencyService, useValue: {} },
        { provide: OutboxWriterService, useValue: { write: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationService, useValue: { notifyDirect: jest.fn().mockResolvedValue(undefined) } },
        { provide: PromoCodeRedemptionService, useValue: promoRedemption },
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

  // ── Cancel Booking ────────────────────────────────────────

  describe('cancelBooking', () => {
    it('throws when booking not found', async () => {
      bookingRepo.findById.mockResolvedValue(null);

      await expect(service.cancelBooking('missing')).rejects.toThrow(BusinessError);
    });

    it('does not cancel if status is not cancellable', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'refunded' }));

      await expect(service.cancelBooking('booking-1')).rejects.toThrow(BusinessError);
    });

    it('calls supplier cancel and transitions to cancelled', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'held_pending_payment' }));
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = { cancelBooking: jest.fn().mockResolvedValue({ ok: true, supplierStatus: 'cancelled' }) };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.cancelBooking('booking-1', 'User requested');

      expect(bookingProviderRegistry.getProvider).toHaveBeenCalledWith('travelport');
      expect(mockProvider.cancelBooking).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'booking-1', locatorCode: 'ABC123' }),
      );
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith(
        'booking-1', 'held_pending_payment', 'cancelled', expect.any(String),
      );
      expect(result.status).toBe('cancelled');
    });

    it('proceeds with local cancel when supplier cancel fails', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'held_pending_payment' }));
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = { cancelBooking: jest.fn().mockRejectedValue(new Error('API down')) };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.cancelBooking('booking-1', 'User requested');

      expect(result.status).toBe('cancelled');
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith(
        'booking-1', 'held_pending_payment', 'cancelled', expect.any(String),
      );
    });

    it('does not call supplier cancel when no locator code', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'held_pending_payment', locatorCode: null }));
      paymentRepo.findMany.mockResolvedValue([]);

      const result = await service.cancelBooking('booking-1', 'User requested');

      expect(result.status).toBe('cancelled');
    });
  });

  // ── Void Booking ──────────────────────────────────────────

  describe('voidBooking', () => {
    it('throws when booking not found', async () => {
      bookingRepo.findById.mockResolvedValue(null);

      await expect(service.voidBooking('missing')).rejects.toThrow(BusinessError);
    });

    it('throws when status is not voidable', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'cancelled' }));

      await expect(service.voidBooking('booking-1')).rejects.toThrow(BusinessError);
    });

    it('transitions to voided on successful supplier void', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = {
        voidTicket: jest.fn().mockResolvedValue({ ok: true, supplierStatus: 'voided' }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.voidBooking('booking-1', 'Admin void');

      expect(mockProvider.voidTicket).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'booking-1', locatorCode: 'ABC123' }),
      );
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'ticketed', 'void_requested', expect.any(String));
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'void_requested', 'voided', expect.any(String));
      expect(result.status).toBe('voided');
    });

    it('reverts status on failed supplier void', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = {
        voidTicket: jest.fn().mockResolvedValue({ ok: false, message: 'Void window closed' }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      await expect(service.voidBooking('booking-1')).rejects.toThrow(BusinessError);

      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'ticketed', 'void_requested', expect.any(String));
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'void_requested', 'ticketed', expect.any(String));
    });

    it('reverts status when the provider throws (never strands void_requested)', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = {
        voidTicket: jest.fn().mockRejectedValue(new Error('socket hangup')),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      await expect(service.voidBooking('booking-1')).rejects.toThrow('socket hangup');

      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'void_requested', 'ticketed', expect.any(String));
    });

    it('reverts status when the provider has no void op', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());
      paymentRepo.findMany.mockResolvedValue([]);
      bookingProviderRegistry.getProvider.mockReturnValue({} as any);

      await expect(service.voidBooking('booking-1')).rejects.toThrow(
        'Use Cancel instead',
      );

      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'void_requested', 'ticketed', expect.any(String));
    });

    it('retries void from a stranded void_requested booking', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ status: 'void_requested' }));
      paymentRepo.findMany.mockResolvedValue([]);

      const mockProvider = {
        voidTicket: jest.fn().mockResolvedValue({ ok: true, supplierStatus: 'voided' }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.voidBooking('booking-1', 'Retry void');

      expect(mockProvider.voidTicket).toHaveBeenCalled();
      expect(result.status).toBe('voided');
    });

    it('refunds paid payment after void', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());
      paymentRepo.findMany.mockResolvedValue([
        { id: 'pay-1', gateway: 'STRIPE', status: PaymentStatus.PAID, providerPaymentId: 'pi_123' },
      ]);

      const mockProvider = {
        voidTicket: jest.fn().mockResolvedValue({ ok: true }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const mockGateway = { refundPayment: jest.fn().mockResolvedValue(undefined) };
      paymentOrchestrator.getGateway.mockReturnValue(mockGateway as any);

      await service.voidBooking('booking-1', 'Admin void');

      expect(mockGateway.refundPayment).toHaveBeenCalledWith('pi_123');
      expect(paymentRepo.update).toHaveBeenCalled();
    });
  });

  // ── Request Refund ────────────────────────────────────────

  describe('requestRefund', () => {
    it('transitions to refund_pending on successful supplier refund', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());

      const mockProvider = {
        requestRefund: jest.fn().mockResolvedValue({ ok: true, supplierRefundId: 'r-1' }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.requestRefund('booking-1', 'Customer request');

      expect(mockProvider.requestRefund).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 'booking-1', locatorCode: 'ABC123' }),
      );
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'ticketed', 'refund_requested', expect.any(String));
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'refund_requested', 'refund_pending', expect.any(String));
      expect(result.status).toBe('refund_pending');
    });

    it('throws when supplier refund fails', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());

      const mockProvider = {
        requestRefund: jest.fn().mockResolvedValue({ ok: false, message: 'Refund not permitted' }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      await expect(service.requestRefund('booking-1')).rejects.toThrow(BusinessError);

      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'ticketed', 'refund_requested', expect.any(String));
      expect(bookingRepo.transitionStatus).toHaveBeenCalledWith('booking-1', 'refund_requested', 'ticketed', expect.any(String));
    });
  });

  // ── Quote Refund ──────────────────────────────────────────

  describe('quoteRefund', () => {
    it('delegates to provider quoteRefund', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking());

      const mockProvider = {
        quoteRefund: jest.fn().mockResolvedValue({
          ok: true,
          refundable: true,
          refundAmount: 400,
          refundCurrency: 'USD',
          penaltyAmount: 50,
          penaltyCurrency: 'USD',
        }),
      };
      bookingProviderRegistry.getProvider.mockReturnValue(mockProvider as any);

      const result = await service.quoteRefund('booking-1');

      expect(result.refundable).toBe(true);
      expect(result.refundAmount).toBe(400);
      expect(result.penaltyAmount).toBe(50);
    });

    it('throws when booking has no locator code', async () => {
      bookingRepo.findById.mockResolvedValue(mockBooking({ locatorCode: null }));

      await expect(service.quoteRefund('booking-1')).rejects.toThrow(BusinessError);
    });
  });
});
