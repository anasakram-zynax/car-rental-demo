import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { createHash, randomUUID } from 'node:crypto';
import { generatePublicRef } from '../../../../shared/utils/public-ref.util';
import {
  generateExpiredPnr,
  generateFakePnr,
  isFakeBooking,
  hasFakeBookingFlag,
  isFakeEligibleBooking,
  isFakeLocatorCode,
  isTravelportFakeEligible,
  withFakeBookingAudit,
} from '../../../../shared/booking/demo-booking-fallback.util';
import type { TravelportFarePolicies } from '../../infrastructure/providers/travelport/travelport-fare-policy.util';
import { FlightsProviderRegistryService } from './flights-provider-registry.service';
import { FlightBookingProviderRegistryService } from './flight-booking-provider-registry.service';
import { TravelportBookingWorkflowService } from './travelport-booking-workflow.service';
import type { BookingConfirmDto } from '../../api/dto/booking-confirm.dto';
import type { BookingPreviewDto } from '../../api/dto/booking-preview.dto';
import type { FlightCheckoutDto } from '../../api/dto/flight-checkout.dto';
import type { FlightRepriceDto } from '../../api/dto/flight-reprice.dto';
import type { FlightBookingRepoPort } from '../../application/ports/flight-booking-repo.port';
import { FlightBookingRepoPortToken } from '../../application/ports/flight-booking-repo.port';
import type { FlightBookingEntity } from '../../domain/entities/flight-booking.entity';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { CreatePaymentIntentUseCase } from '../../../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../../../payment/domain/enums/booking-type.enum';
import {
  PaymentGateway,
  isManualPaymentGateway,
} from '../../../payment/domain/enums/payment-gateway.enum';
import { PaymentEntity } from '../../../payment/domain/entities/payment.entity';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { InvoiceService } from '../../../invoices/application/services/invoice.service';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { MarkupService } from '../../../markup/markup.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { FlightOfferSnapshotService } from './flight-offer-snapshot.service';
import { TravelportAncillaryService } from './travelport-ancillary.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import { WalletService } from '../../../wallet/wallet.service';
import { CustomerWalletService } from '../../../wallet/customer-wallet.service';
import { PermissionCode } from '../../../access-control/domain/enums/permission-code.enum';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import { PromoCodeEligibilityService } from '../../../promo-codes/application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from '../../../promo-codes/application/services/promo-code-pricing.service';
import {
  PromoCodeRepositoryToken,
  type IPromoCodeRepository,
} from '../../../promo-codes/application/ports/promo-code.repository.port';
import type {
  SelectedOfferCacheEntry,
  NormalizedFlightSearchResponse,
  NormalizedFlightSearchMeta,
  NormalizedFlightOffer,
  SeatSelection,
  BaggageSelection,
  MealSelection,
  ServiceSelection,
  AncillarySelections,
} from '../../domain/entities/flight-search-response';
import type { CachedCheckoutSession } from '../../domain/entities/checkout-session.types';
import type { WorkflowSummary } from '../../domain/entities/flight-booking.entity';
import type { FlightsProviderKey } from '../../../settings/domain/provider-config.entity';

/**
 * Stand-in "provider" for fake-PNR bookings: there is no supplier reservation,
 * so void/refund succeed locally and never reach the real supplier.
 */
const LOCAL_FAKE_BOOKING_PROVIDER = {
  voidTicket: async () => ({
    ok: true,
    message: 'Voided locally — demo booking has no supplier ticket.',
  }),
  requestRefund: async () => ({
    ok: true,
    message: 'Refund recorded locally — demo booking has no supplier order.',
  }),
};

/**
 * How long a freshly failed fake-eligible Travelport booking is reported as
 * "still processing" while the demo fallback settles it (see
 * isFakeSettlementPending).
 */
const FAKE_SETTLEMENT_GRACE_MS = 60_000;

@Injectable()
export class FlightBookingPublicService {
  private readonly logger = new Logger(FlightBookingPublicService.name);

  constructor(
    private readonly providerRegistry: FlightsProviderRegistryService,
    private readonly bookingProviderRegistry: FlightBookingProviderRegistryService,
    private readonly bookingWorkflowService: TravelportBookingWorkflowService,
    private readonly ancillaryService: TravelportAncillaryService,
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly markupService: MarkupService,
    @Inject(FlightBookingRepoPortToken)
    private readonly bookingRepo: FlightBookingRepoPort,
    private readonly configService: AppConfigService,
    private readonly cacheService: CacheService,
    private readonly selectedOfferCache: SelectedOfferCacheService,
    private readonly currencyService: CurrencyService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly promoRedemptionService: PromoCodeRedemptionService,
    private readonly promoEligibilityService: PromoCodeEligibilityService,
    private readonly promoPricingService: PromoCodePricingService,
    @Inject(PromoCodeRepositoryToken)
    private readonly promoCodeRepo: IPromoCodeRepository,
    private readonly notifications: NotificationService,
    private readonly snapshotService: FlightOfferSnapshotService,
    private readonly walletService: WalletService,
    private readonly customerWalletService: CustomerWalletService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
    private readonly prisma: PrismaService,
    private readonly siteSettings: SiteSettingStore,
    private readonly gatewayConfigService: PaymentGatewayConfigService,
    private readonly invoiceService: InvoiceService,
  ) {}

  /** Resolve the caller's role + agent profile for role-aware pricing (null for guests). */
  private async resolvePricingContext(userId?: string) {
    if (!userId)
      return {
        userType: null as string | null,
        agentProfileId: null as string | null,
      };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });
    const userType = user?.userType ?? null;
    let agentProfileId: string | null = null;
    if (userType === 'AGENT') {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      agentProfileId = profile?.id ?? null;
    }
    return { userType, agentProfileId };
  }

  async preview(input: BookingPreviewDto, userId?: string) {
    // Unified pipeline Phase 8: resolve role once — agent callers get agent
    // rules + flightMarkup profile fallback in the pricing below; guests and
    // customers keep customer pricing unchanged.
    const pricingCtx = await this.resolvePricingContext(userId);
    await this.providerRegistry.resolveActiveProvider();

    let sessionData: CachedCheckoutSession | null = null;
    if (input.sessionKey) {
      sessionData = await this.cacheService.get<CachedCheckoutSession>(
        input.sessionKey,
      );
      if (sessionData) {
        this.logger.log(
          `[Preview] Using cached checkout session ${input.sessionKey.slice(-12)}`,
        );
        input.offerId = sessionData.offerId;
        input.catalogUuid = sessionData.catalogUuid;
        input.productSelections = sessionData.productSelections;
        if (!input.searchKey) input.searchKey = sessionData.searchKey;
      }
    }

    if (input.offerId) {
      input.offerId = decodeURIComponent(input.offerId);
    } // Phase 8: Determine the offer's provider from the cached search response.
    // This allows Duffle bookings to flow through without Travelport-specific data.
    // Note: the search cache is stored under `flight-search:${searchKey}` by the aggregator.
    // QA 2026-09-09: manual (seed) offers have no provider-map entry — derive
    // the provider from the snapshot so preview/checkout settle locally instead
    // of failing provider detection.
    let bookingProvider: import('../../../settings/domain/provider-config.entity').FlightsProviderKey;
    if (input.snapshotProvider) {
      bookingProvider = input.snapshotProvider;
    } else if (input.snapshotId) {
      try {
        const snap = await this.snapshotService.getSnapshotRaw(
          input.snapshotId,
        );
        bookingProvider = snap.provider;
        input.snapshotProvider = snap.provider;
      } catch {
        bookingProvider = await this.detectProviderFromSearch(
          input.searchKey,
          input.offerId,
        );
      }
    } else {
      bookingProvider = await this.detectProviderFromSearch(
        input.searchKey,
        input.offerId,
      );
    }
    this.logger.log(
      `[Preview] Detected provider: ${bookingProvider} for offer ${input.offerId?.slice(0, 16)}...`,
    );
    const isTravelport = bookingProvider === 'travelport';

    let selectedOfferContext: Record<string, unknown> | undefined;

    // Phase 12 fix: Populate selected-offer cache for ALL providers, not just Travelport.
    // This ensures FlightOfferSnapshotService can retrieve the offer data later
    // when the user clicks Select from search results.
    const cacheEntry = await this.cacheSelectedOffer(input, bookingProvider);
    if (cacheEntry) {
      selectedOfferContext = cacheEntry as unknown as Record<string, unknown>;
    }

    // For Travelport, always do a live reprice — cached session prices can be stale
    // and GDS fares can disappear between search and checkout.
    // For non-Travelport providers (e.g. Duffel with guaranteed prices), the session
    // price is safe to trust.
    // Fake-PNR path: same fallback as repriceFromSnapshot — a fake-eligible
    // session uses the card price so checkout can proceed to ticketBooking().
    let price: { amount: number; currency: string };
    try {
      price = isTravelport
        ? await this.resolvePrice(
            input.searchKey,
            input.offerId ?? '',
            input.totalPrice,
            input.currency,
            bookingProvider,
            input.tripType,
          )
        : sessionData && sessionData.priceBreakdown.total > 0
          ? {
              amount: sessionData.priceBreakdown.total,
              currency: sessionData.priceBreakdown.currency,
            }
          : await this.resolvePrice(
              input.searchKey,
              input.offerId ?? '',
              input.totalPrice,
              input.currency,
              bookingProvider,
              input.tripType,
            );
    } catch (previewErr: unknown) {
      const cardAmount = Number(input.totalPrice ?? 0);
      if (
        cardAmount > 0 &&
        input.currency &&
        (await this.isCallerFakeEligible(userId, bookingProvider))
      ) {
        this.logger.warn(
          `[Preview] Live reprice failed (fake-eligible) — using card price: ${previewErr instanceof Error ? previewErr.message : previewErr}`,
        );
        price = { amount: cardAmount, currency: input.currency };
      } else {
        throw previewErr;
      }
    }

    // Apply markup rules (global, supplier, product, route) for customer pricing
    const markupResult = await this.markupService.calculatePrice(
      price.amount,
      'flights',
      pricingCtx.agentProfileId ?? undefined, // agent callers price with agent rules (Phase 8)
      bookingProvider, // supplierId → matches supplier-scoped rules
      input.from, // routeFrom
      input.to, // routeTo
    );
    const markedUpPrice = markupResult.finalPrice;

    // Normalize legacy ancillary product IDs into unified format if provided
    const normalizedAncillaries = this.normalizeAncillaryInput(input);

    // Ancillary prices arrive in supplier currency (e.g. INR seat fees on a
    // PKR booking) — convert every line into the booking currency before
    // summing, otherwise foreign amounts pollute the charged total.
    if (normalizedAncillaries) {
      const toBookingCurrency = async (item: {
        price?: { amount?: number; currency?: string };
      }): Promise<void> => {
        const amount = item.price?.amount ?? 0;
        const from = item.price?.currency;
        if (!amount || !from || from === price.currency) return;
        try {
          const converted = await this.currencyService.convert(
            amount,
            from,
            price.currency,
          );
          item.price = {
            amount: converted.amount,
            currency: price.currency,
          };
        } catch {
          // Keep the submitted figure rather than dropping the line.
        }
      };
      for (const item of [
        ...normalizedAncillaries.seats,
        ...normalizedAncillaries.baggage,
        ...normalizedAncillaries.meals,
        ...normalizedAncillaries.services,
      ]) {
        await toBookingCurrency(item);
      }
    }

    // Phase 7: Fresh repricing for selected ancillaries (Travelport only — Duffle has no ancillary support)
    let ancillaryPriceTotal = 0;
    let ancillaryBreakdown: {
      seatTotal: number;
      baggageTotal: number;
      mealTotal: number;
      serviceTotal: number;
      ancillaryTotal: number;
      currency: string;
      freshRepriceAvailable: boolean;
    } = {
      seatTotal: 0,
      baggageTotal: 0,
      mealTotal: 0,
      serviceTotal: 0,
      ancillaryTotal: 0,
      currency: price.currency,
      freshRepriceAvailable: false,
    };

    if (normalizedAncillaries) {
      // Compute submitted totals from user selections
      const seatTotal = normalizedAncillaries.seats.reduce(
        (sum, s) => sum + (s.price?.amount ?? 0),
        0,
      );
      const baggageTotal = normalizedAncillaries.baggage.reduce(
        (sum, b) => sum + (b.price?.amount ?? 0),
        0,
      );
      const mealTotal = normalizedAncillaries.meals.reduce(
        (sum, m) => sum + (m.price?.amount ?? 0),
        0,
      );
      const serviceTotal = normalizedAncillaries.services.reduce(
        (sum, s) => sum + (s.price?.amount ?? 0),
        0,
      );
      ancillaryPriceTotal = seatTotal + baggageTotal + mealTotal + serviceTotal;

      ancillaryBreakdown = {
        seatTotal,
        baggageTotal,
        mealTotal,
        serviceTotal,
        ancillaryTotal: ancillaryPriceTotal,
        currency: price.currency,
        freshRepriceAvailable: false,
      };

      // Compute main product IDs from the input (needed for ancillary price workbench, Travelport only)
      const mainProductIds = input.productIds?.length
        ? input.productIds
        : input.productId
          ? [input.productId]
          : (input.productSelections?.flatMap((s) => s.productIds) ?? []);

      // Try to get fresh prices from Travelport for verification (only for Travelport offers)
      if (isTravelport) {
        try {
          const freshPrices = await this.repriceAncillaries(
            input.searchKey,
            input.offerId,
            input.catalogUuid,
            mainProductIds,
            normalizedAncillaries,
            input.travelers?.length ?? 1,
          );
          if (freshPrices) {
            ancillaryBreakdown = {
              ...ancillaryBreakdown,
              seatTotal: freshPrices.seatTotal,
              baggageTotal: freshPrices.baggageTotal,
              mealTotal: freshPrices.mealTotal,
              serviceTotal: freshPrices.serviceTotal,
              ancillaryTotal:
                freshPrices.seatTotal +
                freshPrices.baggageTotal +
                freshPrices.mealTotal +
                freshPrices.serviceTotal,
              freshRepriceAvailable: true,
            };
            ancillaryPriceTotal =
              freshPrices.seatTotal +
              freshPrices.baggageTotal +
              freshPrices.mealTotal +
              freshPrices.serviceTotal;

            // Update stored ancillary prices with fresh verified values
            if (freshPrices.verified) {
              for (let i = 0; i < normalizedAncillaries.seats.length; i++) {
                normalizedAncillaries.seats[i].price = {
                  amount:
                    freshPrices.seatTotal /
                    Math.max(normalizedAncillaries.seats.length, 1),
                  currency: price.currency,
                };
              }
              for (let i = 0; i < normalizedAncillaries.baggage.length; i++) {
                normalizedAncillaries.baggage[i].price = {
                  amount:
                    freshPrices.individualBaggagePrices?.[i] ??
                    freshPrices.baggageTotal /
                      Math.max(normalizedAncillaries.baggage.length, 1),
                  currency: price.currency,
                };
              }
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Ancillary repricing unavailable: ${message}. Using submitted prices.`,
          );
        }
      }
    }

    const rawTotal = markedUpPrice + ancillaryPriceTotal;
    const minorUnit = await this.currencyService.getDecimals(price.currency);
    const totalAmount = Number(rawTotal.toFixed(minorUnit));

    // ── Promo code logic ──
    let promoDiscountMinor = 0;
    let appliedPromoCode: string | undefined;

    if (input.promoCode) {
      try {
        const promo = await this.promoCodeRepo.findByCode(input.promoCode);
        if (promo) {
          const bookingSubtotalMinor = await this.currencyService.toSmallestUnit(
            totalAmount,
            price.currency,
          );

          const eligibility = await this.promoEligibilityService.check({
            promoCode: promo,
            userId,
            productType: 'flights',
            currency: price.currency,
            bookingSubtotalMinor,
            routeCode:
              input.from && input.to ? `${input.from}-${input.to}` : undefined,
            cabinClass: undefined,
          });

          if (eligibility.eligible) {
            const discount = this.promoPricingService.calculate({
              promoCode: promo,
              bookingSubtotalMinor,
              currency: price.currency,
            });
            promoDiscountMinor = discount.discountMinor;
            appliedPromoCode = input.promoCode;
          } else {
            this.logger.log(
              `[Preview] Promo ${input.promoCode} ineligible: ${eligibility.reason}`,
            );
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[Preview] Promo code lookup failed: ${msg}. Proceeding without promo.`,
        );
      }
    }

    const bookingId = randomUUID();

    const booking: FlightBookingEntity = {
      id: bookingId,
      publicRef: generatePublicRef(),
      provider: bookingProvider,
      status: 'pending_payment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      offerSnapshot: {
        offerId: input.offerId ?? '',
        productId: input.productId,
        productIds: input.productIds,
        productSelections: input.productSelections,
        seatProductIds: input.seatProductIds,
        baggageProductIds: input.baggageProductIds,
        serviceProductIds: input.serviceProductIds,
        mealSelectionIds: input.mealSelectionIds,
        catalogUuid: input.catalogUuid,
        offeringIdentifierValue: input.offeringIdentifierValue,
        tripType: input.tripType,
        returnDate: input.returnDate,
        legs: input.legs,
        from: input.from,
        to: input.to,
        departureDate: input.departureDate,
        searchKey: input.searchKey,
        sessionKey: input.sessionKey || undefined,
        ancillaries: normalizedAncillaries,
        selectedOfferContext,
        // Channel-aware status storage: contentSource/workflowKind/offerId are
        // resolved per-source in writeSelectedOfferCache; persisting them at the
        // snapshot top level lets post-booking ops (cancel/retrieve/void) route
        // to the right Travelport channel without re-resolving.
        contentSource: selectedOfferContext?.contentSource as
          | string
          | undefined,
        workflowKind: selectedOfferContext?.workflowKind as string | undefined,
        offerIdentifier: Array.isArray(selectedOfferContext?.offeringIds)
          ? (selectedOfferContext.offeringIds as string[])[0]
          : undefined,
      },
      travelerSnapshot: input.travelers,
      amount: markedUpPrice,
      baseAmount: price.amount,
      currency: price.currency,
      userId,
    };

    await this.bookingRepo.create(booking);

    // ── Reserve promo redemption (needs bookingId from the created entity) ──
    if (appliedPromoCode && promoDiscountMinor > 0) {
      try {
        const promo = await this.promoCodeRepo.findByCode(appliedPromoCode);
        if (promo) {
          await this.promoRedemptionService.reserve({
            promoCodeId: promo.id,
            userId,
            bookingId: booking.id,
            bookingType: 'FLIGHT',
            discountMinor: promoDiscountMinor,
            currency: price.currency,
            bookingSubtotalMinor: await this.currencyService.toSmallestUnit(
              totalAmount,
              price.currency,
            ),
            idempotencyKey: `promo:${booking.id}:${appliedPromoCode}`,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `[Preview] Promo reservation failed: ${msg}. Proceeding without promo.`,
        );
        promoDiscountMinor = 0;
        appliedPromoCode = undefined;
      }
    }

    // Apply promo discount to total amount
    const discountMajor = await this.currencyService.fromSmallestUnit(
      promoDiscountMinor,
      price.currency,
    );
    const finalAmount = Math.max(
      0,
      Number((totalAmount - discountMajor).toFixed(minorUnit)),
    );

    // ── Display currency conversion (mirrors hotel module pattern) ──
    let displayAmount = finalAmount;
    let displayCurrency = price.currency;
    let displayExchangeRate: number | null = null;
    if (input.displayCurrency && input.displayCurrency !== price.currency) {
      try {
        const converted = await this.currencyService.convert(
          finalAmount,
          price.currency,
          input.displayCurrency,
        );
        if (converted.amount > 0) {
          displayAmount = converted.amount;
          displayCurrency = converted.currency;
          const fromRate = await this.currencyService.getByCode(price.currency);
          const toRate = await this.currencyService.getByCode(
            input.displayCurrency,
          );
          if (fromRate && toRate) {
            displayExchangeRate =
              Number(toRate.exchangeRate) / Number(fromRate.exchangeRate);
          }
        }
      } catch (convErr: unknown) {
        this.logger.warn(
          `[Preview] Currency conversion ${price.currency}→${input.displayCurrency} failed: ${convErr instanceof Error ? convErr.message : convErr}. Falling back to supplier currency.`,
        );
      }
    }

    // Persist the display currency/rate used at booking-creation time so a
    // later refund/invoice can reconstruct the exact amount shown to the
    // customer without re-converting against today's possibly-different
    // rate (mirrors HotelBooking.rateSnapshot.chargeExchangeRate).
    if (displayExchangeRate != null) {
      try {
        await this.bookingRepo.update(booking.id, {
          rateSnapshot: { displayCurrency, displayExchangeRate },
        });
      } catch (rateSnapshotErr: unknown) {
        this.logger.warn(
          `[Preview] Failed to persist rateSnapshot for booking ${booking.id}: ${rateSnapshotErr instanceof Error ? rateSnapshotErr.message : rateSnapshotErr}`,
        );
      }
    }

    // Notification: flight booking created
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.flight.created',
        aggregateType: 'Booking',
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          bookingType: 'FLIGHT',
          amount: markedUpPrice,
          currency: price.currency,
          userId,
        },
      });
      this.notifications
        .notifyDirect({
          idempotencyKey: eventId,
          eventType: 'booking.flight.created',
          aggregateType: 'Booking',
          aggregateId: booking.id,
          payload: {
            bookingId: booking.id,
            bookingType: 'FLIGHT',
            amount: markedUpPrice,
            currency: price.currency,
            userId,
          },
        })
        .catch(() => {});
    } catch {
      // Non-critical — log only
      this.logger.warn(
        `Failed to emit booking.flight.created for ${booking.id}`,
      );
    }

    const previewResult: {
      bookingId: string;
      amount: number;
      currency: string;
      displayAmount: number;
      displayCurrency: string;
      displayExchangeRate: number | null;
      status: string;
      next: string;
      priceBreakdown: {
        baseFare: number;
        seatTotal: number;
        baggageTotal: number;
        mealTotal: number;
        serviceTotal: number;
        ancillaryTotal: number;
        totalAmount: number;
        currency: string;
        supplierBase?: number;
        markupAmount?: number;
        freshRepriceAvailable: boolean;
        discountMinor?: number;
        promoCode?: string;
      };
    } = {
      bookingId: booking.id,
      amount: finalAmount,
      currency: price.currency,
      displayAmount,
      displayCurrency,
      displayExchangeRate,
      status: booking.status,
      next: 'payment',
      priceBreakdown: {
        baseFare: price.amount,
        seatTotal: ancillaryBreakdown.seatTotal,
        baggageTotal: ancillaryBreakdown.baggageTotal,
        mealTotal: ancillaryBreakdown.mealTotal,
        serviceTotal: ancillaryBreakdown.serviceTotal,
        ancillaryTotal: ancillaryBreakdown.ancillaryTotal,
        totalAmount: finalAmount,
        currency: price.currency,
        // Admin/agent visibility: pre-markup supplier base + applied markup
        supplierBase: price.amount,
        markupAmount: Math.max(0, markedUpPrice - price.amount),
        freshRepriceAvailable: ancillaryBreakdown.freshRepriceAvailable,
        ...(promoDiscountMinor > 0 && appliedPromoCode
          ? { discountMinor: promoDiscountMinor, promoCode: appliedPromoCode }
          : {}),
      },
    };

    return previewResult;
  }

  /**
   * Determine the offer's provider from the cached search response.
   * Looks up the search cache to find the provider that owns this offer.
   * Fails with a clear error when cache is unavailable or offer not found.
   */
  /**
   * @deprecated Phase 12 — detectProviderFromSearch is a legacy fallback.
   * New checkout flows MUST use FlightOfferSnapshot as the canonical identifier source.
   * This method remains for backward compatibility with existing bookings that predate snapshots.
   */
  private async detectProviderFromSearch(
    searchKey: string | undefined,
    offerId: string | undefined,
  ): Promise<FlightsProviderKey> {
    if (!searchKey || !offerId) {
      throw new BusinessError(
        'FLIGHTS_SEARCH_EXPIRED',
        'Cannot determine provider: search key and offer ID are required. Please search again.',
      );
    }
    try {
      const providerMap = await this.cacheService.get<Record<string, string>>(
        `flight-search-provider-map:${searchKey}`,
      );
      if (providerMap) {
        // Multi-city offer IDs join per-leg offers with "+" (e.g. "o5:p40+o2:p16").
        // Exact match first; then fall back to the first leg's own key — every
        // leg of one multi-city search shares the same provider, and the
        // combined key can be missing from an older/rebuilt provider map even
        // when the per-leg key still resolves.
        const firstLegId = offerId.split('+')[0];
        const provider =
          providerMap[offerId] ??
          providerMap[firstLegId] ??
          providerMap[firstLegId.split(':')[0]];
        if (
          provider === 'duffel' ||
          provider === 'travelport' ||
          provider === 'amadeus'
        )
          return provider;
      }
      throw new BusinessError(
        'FLIGHTS_SEARCH_EXPIRED',
        'Offer provider information not found. Search results may have expired. Please search again.',
      );
    } catch (err: unknown) {
      if (err instanceof BusinessError) throw err;
      this.logger.warn(
        `[detectProvider] Cache lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BusinessError(
        'FLIGHTS_SEARCH_EXPIRED',
        'Unable to verify offer provider. Search results may have expired. Please search again.',
      );
    }
  }

  /**
   * Build and cache a SelectedOfferCacheEntry from the preview input.
   * This enables the full payload flow (buildfromproducts) during pricing, booking, and ancillary preview.
   */
  /**
   * Resolve the effective content source from search meta when the offer
   * doesn't have an explicit contentSource. Uses providerContexts to determine
   * which Travelport channel actually returned the offers.
   *
   * Priority:
   * 1. The offer's own normalized contentSource (stamped per-offer by the
   *    Travelport normalizer from ProductBrandOffering.ContentSource) -> trust it
   * 2. The offer's product refs exist in the GDS reference list -> 'GDS'
   * 3. Only NDC provider context exists (not GDS) -> 'NDC'
   * 4. Final fallback: 'GDS'
   */
  private resolveContentSourceFromMeta(
    meta: NormalizedFlightSearchMeta | undefined,
    offer: NormalizedFlightOffer,
  ): 'GDS' | 'NDC' {
    const providerContexts = meta?.providerContexts;

    // Strongest signal: the offer itself was stamped with a channel by the
    // provider normalizer (raw ContentSource on the brand offering).
    if (offer.contentSource === 'NDC' || offer.contentSource === 'GDS') {
      return offer.contentSource;
    }

    // Corroborating signal: the offer's product refs exist in the GDS
    // reference list (GDS catalog identifiers only appear there).
    if (providerContexts?.GDS?.referenceList?.products) {
      const gdsProductKeys = Object.keys(
        providerContexts.GDS.referenceList.products,
      );
      const offerRefs =
        offer.metadata?.productRefs ??
        (offer.metadata?.productRef ? [offer.metadata.productRef] : []);
      if (offerRefs.some((ref) => gdsProductKeys.includes(ref))) {
        return 'GDS';
      }
    }

    // Mere presence of a GDS catalogUuid is NOT evidence this offer is GDS:
    // in merged NDC+GDS searches the GDS call can return zero offers (e.g.
    // NO OFFERS FOUND FOR THE CHANNEL) while its catalogUuid survives the
    // meta merge. Only use NDC when GDS has no proof of catalog data.
    if (providerContexts?.NDC?.catalogUuid && !providerContexts?.GDS) {
      return 'NDC';
    }

    // Safe default: GDS (most proven path, reference list is GDS after search merge)
    return 'GDS';
  }

  private async cacheSelectedOffer(
    input: BookingPreviewDto,
    provider: FlightsProviderKey,
  ): Promise<SelectedOfferCacheEntry | null> {
    const searchKey = input.searchKey?.trim();
    const offerId = input.offerId?.trim();
    if (!searchKey || !offerId) return null;

    // ROOT FIX: the search step (flight-search-aggregator.service.ts
    // primeSelectedOfferCache -> resolveOfferSupplierContext) already writes
    // a correct, per-channel-resolved cache entry for every offer at search
    // time — it reads catalogUuid from providerContexts[offer.contentSource],
    // which is unambiguous. This method used to unconditionally recompute
    // and overwrite that entry using its own independent resolution
    // (writeSelectedOfferCache below), which does NOT correctly disambiguate
    // NDC vs GDS catalogUuid in all cases and was silently clobbering the
    // correct entry with the wrong channel's catalogUuid — the confirmed
    // cause of "Add-offer failed. The cached offer may be stale." on
    // one-way and multi-city Travelport bookings (round-trip's JOURNEY-mode
    // offers happen not to hit this overwrite as often). If the search step
    // already produced a usable entry, trust it — don't re-derive and risk
    // replacing correct data with wrong data.
    const existing = await this.selectedOfferCache.retrieve(searchKey, offerId, provider);
    const existingIsUsable =
      !!existing?.catalogUuid &&
      !!existing.referenceList?.products &&
      Object.keys(existing.referenceList.products).length > 0 &&
      !!existing.referenceList?.flights &&
      Object.keys(existing.referenceList.flights).length > 0;
    if (existingIsUsable) {
      return existing;
    }

    try {
      const cacheKey = `flight-search:${searchKey}:provider:${provider}`;
      const cachedSearch =
        await this.cacheService.get<NormalizedFlightSearchResponse>(cacheKey);

      if (!cachedSearch) {
        const legacySearch =
          await this.cacheService.get<NormalizedFlightSearchResponse>(
            searchKey,
          );
        if (legacySearch) {
          return this.writeSelectedOfferCache(
            legacySearch,
            input,
            searchKey,
            offerId,
            provider,
          );
        }
        this.logger.warn(
          `[cacheSelectedOffer] ${provider} cache miss for ${searchKey}`,
        );
        return null;
      }

      return this.writeSelectedOfferCache(
        cachedSearch,
        input,
        searchKey,
        offerId,
        provider,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to cache selected offer: ${message}`);
      return null;
    }
  }

  private async writeSelectedOfferCache(
    cachedSearch: NormalizedFlightSearchResponse,
    input: BookingPreviewDto,
    searchKey: string,
    offerId: string,
    provider: FlightsProviderKey,
  ): Promise<SelectedOfferCacheEntry | null> {
    const { meta, offers } = cachedSearch;
    const matchedOffer = offers.find(
      (o: NormalizedFlightOffer) =>
        o.metadata?.offeringId === offerId || o.id === offerId,
    );
    if (!matchedOffer) {
      this.logger.warn(
        `Offer ${offerId} not found in cached search (searched by metadata.offeringId and id)`,
      );
      return null;
    }

    // Resolve the offer's channel FIRST, then take catalog data from THAT
    // channel's providerContext. Falling back to meta-level catalogUuid is
    // unsafe for merged NDC+GDS searches: the top-level value can belong to
    // the other channel (spread-order overwrite), which sends an NDC offer
    // into the GDS workflow with a GDS catalogUuid (or the reverse).
    const effectiveContentSource =
      (matchedOffer.contentSource === 'NDC' ||
      matchedOffer.contentSource === 'GDS'
        ? matchedOffer.contentSource
        : undefined) ?? this.resolveContentSourceFromMeta(meta, matchedOffer);
    const sourceContext = meta?.providerContexts?.[effectiveContentSource];
    // Note: the ambiguous top-level meta.catalogUuid is intentionally NOT a
    // fallback here — effectiveContentSource is always resolved, so per-source
    // context (or the explicit input value) is the only valid source.
    const catalogUuid =
      matchedOffer.metadata?.providerCatalogUuid ??
      sourceContext?.catalogUuid ??
      input.catalogUuid;
    // Travelport requires catalogUuid; non-Travelport providers can proceed without it.
    if (!catalogUuid && provider === 'travelport') return null;

    const productSelections =
      matchedOffer.metadata?.productSelections ??
      (matchedOffer.metadata?.productRefs
        ? [
            {
              offeringId:
                matchedOffer.metadata?.catalogOfferingId ??
                offerId.split(':')[0],
              productIds: matchedOffer.metadata.productRefs,
            },
          ]
        : (input.productSelections ?? []));

    // Build per-source reference lists when this search was a merged NDC+GDS
    // response, so downstream workflow steps use the list of the offer's own
    // channel (the top-level referenceList may be the other channel's).
    const referenceListForSource = (
      source: 'NDC' | 'GDS',
    ): SelectedOfferCacheEntry['referenceList'] | undefined => {
      const ctx = meta?.providerContexts?.[source] as
        | { referenceList?: SelectedOfferCacheEntry['referenceList'] }
        | undefined;
      const list = ctx?.referenceList;
      if (!list) return undefined;
      return {
        products: list.products ?? {},
        flights: list.flights ?? {},
        brands: list.brands,
      };
    };
    const ndcReferenceList = referenceListForSource('NDC');
    const gdsReferenceList = referenceListForSource('GDS');

    const cacheEntry: SelectedOfferCacheEntry = {
      catalogUuid: catalogUuid ?? '',
      offeringIds: productSelections.map((s) => s.offeringId),
      productRefs: productSelections.flatMap((s) => s.productIds),
      productSelections,
      brandOfferingId: matchedOffer.metadata?.brandOfferingId,
      combinabilityCode: matchedOffer.metadata?.combinabilityCode,
      currency: input.currency,
      contentSource: effectiveContentSource,
      supplierPrice: matchedOffer.price
        ? {
            amount: matchedOffer.price.total,
            currency: matchedOffer.price.currency,
          }
        : undefined,
      passengerCriteria: [
        { number: input.travelers?.length || 1, passengerTypeCode: 'ADT' },
      ],
      referenceList: referenceListForSource(effectiveContentSource) ?? {
        products: meta?.referenceList?.products ?? {},
        flights: meta?.referenceList?.flights ?? {},
        brands: meta?.referenceList?.brands,
      },
      referenceListBySource:
        ndcReferenceList || gdsReferenceList
          ? {
              ...(ndcReferenceList ? { NDC: ndcReferenceList } : {}),
              ...(gdsReferenceList ? { GDS: gdsReferenceList } : {}),
            }
          : undefined,
      searchCriteria: {
        from: input.from ?? '',
        to: input.to ?? '',
        departureDate: input.departureDate ?? '',
        tripType: input.tripType,
        returnDate: input.returnDate,
        ...(input.tripType === 'multi_city' && input.legs
          ? {
              legs: input.legs.map((l: any) => ({
                origin: l.origin,
                destination: l.destination,
                departureDate: l.departureDate,
              })),
            }
          : {}),
        cabinClass: undefined,
        adults: input.travelers?.length || 1,
      },
      workflowKind: effectiveContentSource === 'NDC' ? 'ndc' : 'gds',
      capabilities: {
        seatMapAvailable: true,
        ancillaryShopAvailable: effectiveContentSource === 'NDC',
        mealSsrSupported: true,
        postBookingManageAvailable: false,
      },
    };

    await this.selectedOfferCache.store(
      'travelport',
      searchKey,
      offerId,
      cacheEntry,
    );

    // Write supplier data back to input so the booking entity gets catalogUuid/productSelections.
    // Without this, preview() creates a booking with empty offerSnapshot and
    // confirm() later fails with "Cannot confirm booking without supplier data".
    if (!input.catalogUuid && catalogUuid) {
      input.catalogUuid = catalogUuid;
    }
    if (
      (!input.productSelections || input.productSelections.length === 0) &&
      productSelections.length > 0
    ) {
      input.productSelections = productSelections;
    }
    if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
      this.logger.log(
        `Cached offer ${offerId} for search ${searchKey} (catalogUuid=${catalogUuid ? 'set' : 'missing'}, productSelections=${productSelections.length})`,
      );
    }

    return cacheEntry;
  }

  async checkout(input: FlightCheckoutDto, userId?: string) {
    // Unified pipeline Phase 8: resolve the caller's role up front — the wallet
    // branch below and preview()'s agent pricing both key off it.
    const pricingCtx = await this.resolvePricingContext(userId);
    // Fare rules (refund/change policies) + raw offer conditions captured from
    // the snapshot — persisted onto the booking below so cancel estimates +
    // rate comments work offline of the supplier (Duffel sandbox blocks order
    // retrieval, demo bookings, cancelled-rate review).
    let snapshotFareRules: Record<string, unknown> | undefined;
    let snapshotRawConditions: Record<string, unknown> | undefined;
    // Phase 12: snapshotId is the canonical identifier source.
    // When provided, all supplier identifiers MUST come from the persisted snapshot.
    // Fallback to raw input fields is no longer allowed — it risks identifier drift.
    if (input.snapshotId) {
      const snapshot = await this.snapshotService.getSnapshotRaw(
        input.snapshotId,
      );
      if (!snapshot) {
        throw new BusinessError(
          'FLIGHTS_SNAPSHOT_NOT_FOUND',
          `Snapshot ${input.snapshotId} not found. Please search and select an offer again.`,
        );
      }
      if (new Date(snapshot.expiresAt) <= new Date()) {
        throw new BusinessError(
          'FLIGHTS_SNAPSHOT_EXPIRED',
          `Snapshot ${input.snapshotId} has expired. Please search and select an offer again.`,
        );
      }
      this.logger.log(
        `[Checkout] Loading identifiers from snapshot ${input.snapshotId} (provider=${snapshot.provider})`,
      );
      // QA 2026-09-09: remember the snapshot's provider — 'manual' offers skip
      // supplier hold/detection and settle locally.
      input.snapshotProvider = snapshot.provider;
      // Populate input fields from snapshot so preview/hold use snapshot data.
      // Unconditional overwrite — snapshot is the canonical source; stale input
      // fields from frontend must never survive.
      input.searchKey = snapshot.searchKey;
      input.offerId = snapshot.offerId;
      const sc = snapshot.supplierContext as Record<string, any>;
      if (sc?.catalogUuid) input.catalogUuid = sc.catalogUuid;
      if (sc?.productSelections?.length)
        input.productSelections = sc.productSelections;
      if (sc?.productIds?.length && !input.productIds?.length)
        input.productIds = sc.productIds;
      input.tripType = (snapshot.tripType as any) ?? input.tripType;
      // Populate route fields from snapshot when frontend didn't send them
      const searchCriteria = sc?.searchCriteria as
        | Record<string, any>
        | undefined;
      if (!input.from && searchCriteria?.from) input.from = searchCriteria.from;
      if (!input.to && searchCriteria?.to) input.to = searchCriteria.to;
      if (!input.departureDate && searchCriteria?.departureDate)
        input.departureDate = searchCriteria.departureDate;
      if (!input.offerId) input.offerId = snapshot.offerId;
      // Capture the snapshot's fare rules for persistence on the booking
      const norm = snapshot.normalizedOffer as Record<string, any> | undefined;
      if (norm?.display?.refundPolicy || norm?.display?.changePolicy) {
        snapshotFareRules = {
          refundPolicy: norm.display.refundPolicy,
          changePolicy: norm.display.changePolicy,
        };
      }
      // Duffel: the search-time raw offer carries authoritative fare conditions.
      // Capture them now — GET /air/orders 404s in sandbox, so the confirm-time
      // live capture alone can never fill these in.
      if (snapshot.provider === 'duffel') {
        const scRaw = (snapshot.supplierContext as Record<string, any>)
          ?.rawOffer;
        const conditions =
          scRaw?.conditions ??
          (Array.isArray(scRaw?.slices)
            ? scRaw.slices[0]?.conditions
            : undefined);
        if (conditions && Object.keys(conditions).length > 0) {
          snapshotRawConditions = conditions as Record<string, unknown>;
        }
      }
    }

    // Idempotency: Check if there's already a pending booking for this user+offer
    // This prevents duplicate bookings when checkout is called multiple times (e.g., double-click)
    const OFFER_EXPIRY_MS = 120_000; // 2 minutes — GDS fares can become unavailable quickly
    if (userId && input.offerId) {
      const existingBooking = await this.bookingRepo.findPendingByUserAndOffer(
        userId,
        decodeURIComponent(input.offerId),
      );
      if (existingBooking) {
        // Check if the existing booking is too old — GDS fare may have expired
        const ageMs =
          Date.now() - new Date(existingBooking.createdAt).getTime();
        if (ageMs > OFFER_EXPIRY_MS) {
          this.logger.warn(
            `[Checkout] Expiring stale pending booking ${existingBooking.id} (age=${Math.round(ageMs / 1000)}s) for user ${userId}`,
          );
          // Cancel any existing payment for this stale booking
          const stalePayments = await this.paymentRepository.findMany({
            bookingId: existingBooking.id,
            status: PaymentStatus.PENDING,
          });
          for (const sp of stalePayments) {
            try {
              const gateway = this.paymentOrchestrator.getGateway(sp.gateway);
              if (gateway.cancelPayment && sp.providerPaymentId) {
                await gateway.cancelPayment(sp.providerPaymentId);
              }
            } catch {
              /* gateway cancel is best-effort */
            }
            sp.status = PaymentStatus.CANCELLED;
            sp.updatedAt = new Date();
            await this.paymentRepository.update(sp).catch(() => {});
          }
          await this.bookingRepo.update(existingBooking.id, {
            status: 'failed',
            message: 'Offer expired — fresh price required. Please try again.',
          });
          // Exit to fresh preview — booking is now 'failed', recursive call
          // will skip findPendingByUserAndOffer and create a brand-new booking.
          return this.checkout(input, userId);
        } else {
          this.logger.log(
            `[Checkout] Found existing pending booking ${existingBooking.id} for user ${userId} and offer ${input.offerId}`,
          );

          // Always fresh-reprice before returning/creating a payment.
          // The GDS fare could have expired in the time since preview created
          // this booking. If it's gone, expire the booking + cancel payment
          // and fall through to a full fresh preview.
          const repricingSearchKey =
            input.searchKey ?? existingBooking.offerSnapshot?.searchKey;
          if (repricingSearchKey) {
            try {
              await this.freshReprice(
                repricingSearchKey,
                existingBooking.offerSnapshot?.offerId ?? input.offerId,
                existingBooking.amount ?? undefined,
                existingBooking.currency ?? undefined,
                existingBooking.provider,
                input.tripType ?? existingBooking.offerSnapshot?.tripType,
              );
              this.logger.log(
                `[Checkout] Fresh reprice OK for existing booking ${existingBooking.id}`,
              );
            } catch (rpErr: unknown) {
              const rpMsg =
                rpErr instanceof Error ? rpErr.message : String(rpErr);
              // FLIGHTS_OFFER_UNAVAILABLE means the fare is gone — expire and recreate
              const rpCode = (rpErr as { response?: { code?: string } })
                ?.response?.code;
              const rpUpper = rpMsg.toUpperCase();
              if (
                rpCode === 'FLIGHTS_OFFER_UNAVAILABLE' ||
                rpUpper.includes('FARE IS NOT AVAILABLE') ||
                rpUpper.includes('NO AVAILABLE FARES') ||
                rpUpper.includes('NO LONGER AVAILABLE') ||
                rpUpper.includes('REQUESTED CABIN') ||
                rpUpper.includes('CLASS OF SERVICE')
              ) {
                // Fake-PNR path: don't expire/recreate for demo/guest — proceed
                // with the existing price toward ticketBooking() fallback.
                if (
                  await this.isCallerFakeEligible(
                    userId,
                    existingBooking.provider,
                  )
                ) {
                  this.logger.warn(
                    `[Checkout] Fresh reprice FAILED for existing booking ${existingBooking.id} (fake-eligible) — proceeding with existing price: ${rpMsg}`,
                  );
                } else {
                  this.logger.warn(
                    `[Checkout] Fresh reprice FAILED for existing booking ${existingBooking.id} — fare unavailable: ${rpMsg}. Expiring and recreating.`,
                  );
                // Cancel any existing payment for this stale booking
                const stalePayments = await this.paymentRepository.findMany({
                  bookingId: existingBooking.id,
                  status: PaymentStatus.PENDING,
                });
                for (const sp of stalePayments) {
                  try {
                    const gateway = this.paymentOrchestrator.getGateway(
                      sp.gateway,
                    );
                    if (gateway.cancelPayment && sp.providerPaymentId) {
                      await gateway.cancelPayment(sp.providerPaymentId);
                    }
                  } catch {
                    /* gateway cancel is best-effort */
                  }
                  sp.status = PaymentStatus.CANCELLED;
                  sp.updatedAt = new Date();
                  await this.paymentRepository.update(sp).catch(() => {});
                }
                await this.bookingRepo.update(existingBooking.id, {
                  status: 'failed',
                  message:
                    'Offer expired — fresh price required. Please try again.',
                });
                // Exit to fresh preview — booking is now 'failed', recursive call
                // will skip findPendingByUserAndOffer and create a brand-new booking.
                return this.checkout(input, userId);
                }
              } else {
                // Non-fatal reprice error — log and continue with existing price
                this.logger.warn(
                  `[Checkout] Fresh reprice error (non-fatal) for ${existingBooking.id}: ${rpMsg}. Proceeding with existing price.`,
                );
              }
            }
          }

          // For pre-payment-hold providers (Travelport), ensure the existing booking
          // has a locatorCode before creating a new payment.
          if (!existingBooking.locatorCode) {
            try {
              const existingBp = this.bookingProviderRegistry.getProvider(
                existingBooking.provider,
              );
              if (existingBp?.capabilities.supportsPrePaymentHold) {
                let holdResult = await this.createHold(existingBooking.id);
                if (!holdResult.ok) {
                  try {
                    this.logger.log(
                      `[Checkout] First hold attempt failed for existing booking ${existingBooking.id}: ${holdResult.message}. Retrying after fresh reprice.`,
                    );
                    await this.bookingWorkflowService.reprice(
                      input.searchKey!,
                      input.offerId,
                    );
                    holdResult = await this.createHold(existingBooking.id);
                  } catch {
                    // reprice or second hold failed — fare is truly unavailable
                  }
                }
                if (!holdResult.ok) {
                  await this.bookingRepo.update(existingBooking.id, {
                    status: 'failed',
                    message: `Failed to secure fare hold: ${holdResult.message}`,
                  });
                  throw new BusinessError(
                    'FLIGHTS_OFFER_UNAVAILABLE',
                    `This fare is no longer available. Please search again.`,
                  );
                }
              }
            } catch (err) {
              if (err instanceof BusinessError) throw err;
            }
          }

          // Unified pipeline Phase 9b: an agent wallet caller repeats checkout
          // on an existing pending booking (double-click, retry) — settle the
          // EXISTING booking via the wallet reserve-commit branch instead of
          // creating a stray gateway PaymentIntent.
          if (
            pricingCtx.userType === 'AGENT' &&
            pricingCtx.agentProfileId &&
            input.paymentMethod !== 'gateway'
          ) {
            return this.settleWalletForExistingBooking(
              existingBooking,
              pricingCtx.agentProfileId,
              input,
            );
          }

          // Customer wallet retry on an existing pending booking (double-click,
          // retry) — settle the EXISTING booking via the customer
          // reserve-commit branch instead of a stray gateway PaymentIntent.
          if (
            pricingCtx.userType === 'CUSTOMER' &&
            userId &&
            input.paymentMethod === 'wallet'
          ) {
            return this.settleCustomerWalletForExistingBooking(
              existingBooking,
              userId,
              input,
            );
          }

          // Check if the existing booking still has a payment record
          // (we may have cancelled it above if fare was unavailable)
          const existingPayments = await this.paymentRepository.findMany({
            bookingId: existingBooking.id,
            status: PaymentStatus.PENDING,
          });

          if (existingPayments.length > 0) {
            // Return the existing payment ID
            const existingPayment = existingPayments[0];
            const existingAmount = existingBooking.amount ?? 0;
            const existingCurrency = existingBooking.currency ?? 'USD';
            let displayAmount = existingAmount;
            let displayCurrency = existingCurrency;
            let displayExchangeRate: number | null = null;

            // If the user selected a different display currency, convert for display
            if (
              input.displayCurrency &&
              input.displayCurrency !== existingCurrency
            ) {
              try {
                const converted = await this.currencyService.convert(
                  existingAmount,
                  existingCurrency,
                  input.displayCurrency,
                );
                if (converted.amount > 0) {
                  displayAmount = converted.amount;
                  displayCurrency = converted.currency;
                  const fromRate =
                    await this.currencyService.getByCode(existingCurrency);
                  const toRate = await this.currencyService.getByCode(
                    input.displayCurrency,
                  );
                  if (fromRate && toRate) {
                    displayExchangeRate =
                      Number(toRate.exchangeRate) /
                      Number(fromRate.exchangeRate);
                  }
                }
              } catch (convErr) {
                this.logger.warn(
                  `[Checkout] Existing booking display conversion ${existingCurrency}→${input.displayCurrency} failed: ${convErr instanceof Error ? convErr.message : convErr}. Using supplier currency.`,
                );
              }
            }

            return {
              bookingId: existingBooking.id,
              paymentId: existingPayment.id,
              amount: existingAmount,
              currency: existingCurrency,
              displayAmount,
              displayCurrency,
              displayExchangeRate,
              clientSecret: existingPayment.providerClientSecret ?? null,
              checkoutUrl: existingPayment.providerCheckoutUrl ?? null,
              priceBreakdown: null,
              sessionKey: input.sessionKey ?? null,
              existingBooking: true, // Flag to indicate this is an existing booking
            };
          }

          // No payment record exists yet (or was cancelled due to stale fare),
          // create a new payment intent for the existing booking
          const existingAmount2 = existingBooking.amount ?? 0;
          const existingCurrency2 = existingBooking.currency ?? 'USD';
          let displayAmount2 = existingAmount2;
          let displayCurrency2 = existingCurrency2;
          let displayExchangeRate2: number | null = null;

          if (
            input.displayCurrency &&
            input.displayCurrency !== existingCurrency2
          ) {
            try {
              const converted = await this.currencyService.convert(
                existingAmount2,
                existingCurrency2,
                input.displayCurrency,
              );
              if (converted.amount > 0) {
                displayAmount2 = converted.amount;
                displayCurrency2 = converted.currency;
                const fromRate =
                  await this.currencyService.getByCode(existingCurrency2);
                const toRate = await this.currencyService.getByCode(
                  input.displayCurrency,
                );
                if (fromRate && toRate) {
                  displayExchangeRate2 =
                    Number(toRate.exchangeRate) / Number(fromRate.exchangeRate);
                }
              }
            } catch (convErr) {
              this.logger.warn(
                `[Checkout] Existing booking (no payment) display conversion ${existingCurrency2}→${input.displayCurrency} failed: ${convErr instanceof Error ? convErr.message : convErr}. Using supplier currency.`,
              );
            }
          }

    // Manual methods (bank_transfer / pay_later): no gateway intent —
          // PENDING row + admin hold window, customer pays or admin verifies later.
          if (isManualPaymentGateway(String(input.gateway))) {
            const manual = await this.createManualHoldPayment({
              bookingId: existingBooking.id,
              gateway: input.gateway as PaymentGateway,
              amount: existingAmount2,
              currency: existingCurrency2,
            });
            return {
              bookingId: existingBooking.id,
              paymentId: manual.paymentId,
              amount: existingAmount2,
              currency: existingCurrency2,
              displayAmount: displayAmount2,
              displayCurrency: displayCurrency2,
              displayExchangeRate: displayExchangeRate2,
              clientSecret: null,
              checkoutUrl: null,
              priceBreakdown: null,
              sessionKey: input.sessionKey ?? null,
              paymentMethod: input.gateway,
              holdExpiresAt: manual.holdExpiresAt,
              message:
                'Booking held — complete payment or wait for admin verification.',
            };
          }

          const paymentIntent = await this.createPaymentIntentUseCase.execute({
            bookingId: existingBooking.id,
            bookingType: BookingType.FLIGHT,
            gateway: input.gateway,
            amount: existingAmount2,
            currency: existingCurrency2,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
            customerId: input.customerId,
          });

          return {
            bookingId: existingBooking.id,
            paymentId: paymentIntent.paymentId,
            amount: existingAmount2,
            currency: existingCurrency2,
            displayAmount: displayAmount2,
            displayCurrency: displayCurrency2,
            displayExchangeRate: displayExchangeRate2,
            clientSecret: paymentIntent.clientSecret ?? null,
            checkoutUrl: paymentIntent.checkoutUrl ?? null,
            priceBreakdown: null,
            sessionKey: input.sessionKey ?? null,
          };
        }
      }
    }

    const previewResult = await this.preview(input, userId);

    // Persist the snapshot's fare rules onto the booking so the cancel
    // estimate and rate-comments surfaces have real policies stored in DB
    // (works for demo bookings and post-cancel review without supplier calls).
    if (snapshotFareRules || snapshotRawConditions) {
      try {
        const created = await this.bookingRepo.findById(
          previewResult.bookingId,
        );
        if (created) {
          const mergedSnapshot: Record<string, unknown> = {
            ...((created.offerSnapshot ?? {}) as Record<string, unknown>),
          };
          if (snapshotFareRules) {
            mergedSnapshot.display = {
              ...(((created.offerSnapshot as Record<string, any>)?.display ??
                {}) as Record<string, unknown>),
              ...snapshotFareRules,
            };
          }
          if (snapshotRawConditions) {
            mergedSnapshot.rawOffer = {
              ...(((created.offerSnapshot as Record<string, any>)?.rawOffer ??
                {}) as Record<string, unknown>),
              conditions: snapshotRawConditions,
            };
          }
          await this.bookingRepo.update(previewResult.bookingId, {
            offerSnapshot: mergedSnapshot,
          } as any);
        }
      } catch (err: unknown) {
        this.logger.warn(
          `[Checkout] Fare-rule persistence failed for ${previewResult.bookingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    // Hold-first flow: create a supplier hold BEFORE payment for providers
    // that support pre-payment hold (Travelport). This reserves the PNR/fare
    // so the price is locked during payment.
    // Also detect provider capabilities to decide manual capture for Duffel.
    let useManualCapture: boolean | undefined;

    // QA 2026-09-09: manual (seed) offers settle locally — no supplier hold,
    // no provider detection (the provider-map has no entry for them).
    if (input.snapshotProvider === 'manual') {
      this.logger.log(
        `[Checkout] Manual offer ${input.offerId} — skipping supplier hold`,
      );
    } else if (input.searchKey && input.offerId) {
      try {
        const detectedProvider = await this.detectProviderFromSearch(
          input.searchKey,
          input.offerId,
        );
        let bp;
        try {
          bp = this.bookingProviderRegistry.getProvider(detectedProvider);
        } catch {}
        if (bp?.capabilities.supportsPrePaymentHold) {
          // ponytail: multi-city Travelport LEG mode — products from separate
          // offerings expire quickly and cannot be held as one. Skip hold.
          const isMultiCityTravelport =
            detectedProvider === 'travelport' &&
            (input.offerId?.includes('+') || input.tripType === 'multi_city');
          if (isMultiCityTravelport) {
            this.logger.log(
              `[Checkout] Multi-city Travelport — skipping hold (products from different offerings)`,
            );
          } else {
            let holdResult = await this.createHold(previewResult.bookingId);
            if (!holdResult.ok) {
              try {
                this.logger.log(
                  `[Checkout] First hold attempt failed for ${previewResult.bookingId}: ${holdResult.message}. Attempting fresh reprice and retry.`,
                );
                await this.bookingWorkflowService.reprice(
                  input.searchKey,
                  input.offerId,
                );
                holdResult = await this.createHold(previewResult.bookingId);
              } catch {
                // reprice or second hold failed — fare is truly unavailable
              }
            }
            if (!holdResult.ok) {
              // Demo/guest fallback: let a fake-eligible session proceed to
              // payment anyway instead of rejecting checkout outright. The
              // booking stays 'pending_payment' (as createHold already left
              // it) so the normal payment.succeeded -> ticketBooking() flow
              // retries the real supplier hold post-payment; if that also
              // fails, ticketBooking()'s own fallback refunds any real
              // payment before faking success. Never bypass this for the
              // real super admin or a real non-demo customer.
              if (
                await this.isBookingFakeEligible({
                  userId,
                  provider: detectedProvider,
                })
              ) {
                this.logger.warn(
                  `[Checkout] Pre-payment hold failed for ${previewResult.bookingId} (fake-eligible session) — proceeding to payment anyway: ${holdResult.message}`,
                );
              } else {
                await this.bookingRepo.update(previewResult.bookingId, {
                  status: 'failed',
                  message: `Failed to secure fare hold: ${holdResult.message}`,
                });
                throw new BusinessError(
                  'FLIGHTS_OFFER_UNAVAILABLE',
                  `This fare is no longer available. Please search again.`,
                );
              }
            }
            this.logger.log(
              `[Checkout] Pre-payment hold created for ${previewResult.bookingId}: locator=${holdResult.locatorCode}`,
            );
          }
        }
        // Use manual capture for providers that require instant payment but don't
        // support pre-payment hold (e.g. Duffel). This authorizes the card first,
        // then captures after the supplier booking succeeds — avoiding the need
        // for a refund if the supplier booking fails.
        useManualCapture =
          bp?.capabilities.requiresInstantPayment &&
          !bp?.capabilities.supportsPrePaymentHold;
      } catch (err: unknown) {
        if (err instanceof BusinessError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        // Phase 6: For Travelport, a hold failure MUST block payment — the fare
        // is not secured and creating a payment intent would risk charging for
        // an unavailable booking.
        const detectedProviderForHold =
          input.searchKey && input.offerId
            ? await this.detectProviderFromSearch(
                input.searchKey,
                input.offerId,
              ).catch(() => 'travelport')
            : 'travelport';
        if (detectedProviderForHold === 'travelport') {
          if (
            await this.isBookingFakeEligible({
              userId,
              provider: detectedProviderForHold,
            })
          ) {
            this.logger.warn(
              `[Checkout] Hold creation crashed for ${previewResult.bookingId} (Travelport, fake-eligible session) — proceeding to payment anyway: ${msg}`,
            );
          } else {
            this.logger.warn(
              `[Checkout] Hold creation failed for ${previewResult.bookingId} (Travelport): ${msg}. Blocking payment.`,
            );
            await this.bookingRepo.update(previewResult.bookingId, {
              status: 'failed',
              message: `Failed to secure fare hold: ${msg}`,
            });
            throw new BusinessError(
              'FLIGHTS_OFFER_UNAVAILABLE',
              `This fare is no longer available. Please search again.`,
            );
          }
        }
        this.logger.warn(
          `[Checkout] Provider detection or hold creation failed for ${previewResult.bookingId}: ${msg}. Proceeding with payment-only flow.`,
        );
      }
    }

    // Agent eligibility gate (unified pipeline Phase 9) — every agent
    // checkout (wallet OR card) passes the same checks the legacy delegate ran.
    if (
      pricingCtx.userType === 'AGENT' &&
      pricingCtx.agentProfileId &&
      userId
    ) {
      // Control surface: supplier allowlist enforced on best-effort provider
      // detection (detection failure = allow, explicit disallow = block).
      const detectedProvider =
        input.searchKey && input.offerId
          ? await this.detectProviderFromSearch(input.searchKey, input.offerId).catch(() => undefined)
          : undefined;
      await this.walletService.validateAgentBookingPermission(
        pricingCtx.agentProfileId,
        userId,
        'flight',
        { provider: detectedProvider, gateway: input.gateway ? String(input.gateway) : undefined },
      );
    }

    // ── Agent wallet/credit branch (unified pipeline Phase 8) ──
    // Agents pay from wallet + credit via the reserve-commit hold pattern;
    // guests/customers and card-paying agents keep the gateway flow below.
    if (
      pricingCtx.userType === 'AGENT' &&
      pricingCtx.agentProfileId &&
      input.paymentMethod !== 'gateway'
    ) {
      const effectivePrice = previewResult.amount;

      // Reserve: wallet + credit check under FOR UPDATE lock, hold created.
      const hold = await this.walletService.reserveHoldForBooking(
        pricingCtx.agentProfileId,
        effectivePrice,
        'flight',
        previewResult.currency ?? undefined,
      );

      try {
        // Link the hold to the booking for the deduction phase.
        await this.prisma.walletHold.update({
          where: { id: hold.id },
          data: { bookingId: previewResult.bookingId },
        });

        // Same event the agent path fires today: FlightPaymentListener claims
        // the pending_payment booking and runs the supplier confirm workflow;
        // wallet is deducted on booking.supplier_confirmed by
        // finalizeSupplierConfirmedBooking (derives the profile from userId).
        const paymentSucceededPayload = {
          paymentId: `wallet-${previewResult.bookingId}`,
          paymentMethod: 'wallet',
          bookingId: previewResult.bookingId,
          bookingType: 'FLIGHT',
          amount: effectivePrice,
          currency: previewResult.currency ?? 'USD',
        };
        const eventId = await this.outboxWriter.write({
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          idempotencyKey: `agent-wallet-payment-authorized:${previewResult.bookingId}`,
          payload: paymentSucceededPayload,
        });
        this.immediateDispatcher.dispatch({
          id: eventId,
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          idempotencyKey: `agent-wallet-payment-authorized:${previewResult.bookingId}`,
          payload: paymentSucceededPayload,
        });

        return {
          bookingId: previewResult.bookingId,
          paymentId: paymentSucceededPayload.paymentId,
          amount: effectivePrice,
          currency: previewResult.currency ?? 'USD',
          displayAmount: previewResult.displayAmount,
          displayCurrency: previewResult.displayCurrency,
          displayExchangeRate: previewResult.displayExchangeRate,
          paymentMethod: 'wallet' as const,
          holdId: hold.id,
          priceBreakdown: previewResult.priceBreakdown,
          sessionKey: input.sessionKey ?? null,
          message:
            'Pending supplier confirmation — wallet will be deducted on success.',
        };
      } catch (error: any) {
        // On failure: release hold (no wallet deduction has happened yet).
        await this.prisma.walletHold
          .update({ where: { id: hold.id }, data: { status: 'released' } })
          .catch((e) =>
            this.logger.error(`Failed to release hold ${hold.id}: ${e}`),
          );
        throw error;
      }
    }

    // ── Customer wallet branch ──
    // Authenticated customers can spend prepaid wallet funds via the same
    // reserve-commit hold pattern as agents (no credit line). Explicit
    // paymentMethod 'wallet' required — default stays gateway.
    if (
      pricingCtx.userType === 'CUSTOMER' &&
      userId &&
      input.paymentMethod === 'wallet'
    ) {
      const effectivePrice = previewResult.amount;

      const hold = await this.customerWalletService.reserveHoldForBooking(
        userId,
        effectivePrice,
        'flight',
        previewResult.currency ?? undefined,
      );

      try {
        await this.prisma.walletHold.update({
          where: { id: hold.id },
          data: { bookingId: previewResult.bookingId },
        });

        const paymentSucceededPayload = {
          paymentId: `wallet-${previewResult.bookingId}`,
          paymentMethod: 'wallet',
          bookingId: previewResult.bookingId,
          bookingType: 'FLIGHT',
          amount: effectivePrice,
          currency: previewResult.currency ?? 'USD',
        };
        const eventId = await this.outboxWriter.write({
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          idempotencyKey: `customer-wallet-payment-authorized:${previewResult.bookingId}`,
          payload: paymentSucceededPayload,
        });
        this.immediateDispatcher.dispatch({
          id: eventId,
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          idempotencyKey: `customer-wallet-payment-authorized:${previewResult.bookingId}`,
          payload: paymentSucceededPayload,
        });

        return {
          bookingId: previewResult.bookingId,
          paymentId: paymentSucceededPayload.paymentId,
          amount: effectivePrice,
          currency: previewResult.currency ?? 'USD',
          displayAmount: previewResult.displayAmount,
          displayCurrency: previewResult.displayCurrency,
          displayExchangeRate: previewResult.displayExchangeRate,
          paymentMethod: 'wallet' as const,
          holdId: hold.id,
          priceBreakdown: previewResult.priceBreakdown,
          sessionKey: input.sessionKey ?? null,
          message:
            'Pending supplier confirmation — wallet will be deducted on success.',
        };
      } catch (error: any) {
        await this.prisma.walletHold
          .update({ where: { id: hold.id }, data: { status: 'released' } })
          .catch((e) =>
            this.logger.error(`Failed to release hold ${hold.id}: ${e}`),
          );
        throw error;
      }
    }

    // Manual methods (bank_transfer / pay_later): no gateway intent —
    // PENDING row + admin hold window, customer pays or admin verifies later.
    if (isManualPaymentGateway(String(input.gateway))) {
      const manual = await this.createManualHoldPayment({
        bookingId: previewResult.bookingId,
        gateway: input.gateway as PaymentGateway,
        amount: previewResult.amount,
        currency: previewResult.currency,
      });
      // The hold (with supplier PNR) already exists — announce it so invoice/
      // voucher generation and admin queues pick the booking up. No
      // payment.succeeded will ever fire for manual methods.
      const awaitingId = randomUUID();
      const awaitingPayload = {
        bookingId: previewResult.bookingId,
        bookingType: 'FLIGHT',
        paymentId: manual.paymentId,
        amount: previewResult.amount,
        currency: previewResult.currency,
      };
      const awaitingOutboxId = await this.outboxWriter
        .write({
          idempotencyKey: awaitingId,
          eventType: 'booking.awaiting_issue',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          payload: awaitingPayload,
        })
        .catch(() => null);
      if (awaitingOutboxId) {
        this.immediateDispatcher.dispatch({
          id: awaitingOutboxId,
          eventType: 'booking.awaiting_issue',
          aggregateType: 'Booking',
          aggregateId: previewResult.bookingId,
          idempotencyKey: awaitingId,
          payload: awaitingPayload,
        });
      }
      return {
        bookingId: previewResult.bookingId,
        paymentId: manual.paymentId,
        amount: previewResult.amount,
        currency: previewResult.currency,
        displayAmount: previewResult.displayAmount,
        displayCurrency: previewResult.displayCurrency,
        displayExchangeRate: previewResult.displayExchangeRate,
        clientSecret: null,
        checkoutUrl: null,
        priceBreakdown: previewResult.priceBreakdown,
        sessionKey: input.sessionKey ?? null,
        paymentMethod: input.gateway,
        holdExpiresAt: manual.holdExpiresAt,
        message:
          'Booking held — complete payment or wait for admin verification.',
      };
    }

    try {
      const paymentIntent = await this.createPaymentIntentUseCase.execute({
        bookingId: previewResult.bookingId,
        bookingType: BookingType.FLIGHT,
        gateway: input.gateway,
        amount: previewResult.amount,
        currency: previewResult.currency,
        captureMethod: useManualCapture ? 'manual' : undefined,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        customerId: input.customerId,
      });

      return {
        bookingId: previewResult.bookingId,
        paymentId: paymentIntent.paymentId,
        amount: previewResult.amount,
        currency: previewResult.currency,
        displayAmount: previewResult.displayAmount,
        displayCurrency: previewResult.displayCurrency,
        displayExchangeRate: previewResult.displayExchangeRate,
        clientSecret: paymentIntent.clientSecret ?? null,
        checkoutUrl: paymentIntent.checkoutUrl ?? null,
        priceBreakdown: previewResult.priceBreakdown,
        sessionKey: input.sessionKey ?? null,
      };
    } catch (error) {
      await this.bookingRepo.update(previewResult.bookingId, {
        status: 'failed',
        message: 'Payment intent creation failed.',
      });
      throw error;
    }
  }

  /**
   * Settle an EXISTING pending flight booking through the agent wallet
   * reserve-commit branch (unified pipeline Phase 9b). Mirrors the wallet
   * branch in checkout(): hold → link → payment.succeeded → FlightPaymentListener
   * → confirm → booking.supplier_confirmed → finalizeSupplierConfirmedBooking
   * deducts the wallet. Hold is released on any failure before the deduction.
   */
  private async settleWalletForExistingBooking(
    existingBooking: FlightBookingEntity,
    agentProfileId: string,
    input: FlightCheckoutDto,
  ) {
    const effectivePrice = existingBooking.amount ?? 0;
    const currency = existingBooking.currency ?? 'USD';

    const hold = await this.walletService.reserveHoldForBooking(
      agentProfileId,
      effectivePrice,
      'flight',
      currency,
    );

    try {
      await this.prisma.walletHold.update({
        where: { id: hold.id },
        data: { bookingId: existingBooking.id },
      });

      const paymentSucceededPayload = {
        paymentId: `wallet-${existingBooking.id}`,
        paymentMethod: 'wallet',
        bookingId: existingBooking.id,
        bookingType: 'FLIGHT',
        amount: effectivePrice,
        currency,
      };
      const eventId = await this.outboxWriter.write({
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: existingBooking.id,
        idempotencyKey: `agent-wallet-payment-authorized:${existingBooking.id}`,
        payload: paymentSucceededPayload,
      });
      this.immediateDispatcher.dispatch({
        id: eventId,
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: existingBooking.id,
        idempotencyKey: `agent-wallet-payment-authorized:${existingBooking.id}`,
        payload: paymentSucceededPayload,
      });

      return {
        bookingId: existingBooking.id,
        paymentId: paymentSucceededPayload.paymentId,
        amount: effectivePrice,
        currency,
        paymentMethod: 'wallet' as const,
        holdId: hold.id,
        sessionKey: input.sessionKey ?? null,
        message:
          'Pending supplier confirmation — wallet will be deducted on success.',
      };
    } catch (error: any) {
      await this.prisma.walletHold
        .update({ where: { id: hold.id }, data: { status: 'released' } })
        .catch((e) =>
          this.logger.error(`Failed to release hold ${hold.id}: ${e}`),
        );
      throw error;
    }
  }

  /**
   * Settle an EXISTING pending flight booking through the customer wallet
   * reserve-commit branch. Mirrors settleWalletForExistingBooking (prepaid
   * only, no credit). Deducted on booking.supplier_confirmed by the
   * customer wallet finalizer.
   */
  private async settleCustomerWalletForExistingBooking(
    existingBooking: FlightBookingEntity,
    userId: string,
    input: FlightCheckoutDto,
  ) {
    const effectivePrice = existingBooking.amount ?? 0;
    const currency = existingBooking.currency ?? 'USD';

    const hold = await this.customerWalletService.reserveHoldForBooking(
      userId,
      effectivePrice,
      'flight',
      currency,
    );

    try {
      await this.prisma.walletHold.update({
        where: { id: hold.id },
        data: { bookingId: existingBooking.id },
      });

      const paymentSucceededPayload = {
        paymentId: `wallet-${existingBooking.id}`,
        paymentMethod: 'wallet',
        bookingId: existingBooking.id,
        bookingType: 'FLIGHT',
        amount: effectivePrice,
        currency,
      };
      const eventId = await this.outboxWriter.write({
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: existingBooking.id,
        idempotencyKey: `customer-wallet-payment-authorized:${existingBooking.id}`,
        payload: paymentSucceededPayload,
      });
      this.immediateDispatcher.dispatch({
        id: eventId,
        eventType: 'payment.succeeded',
        aggregateType: 'Booking',
        aggregateId: existingBooking.id,
        idempotencyKey: `customer-wallet-payment-authorized:${existingBooking.id}`,
        payload: paymentSucceededPayload,
      });

      return {
        bookingId: existingBooking.id,
        paymentId: paymentSucceededPayload.paymentId,
        amount: effectivePrice,
        currency,
        paymentMethod: 'wallet' as const,
        holdId: hold.id,
        sessionKey: input.sessionKey ?? null,
        message:
          'Pending supplier confirmation — wallet will be deducted on success.',
      };
    } catch (error: any) {
      await this.prisma.walletHold
        .update({ where: { id: hold.id }, data: { status: 'released' } })
        .catch((e) =>
          this.logger.error(`Failed to release hold ${hold.id}: ${e}`),
        );
      throw error;
    }
  }

  /**
   * Re-validate the live fare for an offer WITHOUT creating a booking.
   *
   * Used by the booking detail page so the price shown there matches what
   * checkout will charge (consistent across tabs/pages). Returns the current
   * provider price, the customer-marked-up display price, and the fresh
   * priced-offer identifiers — which checkout can carry into the booking
   * snapshot so the commit uses the same re-shopped offer.
   *
   * On a live reprice failure it falls back to the cached search price
   * (mirroring freshReprice), and surfaces `freshRepriceAvailable: false`.
   */
  async repriceOffer(
    input: FlightRepriceDto,
    userId?: string,
  ): Promise<{
    offerId: string;
    amount: number;
    currency: string;
    displayPrice: number;
    supplierBase?: number;
    markupAmount?: number;
    chargeAmount: number;
    chargeCurrency: string;
    catalogUuid?: string;
    productSelections?: Array<{ offeringId: string; productIds: string[] }>;
    offeringIdentifierValue?: string;
    offeringIdentifierAuthority?: string;
    freshRepriceAvailable: boolean;
    priceChanged: boolean;
  }> {
    const searchKey = input.searchKey?.trim();
    let offerId = input.offerId;
    if (!searchKey || !offerId) {
      throw new BusinessError(
        'FLIGHTS_SEARCH_EXPIRED',
        'searchKey and offerId are required to reprice the offer. Please search again.',
      );
    }

    // Decode URL-encoded offer IDs (e.g. o1%3Ap0 → o1:p0) so the cache lookup
    // hits the same key used by preview / checkout.
    offerId = decodeURIComponent(offerId);

    // Resolve the cached selected-offer entry (catalogUuid/productSelections
    // are needed downstream for the actual booking).
    let cacheEntry: SelectedOfferCacheEntry | null = null;
    try {
      cacheEntry = await this.selectedOfferCache.retrieve(searchKey, offerId);
    } catch {
      // ignore — fallback below handles missing cache
    }

    // Fallback: rebuild the cache entry from the search cache when the
    // selected-offer cache misses (e.g. user skipped preview, or cache expired)
    if (!cacheEntry) {
      try {
        cacheEntry = await this.ancillaryService.buildCacheFromSearchIfMissing(
          searchKey,
          offerId,
        );
      } catch {
        // ignore — will use input fields below
      }
    }

    const catalogUuid = input.catalogUuid ?? cacheEntry?.catalogUuid;
    const productSelections = input.productSelections?.length
      ? input.productSelections
      : cacheEntry?.productSelections;

    // Detect the real provider from the search provider map, NOT from
    // contentSource which is meaningless for Duffel offers (stored as 'GDS').
    let provider: FlightsProviderKey;
    try {
      provider = await this.detectProviderFromSearch(searchKey, offerId);
    } catch {
      // Fallback: use cache contentSource or default to travelport
      provider =
        (cacheEntry?.contentSource as FlightsProviderKey) ?? 'travelport';
    }

    let amount: number;
    let currency: string;
    // QA R4: native charge currency, captured before display conversion
    let chargeAmount: number | undefined;
    let chargeCurrency: string | undefined;
    let offeringIdentifierValue: string | undefined;
    let offeringIdentifierAuthority: string | undefined;
    let freshRepriceAvailable = false;

    try {
      if (provider === 'duffel' || provider === 'amadeus') {
        const bookingProvider =
          this.bookingProviderRegistry.getProvider(provider);
        if (bookingProvider?.reprice) {
          const repriceResult = await bookingProvider.reprice(
            searchKey,
            offerId,
          );
          amount = repriceResult.amount;
          currency = repriceResult.currency;
          freshRepriceAvailable = true;
        } else {
          throw new Error(`${provider} booking provider has no reprice method`);
        }
      } else {
        const priced =
          await this.bookingWorkflowService.priceForCheckoutSession(
            searchKey,
            offerId,
          );
        amount = priced.amount;
        currency = priced.currency;
        offeringIdentifierValue = priced.pricedOfferIdentifierValue;
        offeringIdentifierAuthority = priced.pricedOfferIdentifierAuthority;
        freshRepriceAvailable = true;
      }

      // QA R4: capture the native charge before display conversion —
      // checkout/wallet settlement charges this exact amount/currency.
      chargeAmount = amount;
      chargeCurrency = currency;

      // Convert currency to match the user's preferred currency (same logic as
      // freshReprice). Without this, Travelport may return EUR while the search
      // was in USD, causing a price mismatch across pages.
      if (input.currency && currency !== input.currency) {
        try {
          const converted = await this.convertCurrency(
            amount,
            currency,
            input.currency,
          );
          if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
            this.logger.log(
              `[Reprice] Converted ${currency} ${amount} → ${converted.currency} ${converted.amount} (preferred: ${input.currency})`,
            );
          }
          amount = converted.amount;
          currency = converted.currency;
        } catch (convErr: unknown) {
          this.logger.warn(
            `[Reprice] Currency conversion from ${currency} to ${input.currency} unavailable: ${convErr instanceof Error ? convErr.message : String(convErr)}. Using ${currency}.`,
          );
        }
      }
    } catch (err: unknown) {
      // Fall back to the cached search price (mirrors freshReprice behaviour).
      try {
        const fallback = await this.freshReprice(
          searchKey,
          offerId,
          input.totalPrice,
          input.currency,
          provider,
          input.tripType,
        );
        amount = fallback.amount;
        currency = fallback.currency;
      } catch (fallbackErr: unknown) {
        // Fake-PNR path: detail-page reprice must not hard-block demo/guest
        // sessions either — use the card price and let ticketBooking() fake it.
        const cardAmount = Number(input.totalPrice ?? 0);
        if (
          cardAmount > 0 &&
          input.currency &&
          (await this.isCallerFakeEligible(userId, provider))
        ) {
          this.logger.warn(
            `[repriceOffer] Live reprice failed (fake-eligible) — using card price`,
          );
          amount = cardAmount;
          currency = input.currency;
        } else if (
          (fallbackErr as { response?: { code?: string } })?.response?.code ===
          'FLIGHTS_OFFER_UNAVAILABLE'
        ) {
          // If freshReprice detected a fare availability error, propagate that
          // (more specific) instead of the original.
          throw fallbackErr;
        } else {
          throw err; // rethrow the original live reprice error (offer truly unavailable)
        }
      }
    }

    // Flag if the live fare moved versus what the user saw on the search page.
    // Compare RAW-to-RAW: input.totalPrice is the marked card price, so the
    // comparison happens against the marked display price below, not `amount`.
    // Apply customer markup so the displayed price matches checkout parity.
    // supplierId is REQUIRED — supplier-scoped rules (templates applied to a
    // specific provider) otherwise never match and the raw price leaks through.
    const markupResult = await this.markupService.calculatePrice(
      amount,
      'flights',
      undefined,
      provider,
      input.from,
      input.to,
    );

    const priceChanged =
      typeof input.totalPrice === 'number' &&
      input.totalPrice > 0 &&
      markupResult.finalPrice > 0 &&
      Math.abs(markupResult.finalPrice - input.totalPrice) / input.totalPrice >
        0.01;

    return {
      offerId,
      amount,
      currency,
      displayPrice: markupResult.finalPrice,
      supplierBase: amount,
      markupAmount: Math.max(0, markupResult.finalPrice - amount),
      chargeAmount: chargeAmount ?? amount,
      chargeCurrency: chargeCurrency ?? currency,
      catalogUuid,
      productSelections,
      offeringIdentifierValue,
      offeringIdentifierAuthority,
      freshRepriceAvailable,
      priceChanged,
    };
  }

  /**
   * Phase 5: Reprice from a persisted snapshot.
   *
   * Loads all supplier identifiers from FlightOfferSnapshot.supplierContext.
   * Does NOT accept raw Travelport identifiers from the frontend.
   */
  async repriceFromSnapshot(
    input: {
      snapshotId: string;
      displayCurrency?: string;
      totalPrice?: number;
    },
    userId?: string,
  ): Promise<{
    snapshotId: string;
    offerId: string;
    amount: number;
    currency: string;
    displayPrice: number;
    supplierBase?: number;
    markupAmount?: number;
    freshRepriceAvailable: boolean;
    priceChanged: boolean;
    // QA R4: what checkout actually charges (native supplier currency)
    chargeAmount: number;
    chargeCurrency: string;
    /** Live fare conditions from the priced offer (Travelport), when available. */
    fareRules?: { refundPolicy?: unknown; changePolicy?: unknown };
  }> {
    // QA R4: native charge currency, captured before any display conversion
    let chargeAmount: number | undefined;
    let chargeCurrency: string | undefined;
    let liveFareRules: TravelportFarePolicies | undefined;
    const snapshot = await this.snapshotService.getSnapshotRaw(
      input.snapshotId,
    );

    if (!snapshot) {
      throw new BusinessError(
        'FLIGHTS_SNAPSHOT_NOT_FOUND',
        `Snapshot ${input.snapshotId} not found or has expired. Please search and select again.`,
      );
    }

    if (new Date(snapshot.expiresAt) < new Date()) {
      throw new BusinessError(
        'FLIGHTS_SNAPSHOT_EXPIRED',
        `Snapshot ${input.snapshotId} has expired. Please search and select again.`,
      );
    }

    const searchKey = snapshot.searchKey;
    const offerId = snapshot.offerId;
    const provider = snapshot.provider;

    // QA 2026-09-09: manual (seed) offers have no supplier to reprice — the
    // snapshot's pricing IS authoritative. Apply markup only.
    if (snapshot.provider === 'manual') {
      const pricing = snapshot.pricingSnapshot as {
        amount?: number;
        currency?: string;
      } | null;
      const baseAmount = Number(pricing?.amount ?? 0);
      const baseCurrency = pricing?.currency ?? 'USD';
      chargeAmount = baseAmount;
      chargeCurrency = baseCurrency;
      const markupResult = await this.markupService.calculatePrice(
        baseAmount,
        'flights',
        undefined,
        'manual',
        undefined,
        undefined,
      );
      const priceChanged =
        typeof input.totalPrice === 'number' &&
        input.totalPrice > 0 &&
        markupResult.finalPrice > 0 &&
        Math.abs(markupResult.finalPrice - input.totalPrice) /
          input.totalPrice >
          0.01;
      return {
        snapshotId: snapshot.id,
        offerId,
        amount: baseAmount,
        currency: baseCurrency,
        displayPrice: markupResult.finalPrice,
        supplierBase: baseAmount,
        markupAmount: Math.max(0, markupResult.finalPrice - baseAmount),
        freshRepriceAvailable: false,
        priceChanged,
        chargeAmount: baseAmount,
        chargeCurrency: baseCurrency,
      };
    }

    console.log(
      `[REPRICE-DEBUG] provider="${provider}", tripType="${snapshot.tripType}", offerId="${offerId}"`,
    );

    let amount: number;
    let currency: string;
    let freshRepriceAvailable = false;

    try {
      if (provider === 'duffel' || provider === 'amadeus') {
        try {
          const bookingProvider =
            this.bookingProviderRegistry.getProvider(provider);
          if (bookingProvider?.reprice) {
            const repriceResult = await bookingProvider.reprice(
              searchKey,
              offerId,
            );
            amount = repriceResult.amount;
            currency = repriceResult.currency;
            freshRepriceAvailable = true;
          } else {
            throw new Error(
              `${provider} booking provider has no reprice method`,
            );
          }
        } catch (refreshErr: unknown) {
          // Duffel refresh 422s when the cached offer expired/unavailable.
          // Don't hard-block the detail page — fall back to the snapshot's
          // search-time price so checkout can attempt the real order (and
          // fail cleanly with auto-refund if the fare is truly gone).
          const pricing = snapshot.pricingSnapshot as {
            amount: number;
            currency: string;
          } | null;
          if (pricing && Number(pricing.amount) > 0) {
            this.logger.warn(
              `[repriceFromSnapshot] ${provider} live refresh failed (${refreshErr instanceof Error ? refreshErr.message : refreshErr}) — falling back to snapshot price`,
            );
            amount = Number(pricing.amount);
            currency = pricing.currency ?? 'USD';
            freshRepriceAvailable = false;
          } else {
            throw refreshErr;
          }
        }
      } else {
        // ponytail: detect multi-city by multiple productSelections (from LEG mode combination).
        // tripType may not be reliable — check product count instead.
        const sc = snapshot.supplierContext as Record<string, any>;
        const isMultiCity =
          Array.isArray(sc?.productSelections) &&
          sc.productSelections.length >= 2;
        if (isMultiCity) {
          const sc = snapshot.supplierContext as Record<string, any>;
          const cacheEntry: SelectedOfferCacheEntry = {
            catalogUuid: sc.catalogUuid ?? '',
            offeringIds: sc.offeringId ? [sc.offeringId] : [],
            productRefs: sc.productIds ?? [],
            productSelections: sc.productSelections ?? [],
            contentSource: sc.contentSource,
            supplierPrice: snapshot.pricingSnapshot as {
              amount: number;
              currency: string;
            },
            referenceList: sc.referenceList ?? { products: {}, flights: {} },
            passengerCriteria: sc.passengerCriteria ?? [],
            searchCriteria: sc.searchCriteria ?? {
              from: '',
              to: '',
              departureDate: '',
              adults: 1,
            },
            combinabilityCode: sc.combinabilityCode,
            brandOfferingId: sc.brandOfferingId,
            workflowKind: sc.workflowKind,
            capabilities: sc.capabilities,
            travelportPlusSessionId: sc.travelportSessionId,
          };
          await this.selectedOfferCache.store(
            provider,
            searchKey,
            offerId,
            cacheEntry,
          );

          try {
            const priced =
              await this.bookingWorkflowService.priceForCheckoutSession(
                searchKey,
                offerId,
                true,
              );
            amount = priced.amount;
            currency = priced.currency;
            liveFareRules = priced.fareRules;
            freshRepriceAvailable = true;
          } catch (e: any) {
            this.logger.warn(
              `[repriceFromSnapshot] Multi-city catalog reprice failed: ${e.message}. Using search-time price.`,
            );
            const pricing = snapshot.pricingSnapshot as {
              amount: number;
              currency: string;
            } | null;
            if (pricing) {
              amount = pricing.amount;
              currency = pricing.currency;
              freshRepriceAvailable = false;
            } else {
              throw e;
            }
          }
        } else {
          // Phase 12 fix: Reconstruct a SelectedOfferCacheEntry from the snapshot's
          // supplierContext so the workflow reads snapshot data, not stale search cache.
          const sc = snapshot.supplierContext as Record<string, any>;
          const cacheEntry: SelectedOfferCacheEntry = {
            catalogUuid: sc.catalogUuid ?? '',
            offeringIds: sc.offeringId ? [sc.offeringId] : [],
            productRefs: sc.productIds ?? [],
            productSelections: sc.productSelections ?? [],
            contentSource: sc.contentSource,
            supplierPrice: snapshot.pricingSnapshot as {
              amount: number;
              currency: string;
            },
            referenceList: sc.referenceList ?? { products: {}, flights: {} },
            passengerCriteria: sc.passengerCriteria ?? [],
            searchCriteria: sc.searchCriteria ?? {
              from: '',
              to: '',
              departureDate: '',
              adults: 1,
            },
            combinabilityCode: sc.combinabilityCode,
            brandOfferingId: sc.brandOfferingId,
            workflowKind: sc.workflowKind,
            capabilities: sc.capabilities,
          };
          const cacheKey = `flight-search:${searchKey}`;
          const cache = (await this.cacheService.get<any>(cacheKey)) ?? {};
          cache[offerId] = cacheEntry;
          // Store in selected-offer cache so priceForCheckoutSession reads snapshot data
          await this.selectedOfferCache.store(
            provider,
            searchKey,
            offerId,
            cacheEntry,
          );

          const priced =
            await this.bookingWorkflowService.priceForCheckoutSession(
              searchKey,
              offerId,
            );
          amount = priced.amount;
          currency = priced.currency;
          liveFareRules = priced.fareRules;
          freshRepriceAvailable = true;
        }
      }

      // QA R4: capture the native charge before display conversion —
      // checkout/wallet settlement charges this exact amount/currency.
      chargeAmount = amount;
      chargeCurrency = currency;

      // Currency conversion if requested
      if (input.displayCurrency && currency !== input.displayCurrency) {
        try {
          const converted = await this.convertCurrency(
            amount,
            currency,
            input.displayCurrency,
          );
          amount = converted.amount;
          currency = converted.currency;
        } catch {
          // Ignore — use original currency
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fake-PNR path: a fake-eligible demo/guest session must NOT hard-block
      // on the snapshot-page fare step. Fall back to the snapshot's own
      // search-time price so checkout → payment → ticketBooking() can run,
      // where the real supplier failure is refunded + faked. Real admin /
      // real customers keep the strict throw below.
      if (await this.isCallerFakeEligible(userId, provider)) {
        const pricing = snapshot.pricingSnapshot as {
          amount?: number;
          currency?: string;
        } | null;
        const snapAmount = Number(pricing?.amount ?? 0);
        if (snapAmount > 0) {
          this.logger.warn(
            `[repriceFromSnapshot] Live reprice failed for ${input.snapshotId} (fake-eligible) — using snapshot price: ${msg}`,
          );
          amount = snapAmount;
          currency = pricing?.currency ?? 'USD';
          chargeAmount = amount;
          chargeCurrency = currency;
          freshRepriceAvailable = false;
        } else {
          this.logger.warn(
            `[repriceFromSnapshot] Live reprice failed for ${input.snapshotId}: ${msg}`,
          );
          throw new BusinessError(
            'FLIGHTS_REPRICE_FAILED',
            msg || 'This fare is no longer available. Please start a new search.',
          );
        }
      } else {
        // Phase 12 fix: Do NOT fall back to stale snapshot pricing.
        // If Travelport says the fare is unavailable, the stale price is wrong.
        // Throw so the frontend can show the correct error and prompt re-search.
        this.logger.warn(
          `[repriceFromSnapshot] Live reprice failed for ${input.snapshotId}: ${msg}`,
        );
        throw new BusinessError(
          'FLIGHTS_REPRICE_FAILED',
          msg || 'This fare is no longer available. Please start a new search.',
        );
      }
    }

    // Travelport's live price response carries the authoritative fare
    // conditions (search results only carry a partial view). Store them on the
    // snapshot so checkout persists them onto the booking — the admin cancel
    // estimate (incl. fake-PNR bookings) then reads real stored policy.
    if (liveFareRules) {
      await this.snapshotService
        .applyFreshFareRules(snapshot.id, {
          refund: liveFareRules.refund as unknown as Record<string, unknown>,
          change: liveFareRules.change as unknown as Record<string, unknown>,
        })
        .catch((err: unknown) =>
          this.logger.warn(
            `[repriceFromSnapshot] Could not store fare rules on snapshot ${snapshot.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    }

    // supplierId is REQUIRED — supplier-scoped rules (e.g. a template applied
    // to duffel) otherwise never match and the raw price leaks to checkout.
    const markupResult = await this.markupService.calculatePrice(
      amount,
      'flights',
      undefined,
      snapshot.provider,
      undefined,
      undefined,
    );

    // Compare marked-up display price vs the card's marked-up price — NOT the
    // raw pre-markup amount. Comparing raw vs marked always exceeds the 1%
    // tolerance whenever any markup rule applies, so the "Price updated"
    // banner fired on every snapshot booking even when nothing changed.
    const priceChanged =
      typeof input.totalPrice === 'number' &&
      input.totalPrice > 0 &&
      markupResult.finalPrice > 0 &&
      Math.abs(markupResult.finalPrice - input.totalPrice) / input.totalPrice >
        0.01;

    return {
      snapshotId: snapshot.id,
      offerId,
      amount,
      currency,
      displayPrice: markupResult.finalPrice,
      supplierBase: amount,
      markupAmount: Math.max(0, markupResult.finalPrice - amount),
      freshRepriceAvailable,
      priceChanged,
      chargeAmount: chargeAmount ?? amount,
      chargeCurrency: chargeCurrency ?? currency,
      ...(liveFareRules
        ? {
            fareRules: {
              refundPolicy: liveFareRules.refund,
              changePolicy: liveFareRules.change,
            },
          }
        : {}),
    };
  }

  async confirm(input: BookingConfirmDto): Promise<{
    bookingId: string;
    status?: string;
    locatorCode?: string;
    workbenchId?: string;
    reservationId?: string;
    message?: string;
    workflow?: unknown;
  }> {
    const booking = await this.bookingRepo.findById(input.bookingId);
    this.logger.log(
      `[confirm] Called for ${input.bookingId}: status=${booking?.status ?? '(not found)'} provider=${booking?.provider ?? '(none)'} locatorCode=${booking?.locatorCode ?? '(none)'}`,
    );
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    if (
      booking.status === 'booked' ||
      booking.status === 'held' ||
      booking.status === 'ticketed'
    ) {
      return {
        bookingId: booking.id,
        status: booking.status,
        locatorCode: booking.locatorCode,
        message: `Booking already ${booking.status}.`,
      };
    }

    if (booking.status === 'failed') {
      throw new BusinessError(
        'FLIGHTS_BOOKING_FAILED',
        'This booking has already failed and cannot be confirmed.',
      );
    }

    if (booking.status === 'cancelled') {
      throw new BusinessError(
        'FLIGHTS_BOOKING_CANCELLED',
        'This booking has been cancelled and cannot be confirmed.',
      );
    }

    // Belt-and-suspenders: if a locatorCode already exists, skip the supplier workflow.
    // This handles the edge case where a booking has a hold PNR but the status
    // wasn't updated to 'held' (e.g. held_pending_payment with locatorCode).
    if (booking.locatorCode) {
      return {
        bookingId: booking.id,
        status: booking.status,
        locatorCode: booking.locatorCode,
        message: `Booking already has locator code — skipping supplier booking.`,
      };
    }

    // Re-validate price against cached search data (compare base provider prices, not marked-up prices)
    const searchKey = booking.offerSnapshot.searchKey;
    if (searchKey) {
      try {
        const rawPrice = await this.resolvePrice(
          searchKey,
          booking.offerSnapshot.offerId,
          booking.baseAmount ?? booking.amount ?? undefined,
          booking.currency ?? undefined,
          booking.provider,
          booking.offerSnapshot?.tripType,
        );
        // Compare stored supplier base price against current supplier price
        const storedBasePrice = booking.baseAmount ?? booking.amount ?? 0;
        const currentSupplierPrice = rawPrice.amount;

        if (storedBasePrice > 0 && currentSupplierPrice > 0) {
          const priceChangePercent =
            Math.abs(currentSupplierPrice - storedBasePrice) / storedBasePrice;
          this.logger.log(
            `[PriceRevalidation] Booking ${booking.id}: stored=${storedBasePrice} current=${currentSupplierPrice} change=${(priceChangePercent * 100).toFixed(1)}%`,
          );
          if (priceChangePercent > 0.1) {
            throw new BusinessError(
              'FLIGHTS_OFFER_PRICE_CHANGED',
              `Offer price has changed. Please rebook at the current price.`,
              undefined,
              {
                storedBasePrice,
                currentSupplierPrice,
                changePercent: +(priceChangePercent * 100).toFixed(1),
              },
            );
          }
        }
      } catch (err: any) {
        if (err?.response?.code === 'FLIGHTS_OFFER_PRICE_CHANGED') throw err;
        // When strictReprice is enabled, fail the booking if price couldn't be verified
        if (err?.response?.code === 'FLIGHTS_REPRICE_FAILED') throw err;
        // Fare no longer available — block booking, don't proceed
        if (err?.response?.code === 'FLIGHTS_OFFER_UNAVAILABLE') throw err;
        // If cache is unavailable, proceed — provider will validate at booking time
        this.logger.warn(
          `Price re-validation unavailable for ${searchKey}: ${err?.message ?? err}`,
        );
      }
    }

    // Phase 7: Re-validate ancillary prices at confirm time
    const storedAncillaries = booking.offerSnapshot?.ancillaries;
    if (storedAncillaries && searchKey) {
      const ancillaryTolerance =
        this.configService.travelport.ancillaryPriceTolerance ?? 0.03;
      try {
        // Extract main product IDs from the booking snapshot for the ancillary price workbench
        const confirmMainIds = booking.offerSnapshot.productIds?.length
          ? booking.offerSnapshot.productIds
          : (booking.offerSnapshot.productSelections?.flatMap(
              (s) => s.productIds,
            ) ??
            (booking.offerSnapshot.productId
              ? [booking.offerSnapshot.productId]
              : []));

        const ancillaryReprice = await this.repriceAncillaries(
          searchKey,
          booking.offerSnapshot.offerId,
          booking.offerSnapshot.catalogUuid,
          confirmMainIds,
          storedAncillaries,
          booking.travelerSnapshot?.length ?? 1,
        );
        if (ancillaryReprice) {
          const storedAncillaryTotal =
            storedAncillaries.seats.reduce(
              (sum, s) => sum + (s.price?.amount ?? 0),
              0,
            ) +
            storedAncillaries.baggage.reduce(
              (sum, b) => sum + (b.price?.amount ?? 0),
              0,
            ) +
            storedAncillaries.meals.reduce(
              (sum, m) => sum + (m.price?.amount ?? 0),
              0,
            ) +
            storedAncillaries.services.reduce(
              (sum, s) => sum + (s.price?.amount ?? 0),
              0,
            );
          const freshAncillaryTotal =
            ancillaryReprice.seatTotal +
            ancillaryReprice.baggageTotal +
            ancillaryReprice.mealTotal +
            ancillaryReprice.serviceTotal;

          if (storedAncillaryTotal > 0 && freshAncillaryTotal > 0) {
            const ancillaryChangePercent =
              Math.abs(freshAncillaryTotal - storedAncillaryTotal) /
              storedAncillaryTotal;
            if (ancillaryChangePercent > ancillaryTolerance) {
              throw new BusinessError(
                'FLIGHTS_ANCILLARY_PRICE_CHANGED',
                `Ancillary prices have changed. Please review and rebook.`,
                undefined,
                {
                  storedAncillaryTotal,
                  freshAncillaryTotal,
                  changePercent: +(ancillaryChangePercent * 100).toFixed(1),
                  tolerance: +(ancillaryTolerance * 100).toFixed(1),
                },
              );
            }
          }
        }
      } catch (err: any) {
        if (err?.response?.code === 'FLIGHTS_ANCILLARY_PRICE_CHANGED')
          throw err;
        this.logger.warn(
          `Ancillary price re-validation unavailable: ${err?.message ?? err}`,
        );
      }
    }

    // QA 2026-09-09: manual (seed) offers — confirm locally with a generated
    // locator. No supplier workflow exists for them.
    if (booking.provider === 'manual') {
      const localRef = `MAN${booking.id.slice(0, 8).toUpperCase()}`;
      await this.bookingRepo.update(booking.id, {
        status: 'held',
        locatorCode: localRef,
        message: 'Manual inventory booking confirmed.',
      });
      this.logger.log(
        `[confirm] Manual booking ${booking.id} — held with local ref ${localRef}`,
      );
      return {
        bookingId: booking.id,
        status: 'booked',
        locatorCode: localRef,
        message: 'Booking confirmed.',
      };
    }

    // Phase 8: Dispatch non-Travelport providers BEFORE the Travelport-specific
    // workflow data check. Duffle bookings have no catalogUuid, so they would
    // fail the hasWorkflowData check below.
    if (booking.provider !== 'travelport') {
      return this.confirmNonTravelport(booking);
    }

    // QA 2026-09-14: multi-city Travelport used to short-circuit here with a
    // fabricated local locator ("IKF...") and report status 'booked' WITHOUT
    // ever calling Travelport — a fake success masking a real, unfixed
    // booking failure (the supplier PNR was never created). Removed: let
    // multi-city fall through to the same real hasWorkflowData check + live
    // Travelport commit workflow that one-way and round-trip already use.
    // If the real workflow genuinely can't proceed, it must fail loudly
    // (below, or inside the workflow itself) — never fabricate a PNR.

    // When catalog identifiers are absent (legacy agent bookings), skip the Travelport
    // workflow and mark as booked with a local reference.
    const catalogUuid = booking.offerSnapshot?.catalogUuid?.trim();
    const offeringId = booking.offerSnapshot?.offerId?.trim();
    const offeringIdentifierValue =
      booking.offerSnapshot?.offeringIdentifierValue?.trim();
    const productId = booking.offerSnapshot?.productId?.trim();
    const hasWorkflowData =
      catalogUuid && (offeringId || productId || offeringIdentifierValue);

    this.logger.log(
      `[confirm] Booking ${booking.id}: hasWorkflowData=${!!hasWorkflowData} catalogUuid=${catalogUuid ? catalogUuid.slice(0, 12) + '...' : '(none)'} offeringId=${offeringId ? offeringId.slice(0, 16) : '(none)'} productId=${productId ? productId.slice(0, 16) : '(none)'} offeringIdentifierValue=${offeringIdentifierValue ? offeringIdentifierValue.slice(0, 16) : '(none)'} provider=${booking.provider} status=${booking.status}`,
    );

    if (!hasWorkflowData) {
      // Legacy locator path: gated behind allowLegacyLocator config flag.
      // In production checkout (allowLegacyLocator=false), missing supplier data
      // should fail with a clear error instead of creating a fake locator.
      // A random EXP-tagged fake PNR (not the old non-random "IKF<id>") makes
      // it unambiguous, everywhere the reference is shown, that this offer
      // expired before Travelport ever confirmed it.
      if (this.configService.travelport.allowLegacyLocator) {
        const localRef = generateExpiredPnr(booking.provider);
        await this.bookingRepo.update(booking.id, {
          status: 'held',
          locatorCode: localRef,
          message: 'Booking confirmed (workflow skipped — no catalog data).',
        });
        return {
          bookingId: booking.id,
          status: 'booked',
          locatorCode: localRef,
          message: 'Booking confirmed.',
        };
      }
      // Production path: fail fast when no supplier workflow data
      throw new BusinessError(
        'FLIGHTS_OFFER_EXPIRED',
        'Cannot confirm booking without supplier data (catalog identifiers). The offer may have expired. Please perform a new search.',
      );
    }

    // Phase 2 — Atomic status claim: re-check status right before claiming.
    // This closes the practical race window. For true database-level atomicity,
    // add updateMany(where, data) to the repo port when needed.
    const currentClaimStatus = (await this.bookingRepo.findById(booking.id))
      ?.status;
    const validPreConfirmStates = [
      'pending_payment',
      'held_pending_payment',
      'booking_in_progress',
    ];
    if (
      !currentClaimStatus ||
      !validPreConfirmStates.includes(currentClaimStatus)
    ) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_ALREADY_PROCESSING',
        `Cannot confirm booking in status: ${currentClaimStatus}. Expected 'pending_payment' or 'booking_in_progress'.`,
      );
    }

    // If the payment listener already claimed booking_in_progress, don't re-claim.
    // This happens when ticketBooking() is called by the listener after payment succeeds.
    if (currentClaimStatus !== 'booking_in_progress') {
      // SECURITY: Direct API calls arrive here with status 'pending_payment'.
      // Verify a PAID payment exists before proceeding to supplier.
      // The normal flow: payment.succeeded listener sets booking_in_progress → confirm()
      // Direct flow:    confirm() called with pending_payment → must verify payment first.
      const paidPayments = await this.paymentRepository.findMany({
        bookingId: booking.id,
        status: PaymentStatus.PAID,
      });
      if (!paidPayments || paidPayments.length === 0) {
        this.logger.warn(
          `[PaymentGating] Confirm rejected for booking ${booking.id}: no PAID payment found (status=${currentClaimStatus})`,
        );
        throw new BusinessError(
          'FLIGHTS_BOOKING_FAILED',
          'Payment has not been confirmed. Please complete payment before confirming your booking.',
        );
      }
      await this.bookingRepo.update(booking.id, {
        status: 'booking_in_progress',
        message: 'Booking workflow started.',
      });
    }

    try {
      const workflowInput = {
        from: booking.offerSnapshot.from,
        to: booking.offerSnapshot.to,
        departureDate: booking.offerSnapshot.departureDate,
        tripType: booking.offerSnapshot.tripType,
        returnDate: booking.offerSnapshot.returnDate,
        adults: booking.travelerSnapshot.length || 1,
        accessGroup: undefined,
        pcc: undefined,
        gds: '1G',
        traveler: booking.travelerSnapshot[0],
        travelers: booking.travelerSnapshot,
        searchKey: booking.offerSnapshot.searchKey,
        catalogUuid: booking.offerSnapshot.catalogUuid,
        offerId: booking.offerSnapshot.offerId,
        offeringId: booking.offerSnapshot.offerId,
        productId: booking.offerSnapshot.productId,
        productIds: booking.offerSnapshot.productIds,
        productSelections: booking.offerSnapshot.productSelections,
        seatProductIds: booking.offerSnapshot.seatProductIds,
        baggageProductIds: booking.offerSnapshot.baggageProductIds,
        serviceProductIds: booking.offerSnapshot.serviceProductIds,
        mealSelectionIds: booking.offerSnapshot.mealSelectionIds,
        ancillaries: booking.offerSnapshot.ancillaries,
        selectedOfferContext: booking.offerSnapshot.selectedOfferContext,
        skipTicketing: true,
        // Phase 5: confirm() always skips ticketing — ticketing runs after payment via ticketBooking()
      } as any;

      // Skip the search step — the booking already has valid catalog identifiers
      // (catalogUuid, offeringId, productSelections) from the preview/checkout flow.
      // The selected-offer cache also has the reference list data for buildfromproducts.
      // Forcing a new search here causes redundant Travelport API calls that can fail
      // with 'NO OFFERS FOUND FOR THE CHANNEL' validation errors in test environments.
      const result = await this.bookingWorkflowService.runWorkflow(
        workflowInput,
        false,
      );
      this.logger.log(
        `[confirm] Workflow result for ${booking.id}: ok=${(result as any)?.ok} failedStep=${(result as any)?.failedStep ?? '(none)'} message=${(result as any)?.message ?? '(none)'} catalogUuid=${((result as any)?.identifiers?.catalogUuid ?? '(none)').toString().slice(0, 16)} offeringId=${((result as any)?.identifiers?.offeringId ?? '(none)').toString().slice(0, 16)} productIds=${JSON.stringify((result as any)?.identifiers?.productIds)} locatorCode=${(result as any)?.identifiers?.locatorCode ?? '(none)'} steps=${((result as any)?.steps ?? []).length}`,
      );
      const workflowOk = (result as any)?.ok === true;
      if (!workflowOk) {
        const failedStep = (result as any)?.failedStep ?? 'unknown';
        const failedStepObj = (result as any)?.steps?.find(
          (s: any) => s?.name === failedStep,
        );
        const upstreamMessages = this.extractWorkflowErrorMessages(
          failedStepObj?.errors ?? failedStepObj?.response,
        );
        const message =
          (result as any)?.message ??
          (upstreamMessages.length > 0
            ? `Workflow failed at step: ${failedStep} - ${upstreamMessages.join(' | ')}`
            : `Workflow failed at step: ${failedStep}`);

        await this.bookingRepo.update(booking.id, {
          status: 'failed',
          message,
          workflowSummary: {
            failedStep,
            message,
            cacheSource: (result as any)?.cacheSource,
            hasSnapshot: Boolean(booking.offerSnapshot?.selectedOfferContext),
            catalogUuid: booking.offerSnapshot?.catalogUuid?.slice(0, 16),
            productSelectionsCount:
              booking.offerSnapshot?.productSelections?.length ?? 0,
            errors: upstreamMessages,
            steps: ((result as any)?.steps ?? []).length,
            createdAt: new Date().toISOString(),
          },
        });

        // Detect fare availability errors (4110) and return a typed error so the
        // frontend can redirect to search instead of showing a generic failure.
        const allErrorText = upstreamMessages.join(' ').toLowerCase();
        const isFareUnavailable =
          allErrorText.includes('fare is not available') ||
          allErrorText.includes('fare not available') ||
          allErrorText.includes('4110') ||
          allErrorText.includes('no longer available');

        if (isFareUnavailable) {
          // Invalidate selected-offer cache so stale data isn't reused
          try {
            const offerKey = booking.offerSnapshot?.offerId;
            if (offerKey && booking.offerSnapshot?.searchKey) {
              await this.selectedOfferCache.delete(
                booking.provider,
                booking.offerSnapshot.searchKey,
                offerKey,
              );
            }
          } catch {
            /* best effort */
          }
        }

        throw new BusinessError(
          isFareUnavailable
            ? 'FLIGHTS_OFFER_UNAVAILABLE'
            : 'FLIGHTS_BOOKING_FAILED',
          isFareUnavailable
            ? 'The fare is no longer available. Please search again for current prices.'
            : message,
          undefined,
          {
            failedStep,
            stepStatus: failedStepObj?.status,
            stepErrors: failedStepObj?.errors,
            stepResponse: failedStepObj?.response,
          },
        );
      }
      const identifiers = (result as any)?.identifiers ?? {};
      if (!identifiers.locatorCode) {
        await this.bookingRepo.update(booking.id, {
          status: 'failed',
          message: 'Workflow completed without locator code.',
        });

        throw new BusinessError(
          'FLIGHTS_BOOKING_FAILED',
          'Booking did not return locator code (PNR).',
          undefined,
          { workflow: result },
        );
      }

      const workflowSteps = ((result as any)?.steps ?? []).map((s: any) => ({
        step: s.name ?? 'unknown',
        status: s.ok === true ? ('success' as const) : ('failed' as const),
        duration: s.durationMs ?? 0,
        error: s.errors?.length
          ? JSON.stringify(s.errors).slice(0, 500)
          : undefined,
      }));

      const ancillaryFailures =
        (identifiers as { ancillaryFailures?: number })?.ancillaryFailures ?? 0;
      await this.bookingRepo.update(booking.id, {
        status: 'held',
        workbenchId: identifiers.workbenchId,
        reservationId: identifiers.reservationId ?? identifiers.workbenchId,
        locatorCode: identifiers.locatorCode,
        extrasStatus: ancillaryFailures > 0 ? 'partial' : undefined,
        workflowSummary: {
          ticketingMode: 'hold_only',
          locatorCode: identifiers.locatorCode,
          cacheSource: (result as any)?.cacheSource,
          steps: workflowSteps,
          percent:
            workflowSteps.length > 0
              ? Math.round(
                  (workflowSteps.filter((s: any) => s.status === 'success')
                    .length /
                    workflowSteps.length) *
                    100,
                ) || 0
              : 0,
          createdAt: new Date().toISOString(),
        },
        message:
          ancillaryFailures > 0
            ? `Booking committed. ${ancillaryFailures} seat(s) could not be added — airline will assign at check-in.`
            : 'Booking committed successfully. Awaiting ticketing after payment.',
      });

      const latest = await this.bookingRepo.findById(booking.id);

      return {
        bookingId: booking.id,
        status: latest?.status,
        locatorCode: latest?.locatorCode,
        workbenchId: latest?.workbenchId,
        reservationId: latest?.reservationId,
        workflow: result,
      };
    } catch (error: any) {
      this.logger.error(
        `[confirm] FAILED for booking ${booking.id}: ${error?.code ?? '(no code)'} ${error?.message ?? '(no message)'}`,
      );
      await this.bookingRepo.update(booking.id, {
        status: 'failed',
        message: error?.message ?? 'Booking failed.',
        workflowSummary: {
          failedStep: 'unknown',
          message: error?.message ?? 'Booking failed.',
          hasSnapshot: Boolean(booking.offerSnapshot?.selectedOfferContext),
          catalogUuid: booking.offerSnapshot?.catalogUuid?.slice(0, 16),
          productSelectionsCount:
            booking.offerSnapshot?.productSelections?.length ?? 0,
          errorCode: error?.response?.code ?? error?.code,
          createdAt: new Date().toISOString(),
        },
      });

      throw error;
    }
  }

  /**
   * Dispatch a non-Travelport booking confirm through the booking provider registry.
   */
  private async confirmNonTravelport(booking: FlightBookingEntity): Promise<{
    bookingId: string;
    status?: string;
    locatorCode?: string;
    workbenchId?: string;
    reservationId?: string;
    message?: string;
    workflow?: unknown;
  }> {
    // Claim booking_in_progress to prevent race conditions, matching the Travelport path
    await this.bookingRepo.update(booking.id, {
      status: 'booking_in_progress',
      message: 'Booking workflow started (non-Travelport).',
    });

    const provider = this.bookingProviderRegistry.getProvider(booking.provider);
    const input = this.buildBookingProviderInput(booking);

    let result;
    try {
      result = await provider.confirmBooking(input);
    } catch (err: any) {
      await this.bookingRepo.update(booking.id, {
        status: 'failed',
        message: err?.message ?? 'Booking failed unexpectedly.',
      });
      throw new BusinessError(
        'FLIGHTS_BOOKING_FAILED',
        err?.message ?? 'Booking failed unexpectedly.',
        undefined,
        { provider: booking.provider },
      );
    }

    if (!result.ok) {
      await this.bookingRepo.update(booking.id, {
        status: 'failed',
        message: result.message ?? 'Booking failed.',
      });
      throw new BusinessError(
        'FLIGHTS_BOOKING_FAILED',
        result.message ?? 'Booking failed.',
        undefined,
        { provider: booking.provider, failedStep: result.failedStep },
      );
    }

    const updateData: Record<string, unknown> = {
      status: 'held',
      locatorCode: result.locatorCode,
      message: result.message ?? 'Booking confirmed.',
    };

    // Persist supplierBookingId (e.g. Duffel order.id) in workflowSummary
    // for proper cancellation/reconciliation. Duffel uses order.id, not locatorCode.
    if (result.supplierBookingId) {
      updateData.workflowSummary = {
        supplierBookingId: result.supplierBookingId,
        locatorCode: result.locatorCode,
        ticketingMode: 'ticket_after_payment',
        createdAt: new Date().toISOString(),
      };
    }

    // Capture the booked fare's refund/change conditions onto the booking.
    // The freshly created Duffel order carries authoritative `conditions`;
    // storing them here powers the cancel estimate, success page, payment
    // page, and admin modal without re-fetching the supplier later.
    if (booking.provider === 'duffel' && result.supplierBookingId) {
      try {
        const liveOrder = await provider.retrieveBooking?.({
          supplierBookingId: String(result.supplierBookingId),
          locatorCode: result.locatorCode,
        });
        const orderRaw = (liveOrder as any)?.raw as
          | Record<string, any>
          | undefined;
        const conditions = orderRaw?.conditions;
        const sliceConditions = (orderRaw?.slices as any[] | undefined)?.[0]
          ?.conditions;
        const fareConditions =
          conditions ??
          (sliceConditions
            ? { ...sliceConditions, __source: 'slice' }
            : undefined);
        if (fareConditions && Object.keys(fareConditions).length > 0) {
          updateData.offerSnapshot = {
            ...((booking.offerSnapshot ?? {}) as Record<string, unknown>),
            rawOffer: {
              ...(((booking.offerSnapshot as Record<string, any>)?.rawOffer ??
                {}) as Record<string, unknown>),
              conditions: fareConditions,
            },
          };
        }
      } catch {
        /* best-effort — estimate falls back to snapshot display policies */
      }
    }

    // Update booking amount to the actual charged price — the snapshot may
    // hold a stale offer price that differs from the re-validated amount used
    // at confirm/payment. Keeps the booking record consistent with what was
    // actually paid.
    //
    // IMPORTANT: providers report the NET fare they charged the *agency*
    // (e.g. Duffel order.total_amount), not what the customer paid us. The
    // customer total already includes markup and was the amount the payment
    // intent was created for. If we overwrote `amount` with the net fare the
    // booking row would understate the charge and admin earnings
    // (amount − baseAmount) would collapse to zero/no earnings.
    if (result.chargedAmount != null) {
      const supplierAmount = Number(result.chargedAmount);
      const preConfirmAmount = Number(booking.amount ?? 0);
      const sameCurrency =
        !result.chargedCurrency ||
        !booking.currency ||
        result.chargedCurrency === booking.currency;
      if (
        sameCurrency &&
        preConfirmAmount > 0 &&
        supplierAmount > 0 &&
        supplierAmount < preConfirmAmount
      ) {
        // Net supplier fare < customer total → keep the marked-up customer
        // total as `amount` and record the net fare as `baseAmount` so the
        // margin stays visible (earnings = amount − baseAmount).
        updateData.baseAmount = supplierAmount;
      } else {
        // Fare moved up (or no prior amount): reflect the real charged price.
        updateData.amount = result.chargedAmount;
      }
    }
    if (result.chargedCurrency) {
      updateData.currency = result.chargedCurrency;
    }

    // Persist fare rules returned by the provider at confirm time (Amadeus
    // live pricing carries REFUND/EXCHANGE rules) so the cancel estimate and
    // rate comments use real stored policies instead of guesses.
    const wfFareRules = (result.workflowData as Record<string, any> | undefined)
      ?.fareRules as
      | { refundPolicy?: unknown; changePolicy?: unknown }
      | undefined;
    if (wfFareRules && (wfFareRules.refundPolicy || wfFareRules.changePolicy)) {
      const base =
        (updateData.offerSnapshot as Record<string, any> | undefined) ??
        ((booking.offerSnapshot ?? {}) as Record<string, unknown>);
      updateData.offerSnapshot = {
        ...base,
        display: {
          ...((base?.display ?? {}) as Record<string, unknown>),
          ...(wfFareRules.refundPolicy
            ? { refundPolicy: wfFareRules.refundPolicy }
            : {}),
          ...(wfFareRules.changePolicy
            ? { changePolicy: wfFareRules.changePolicy }
            : {}),
        },
      };
    }

    await this.bookingRepo.update(booking.id, updateData);

    return {
      bookingId: booking.id,
      status: 'held',
      locatorCode: result.locatorCode,
      workflow: result.workflowData,
    };
  }

  /**
   * Build a provider-neutral BookingProviderInput from a booking entity.
   */
  private buildBookingProviderInput(booking: FlightBookingEntity) {
    return {
      bookingId: booking.id,
      provider: booking.provider,
      searchKey: booking.offerSnapshot?.searchKey,
      offerId: booking.offerSnapshot?.offerId,
      catalogUuid: booking.offerSnapshot?.catalogUuid,
      offeringId: booking.offerSnapshot?.offerId,
      productId: booking.offerSnapshot?.productId,
      productIds: booking.offerSnapshot?.productIds,
      productSelections: booking.offerSnapshot?.productSelections,
      seatProductIds: booking.offerSnapshot?.seatProductIds,
      baggageProductIds: booking.offerSnapshot?.baggageProductIds,
      serviceProductIds: booking.offerSnapshot?.serviceProductIds,
      mealSelectionIds: booking.offerSnapshot?.mealSelectionIds,
      ancillaries: booking.offerSnapshot?.ancillaries,
      selectedOfferContext: booking.offerSnapshot?.selectedOfferContext,
      travelers: (booking.travelerSnapshot ?? []) as Array<
        Record<string, unknown>
      >,
      from: booking.offerSnapshot?.from,
      to: booking.offerSnapshot?.to,
      departureDate: booking.offerSnapshot?.departureDate,
      tripType: booking.offerSnapshot?.tripType,
      returnDate: booking.offerSnapshot?.returnDate,
      legs: booking.offerSnapshot?.legs,
    };
  }

  /**
   * The real Payment record's status (PENDING/AUTHORIZED/PAID/REFUNDED/
   * CANCELLED), for display alongside the booking's own status — the two are
   * independent (see AGENTS.md's held/Pay-Later/Bank-Transfer note): a
   * booking can be `awaiting_issue` while payment already shows PAID.
   */
  private async resolvePaymentStatus(
    bookingId: string,
    locatorCode?: string | null,
  ): Promise<string | null> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      let paymentStatus: string | null = payments?.[0]?.status ?? null;
      // ponytail temp: a fake-PNR booking's payment row reads Paid for instant
      // gateways in admin/customer views. Real row keeps REFUNDED truth.
      // Remove with fake fallback.
      const demoPay = payments?.[0] as any;
      const demoGw = String(demoPay?.gateway ?? '').toUpperCase();
      const demoManual =
        demoGw.includes('BANK') ||
        demoGw.includes('PAY_LATER') ||
        demoGw.includes('PAYLATER') ||
        demoGw.includes('MANUAL');
      if (isFakeLocatorCode(locatorCode) && demoPay && !demoManual) {
        paymentStatus = 'PAID';
      }
      return paymentStatus;
    } catch {
      return null;
    }
  }

  async getBookingProgress(id: string) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        'Booking not found.',
      );
    }
    const summary = booking.workflowSummary as Record<string, any> | undefined;
    const steps = summary?.steps ?? [];
    const settlementPending = await this.isFakeSettlementPending(booking);
    const isSuccess = ['ticketed', 'held', 'booked'].includes(booking.status);
    const isAwaitingIssue = booking.status === 'awaiting_issue';
    const isFailure =
      !settlementPending &&
      ['failed', 'failed_supplier_booking'].includes(booking.status);

    const percent = isSuccess || isAwaitingIssue
      ? 100
      : isFailure
        ? 100
        : booking.status === 'booking_in_progress' || settlementPending
          ? 65
          : (summary?.percent ?? 15);

    const title = isSuccess
      ? booking.status === 'ticketed'
        ? 'Ticket issued'
        : 'Booking confirmed'
      : isAwaitingIssue
        ? 'Payment received'
        : isFailure
          ? 'Booking failed'
          : 'Processing your booking';

    return {
      bookingId: id,
      module: 'flights',
      provider: booking.provider,
      status: isSuccess
        ? 'success'
        : isAwaitingIssue
          ? 'awaiting_issue'
          : isFailure
            ? 'failed'
            : booking.status === 'booking_in_progress' || settlementPending
              ? 'running'
              : 'idle',
      percent,
      title,
      message: settlementPending
        ? undefined
        : isAwaitingIssue
          ? 'Payment verified. Your booking will be confirmed shortly.'
          : booking.status === 'failed'
            ? 'We could not complete your booking. Our team will review it.'
            : (summary?.message ?? undefined),
      customerMessage: this.getCustomerFacingMessage(
        settlementPending ? 'booking_in_progress' : booking.status,
      ),
      paymentStatus: await this.resolvePaymentStatus(id, booking.locatorCode),
      adminTrace: this.sanitizeSummaryForCustomer(summary),
      steps,
    };
  }

  async getBooking(id: string) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');
    const settlementPending = await this.isFakeSettlementPending(booking);
    // The demo fallback keeps the real supplier error in workflowSummary for
    // admins — never hand it to the booking's owner/guest.
    const rawSummary = booking.workflowSummary;
    const workflowSummary =
      rawSummary && typeof rawSummary === 'object' && !Array.isArray(rawSummary)
        ? (() => {
            const { realFailure: _hidden, ...rest } = rawSummary as Record<
              string,
              unknown
            >;
            return rest;
          })()
        : rawSummary;
    return {
      id: booking.id,
      status: settlementPending ? 'booking_in_progress' : booking.status,
      paymentStatus: await this.resolvePaymentStatus(id, booking.locatorCode),
      provider: booking.provider,
      amount: booking.amount,
      baseAmount: booking.baseAmount,
      currency: booking.currency,
      locatorCode: booking.locatorCode,
      workbenchId: booking.workbenchId,
      reservationId: booking.reservationId,
      workflowSummary,
      extrasStatus: booking.extrasStatus,
      extrasTotalAmount: booking.extrasTotalAmount,
      extrasCurrency: booking.extrasCurrency,
      lastExtrasSyncAt: booking.lastExtrasSyncAt,
      ticketNumbers:
        booking.workflowSummary &&
        typeof booking.workflowSummary === 'object' &&
        'ticketNumbers' in (booking.workflowSummary as Record<string, unknown>)
          ? ((booking.workflowSummary as Record<string, unknown>)
              .ticketNumbers as string[])
          : Array.isArray(booking.workflowSummary)
            ? (booking.workflowSummary as string[])
            : undefined,
      message: settlementPending ? undefined : booking.message,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      offerSnapshot: booking.offerSnapshot,
      travelerSnapshot: booking.travelerSnapshot,
      userId: booking.userId,
    };
  }

  /**
   * Admin detail: local flight booking + fresh live supplier retrieve (for the
   * admin booking detail modal). Never fabricates data — failures surface.
   */
  async adminFlightDetail(bookingId: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    const summary = booking.workflowSummary as
      | Record<string, unknown>
      | undefined;
    const supplierBookingId =
      (summary?.supplierBookingId as string | undefined) ??
      (summary?.orderId as string | undefined) ??
      booking.workbenchId ??
      undefined;

    // Demo Amadeus bookings and fake-PNR Travelport bookings (see
    // ticketBooking()'s demo/guest fallback) have no real supplier order —
    // a live retrieve would either fabricate data (Amadeus demo) or 404
    // (fake Travelport PNR). Treat them as local-only so the admin modal
    // shows the LOCAL badge and stored snapshot instead.
    const isDemoBooking =
      isFakeBooking(booking) ||
      (typeof supplierBookingId === 'string' &&
        supplierBookingId.startsWith('amd-demo-'));

    let live: unknown = null;
    let liveError: string | null = null;
    if (isDemoBooking) {
      this.logger.log(
        `[AdminDetail] Demo booking ${bookingId} — skipping supplier retrieve (local only).`,
      );
    } else
      try {
        const provider = this.bookingProviderRegistry.getProvider(
          booking.provider,
        );
        if (provider.retrieveBooking) {
          // Bound the supplier call: provider timeouts reach 45s, which hung
          // the admin tab. Local snapshot still returns on timeout.
          const LIVE_TIMEOUT_MS = 8000;
          const result = await Promise.race([
            provider.retrieveBooking({
              supplierBookingId,
              locatorCode: booking.locatorCode ?? undefined,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error('Supplier retrieve timed out.')),
                LIVE_TIMEOUT_MS,
              ),
            ),
          ]);
          if (result.ok) {
            live = result.raw ?? null;
          } else {
            liveError = result.message ?? 'Supplier retrieve failed.';
          }
        } else {
          liveError = `Provider ${booking.provider} does not support supplier retrieval.`;
        }
      } catch (err: unknown) {
        liveError =
          err instanceof Error ? err.message : 'Supplier retrieve failed.';
      }

    // ── Self-heal Duffel fare conditions ──
    // Bookings created before conditions-capture lack rawOffer.conditions.
    // The live order carries them — persist on first detail view so the
    // cancel estimate and all pages get real fare rules afterwards.
    let snapshot = (booking.offerSnapshot ?? null) as Record<
      string,
      any
    > | null;
    if (
      booking.provider === 'duffel' &&
      live &&
      !snapshot?.rawOffer?.conditions
    ) {
      const env = live as Record<string, any>;
      const orderObj =
        env?.data && typeof env.data === 'object' ? env.data : env;
      const conditions = orderObj?.conditions;
      if (conditions && Object.keys(conditions).length > 0) {
        snapshot = {
          ...(snapshot ?? {}),
          rawOffer: {
            ...(snapshot?.rawOffer ?? {}),
            conditions,
          },
        };
        await this.bookingRepo
          .update(bookingId, { offerSnapshot: snapshot } as any)
          .catch(() => {});
      }
    }

    // Payment + markup (mirrors the hotel detail response shape)
    const paymentStatus = await this.resolvePaymentStatus(
      bookingId,
      booking.locatorCode,
    );

    // Self-heal: a booking whose summary lacks ticket numbers gets one live
    // getbylocator attempt (issuance is async server-side — the ticketing
    // flow may have finished before numbers existed). Backfills
    // workflowSummary.ticketNumbers so success/manage pages render.
    try {
      const sum = (booking.workflowSummary ?? {}) as Record<string, unknown>;
      const existing = (sum as { ticketNumbers?: unknown }).ticketNumbers;
      if (
        booking.provider === 'travelport' &&
        booking.locatorCode &&
        !isDemoBooking &&
        (!Array.isArray(existing) || existing.length === 0)
      ) {
        const numbers =
          await this.bookingWorkflowService.fetchTicketNumbersByLocator(
            booking.locatorCode,
          );
        if (numbers.length > 0) {
          await this.bookingRepo
            .update(bookingId, {
              workflowSummary: { ...sum, ticketNumbers: numbers },
            } as any)
            .catch(() => {});
          (booking.workflowSummary as Record<string, unknown>).ticketNumbers =
            numbers;
        }
      }
    } catch {
      // Best-effort only — detail view must never fail on this.
    }

    return {
      bookingId,
      type: 'flight' as const,
      provider: booking.provider,
      reference: booking.locatorCode ?? null,
      localStatus: booking.status,
      locatorCode: booking.locatorCode ?? null,
      supplierBookingId: supplierBookingId ?? null,
      amount: booking.amount ?? null,
      baseAmount: booking.baseAmount ?? null,
      markupAmount: booking.offerSnapshot
        ? ((booking.offerSnapshot as any)?.markupAmount ?? null)
        : null,
      currency: booking.currency ?? 'USD',
      createdAt: booking.createdAt,
      travelerSnapshot: booking.travelerSnapshot ?? null,
      offerSnapshot: snapshot ?? booking.offerSnapshot ?? null,
      paymentStatus,
      demoBooking: isDemoBooking,
      receiptUrl: booking.receiptUrl ?? null,
      holdExpiresAt: booking.holdExpiresAt ?? null,
      supplierHoldExpiresAt: booking.supplierHoldExpiresAt ?? null,
      supplierHoldSource:
        ((booking.workflowSummary ?? {}) as Record<string, unknown>)
          ?.supplierHoldSource ?? null,
      adminHoldExpiresAt: booking.adminHoldExpiresAt ?? null,
      message: booking.message ?? null,
      workflowSummary: booking.workflowSummary ?? null,
      live,
      liveError,
      liveFetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Return a customer-safe error message based on booking status.
   * Never exposes raw supplier technical errors.
   */
  /**
   * Phase 2 — Auto-refund for failed_supplier_booking.
   * When ticketing fails after payment was captured, attempt to refund the payment
   * and log the outcome. Best-effort — failures to refund are logged but not thrown
   * since the booking failure is already handled.
   */
  private async autoRefundFailedBooking(
    bookingId: string,
    failureMessage: string,
  ): Promise<void> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      const paidPayment = payments?.find(
        (p) => p.status === PaymentStatus.PAID,
      );
      if (!paidPayment?.providerPaymentId) {
        this.logger.warn(
          `[AutoRefund] No PAID payment found for ${bookingId} — skipping refund`,
        );
        return;
      }

      const gateway = this.paymentOrchestrator.getGateway(paidPayment.gateway);
      if (!gateway.refundPayment) {
        this.logger.warn(
          `[AutoRefund] Gateway ${paidPayment.gateway} does not support refunds`,
        );
        return;
      }

      await gateway.refundPayment(paidPayment.providerPaymentId);
      paidPayment.status = PaymentStatus.REFUNDED;
      paidPayment.updatedAt = new Date();
      await this.paymentRepository.update(paidPayment);

      this.logger.log(
        `[AutoRefund] Refund initiated for ${bookingId} after failed_supplier_booking: ${failureMessage}`,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[AutoRefund] Failed to auto-refund ${bookingId}: ${msg}`,
      );
      // Best-effort — don't throw, the booking is already in failed_supplier_booking state
    }
  }

  private getCustomerFacingMessage(status: string): string | undefined {
    switch (status) {
      case 'failed_supplier_booking':
        return 'The airline could not confirm this booking. Our team will review it and contact you if needed.';
      case 'failed':
        return 'We were unable to complete your booking. Please contact support for assistance.';
      case 'cancelled':
        return undefined;
      case 'ticketed':
      case 'held':
      case 'booked':
        return undefined;
      default:
        return 'Please wait while we finalize your flight reservation.';
    }
  }

  /**
   * Sanitize a workflow summary for customer display.
   * Removes raw API responses, ticket numbers from summary fields, and internal diagnostics.
   */
  private sanitizeSummaryForCustomer(
    summary: Record<string, any> | undefined,
  ): Record<string, any> | undefined {
    if (!summary || Object.keys(summary).length === 0) return undefined;
    return {
      steps: (summary.steps ?? []).map((s: any) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        provider: s.provider,
        durationMs: s.durationMs,
        message:
          s.status === 'failed'
            ? 'An error occurred during this step.'
            : s.status === 'warning'
              ? 'This step completed with warnings.'
              : undefined,
      })),
      percent: summary.percent,
    };
  }

  async list(user?: { id: string; role?: string }) {
    const bookings =
      user?.role === 'admin'
        ? await this.bookingRepo.findAll()
        : await this.bookingRepo.findByUserId(user?.id ?? '');
    return bookings.map((b) => ({
      id: b.id,
      status: b.status,
      provider: b.provider,
      amount: b.amount,
      currency: b.currency,
      locatorCode: b.locatorCode,
      message: b.message,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  async confirmById(bookingId: string) {
    return this.confirm({ bookingId } as BookingConfirmDto);
  }

  /**
   * Create a supplier hold (PNR reservation with skipTicketing=true) BEFORE payment.
   * Used by the hold-first checkout flow for Travelport bookings.
   * If the hold fails, the booking stays in pending_payment so the user can retry.
   */
  async createHold(bookingId: string): Promise<{
    ok: boolean;
    locatorCode?: string;
    workbenchId?: string;
    reservationId?: string;
    message?: string;
  }> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found.`,
      );
    }

    // Check capability flags — only providers that support pre-payment hold
    let provider;
    try {
      provider = this.bookingProviderRegistry.getProvider(booking.provider);
    } catch {
      return {
        ok: false,
        message: `No booking provider found for ${booking.provider}.`,
      };
    }
    if (!provider.capabilities.supportsPrePaymentHold) {
      return {
        ok: false,
        message: `Provider ${booking.provider} does not support pre-payment hold.`,
      };
    }

    // Already held — return success
    if (booking.locatorCode) {
      this.logger.log(
        `[createHold] Booking ${bookingId} already has locator ${booking.locatorCode}`,
      );
      return {
        ok: true,
        locatorCode: booking.locatorCode,
        message: 'Already held.',
      };
    }

    // Must be in pending_payment to create a hold
    if (booking.status !== 'pending_payment') {
      this.logger.warn(
        `[createHold] Booking ${bookingId} status is ${booking.status}, expected pending_payment`,
      );
      return {
        ok: false,
        message: `Cannot create hold for booking in status: ${booking.status}`,
      };
    }

    // Transition to booking_in_progress for the workflow
    await this.bookingRepo.transitionStatus(
      bookingId,
      booking.status,
      'booking_in_progress',
      'Creating supplier hold before payment.',
    );

    const catalogUuid = booking.offerSnapshot?.catalogUuid?.trim();
    const offeringId = booking.offerSnapshot?.offerId?.trim();
    const productId = booking.offerSnapshot?.productId?.trim();
    const hasWorkflowData =
      catalogUuid &&
      (offeringId ||
        productId ||
        booking.offerSnapshot?.offeringIdentifierValue?.trim());

    if (!hasWorkflowData) {
      // Phase 12: For providers that support pre-payment hold (Travelport),
      // missing workflow data means we cannot safely create a hold. Fail closed —
      // do NOT allow payment to proceed without a supplier hold.
      await this.bookingRepo.transitionStatus(
        bookingId,
        'booking_in_progress',
        'failed',
        'Missing supplier data for pre-payment hold.',
      );
      throw new BusinessError(
        'FLIGHTS_HOLD_FAILED',
        'Booking cannot proceed — missing supplier workflow data required for hold. Please search and select this offer again.',
      );
    }

    const workflowInput = {
      from: booking.offerSnapshot.from,
      to: booking.offerSnapshot.to,
      departureDate: booking.offerSnapshot.departureDate,
      tripType: booking.offerSnapshot.tripType,
      returnDate: booking.offerSnapshot.returnDate,
      adults: booking.travelerSnapshot.length || 1,
      accessGroup: undefined,
      pcc: undefined,
      gds: '1G',
      traveler: booking.travelerSnapshot[0],
      travelers: booking.travelerSnapshot,
      searchKey: booking.offerSnapshot.searchKey,
      catalogUuid: booking.offerSnapshot.catalogUuid,
      offerId: booking.offerSnapshot.offerId,
      offeringId: booking.offerSnapshot.offerId,
      productId: booking.offerSnapshot.productId,
      productIds: booking.offerSnapshot.productIds,
      productSelections: booking.offerSnapshot.productSelections,
      seatProductIds: booking.offerSnapshot.seatProductIds,
      baggageProductIds: booking.offerSnapshot.baggageProductIds,
      serviceProductIds: booking.offerSnapshot.serviceProductIds,
      mealSelectionIds: booking.offerSnapshot.mealSelectionIds,
      ancillaries: booking.offerSnapshot.ancillaries,
      selectedOfferContext: booking.offerSnapshot.selectedOfferContext,
      skipTicketing: true,
    } as any;

    try {
      const result = await this.bookingWorkflowService.runWorkflow(
        workflowInput,
        false,
      );
      const workflowOk = (result as any)?.ok === true;
      const identifiers = (result as any)?.identifiers ?? {};

      if (!workflowOk || !identifiers.locatorCode) {
        const failedStep = (result as any)?.failedStep ?? 'unknown';
        const failedStepObj = (result as any)?.steps?.find(
          (s: any) => s?.name === failedStep,
        );
        const upstreamMessages = this.extractWorkflowErrorMessages(
          failedStepObj?.errors ?? failedStepObj?.response,
        );
        const message =
          (result as any)?.message ??
          (upstreamMessages.length > 0
            ? `Workflow failed at step: ${failedStep} - ${upstreamMessages.join(' | ')}`
            : `Workflow failed at step: ${failedStep}`);

        this.logger.warn(
          `[createHold] Workflow failed for ${bookingId}: ${message}`,
        );

        // Fall back to pending_payment — payment listener will handle the full flow
        await this.bookingRepo.update(bookingId, {
          status: 'pending_payment',
          message: `Pre-payment hold failed: ${message}. Will confirm after payment.`,
        });

        return { ok: false, message };
      }

      // Hold succeeded — update booking with supplier data
      // Dual windows: the REAL supplier ticketing deadline parsed from the
      // Travelport commit response when present (20-min local enforcement
      // fallback), and any admin-set window (pay-later / bank-transfer).
      // The effective deadline is the earlier of the two.
      const holdExpiryMs = 20 * 60 * 1000; // 20 minutes fallback
      // Supplier deadline precedence: commit-response ticketing deadline,
      // then price-time PaymentTimeLimit, then the local 20-min guard.
      const supplierTicketingDeadline =
        ((identifiers as Record<string, unknown>)
          ?.ticketingDeadline as string | undefined) ??
        ((identifiers as Record<string, unknown>)
          ?.paymentTimeLimit as string | undefined);
      const supplierDeadlineSource =
        ((identifiers as Record<string, unknown>)
          ?.ticketingDeadline as string | undefined)
          ? ((identifiers as Record<string, unknown>)
            ?.ticketingDeadlineSource as string | undefined)
          : ((identifiers as Record<string, unknown>)?.paymentTimeLimit
            ? 'supplier_payment_limit'
            : undefined);
      const supplierDeadline =
        supplierTicketingDeadline && !Number.isNaN(Date.parse(supplierTicketingDeadline))
          ? new Date(supplierTicketingDeadline).toISOString()
          : new Date(Date.now() + holdExpiryMs).toISOString();
      const supplierDeadlineKnown = Boolean(
        supplierTicketingDeadline && !Number.isNaN(Date.parse(supplierTicketingDeadline)),
      );
      const currentHold = await this.bookingRepo.findById(bookingId);
      const adminDeadline = currentHold?.adminHoldExpiresAt ?? undefined;
      const effectiveDeadline =
        adminDeadline && adminDeadline < supplierDeadline ? adminDeadline : supplierDeadline;
      const workflowSteps = ((result as any)?.steps ?? []).map((s: any) => ({
        step: s.name ?? 'unknown',
        status: s.ok === true ? ('success' as const) : ('failed' as const),
        duration: s.durationMs ?? 0,
        error: s.errors?.length
          ? JSON.stringify(s.errors).slice(0, 500)
          : undefined,
      }));

      await this.bookingRepo.transitionStatus(
        bookingId,
        'booking_in_progress',
        'held_pending_payment',
        'Supplier hold created. Awaiting payment to complete ticketing.',
      );
      await this.bookingRepo.update(bookingId, {
        holdExpiresAt: effectiveDeadline,
        supplierHoldExpiresAt: supplierDeadline,
        workbenchId: identifiers.workbenchId,
        reservationId: identifiers.reservationId ?? identifiers.workbenchId,
        locatorCode: identifiers.locatorCode,
        extrasStatus:
          (identifiers.ancillaryFailures ?? 0) > 0 ? 'partial' : undefined,
        workflowSummary: {
          ticketingMode: 'hold_only',
          locatorCode: identifiers.locatorCode,
          holdCreatedAt: new Date().toISOString(),
          holdExpiresAt: effectiveDeadline,
          supplierHoldExpiresAt: supplierDeadline,
          supplierHoldSource: supplierDeadlineKnown
            ? (supplierDeadlineSource ?? 'supplier')
            : 'local_estimate',
          ...(adminDeadline ? { adminHoldExpiresAt: adminDeadline } : {}),
          steps: workflowSteps,
          percent:
            workflowSteps.length > 0
              ? Math.round(
                  (workflowSteps.filter((s: any) => s.status === 'success')
                    .length /
                    workflowSteps.length) *
                    100,
                ) || 0
              : 0,
          createdAt: new Date().toISOString(),
        },
        message:
          'Supplier hold created. Awaiting payment to complete ticketing.',
      });

      this.logger.log(
        `[createHold] Hold created for ${bookingId}: locator=${identifiers.locatorCode}`,
      );

      return {
        ok: true,
        locatorCode: identifiers.locatorCode,
        workbenchId: identifiers.workbenchId,
        reservationId: identifiers.reservationId,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[createHold] Workflow crashed for ${bookingId}: ${msg}`,
      );

      // Fall back to pending_payment
      await this.bookingRepo.update(bookingId, {
        status: 'pending_payment',
        message: `Pre-payment hold error: ${msg}. Will confirm after payment.`,
      });

      return { ok: false, message: msg };
    }
  }

  /**
   * Execute the ticketing workflow on an already-booked reservation.
   * Called by the payment listener after payment succeeds, or manually to issue tickets.
   */
  /**
   * Demo-safe entry point: for Travelport bookings, a genuine supplier
   * failure is faked into a success (with a clearly-marked fake PNR) when
   * the booking's owner is fake-eligible (demo account or guest, in demo
   * mode) and not the real super admin. The real failure is still recorded
   * in workflowSummary.realFailure for audit — only the returned/persisted
   * status and locatorCode are overridden. Non-Travelport bookings and
   * payment failures never go through this override.
   */
  /**
   * Attach a bank-transfer receipt URL (admin verifies in the edit tab,
   * then Issues or Cancels). Receipts are meaningless once ticketed.
   */
  async attachReceipt(
    bookingId: string,
    receiptUrl: string,
    user?: { id?: string; userType?: string },
  ): Promise<{ bookingId: string; receiptUrl: string }> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found.`,
      );
    }
    if (
      booking.userId &&
      (!user?.id || (user.userType === 'CUSTOMER' && booking.userId !== user.id))
    ) {
      throw new BusinessError(
        'AUTH_INSUFFICIENT_PERMISSIONS',
        'You do not have access to this booking.',
        403,
      );
    }
    const status = (booking.status ?? '').toLowerCase();
    if (['ticketed', 'booked', 'cancelled', 'voided', 'refunded'].includes(status)) {
      throw new BusinessError(
        'FLIGHTS_RECEIPT_INVALID_STATE',
        `Receipts cannot be attached in status=${booking.status}.`,
      );
    }
    const payments = await this.paymentRepository.findMany({ bookingId });
    if (!payments.some((p) => String(p.gateway).toUpperCase() === 'BANK_TRANSFER')) {
      throw new BusinessError(
        'FLIGHTS_RECEIPT_INVALID_STATE',
        'Receipts can only be attached to bank transfer bookings.',
      );
    }
    await this.bookingRepo.update(bookingId, {
      receiptUrl,
      message: 'Payment receipt uploaded — awaiting admin verification.',
    });
    return { bookingId, receiptUrl };
  }

  async ticketBooking(
    bookingId: string,
    opts?: { forceTicket?: boolean },
  ): Promise<{
    ok: boolean;
    status?: string;
    locatorCode?: string;
    ticketNumbers?: string[];
    message?: string;
  }> {
    const preBooking = await this.bookingRepo.findById(bookingId);
    if (!preBooking) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found.`,
      );
    }

    if (preBooking.provider !== 'travelport') {
      return this.ticketBookingInternal(bookingId, opts);
    }

    // A booking that was deliberately faked (demo/guest fallback) has no
    // supplier reservation. Never send its fake locator to the supplier again
    // (a retried payment event or an admin "Issue" would fail there and mint a
    // second fake PNR over the first): settle it locally and keep the PNR.
    if (hasFakeBookingFlag(preBooking.workflowSummary)) {
      const nextStatus = opts?.forceTicket ? 'ticketed' : 'held';
      if (preBooking.status !== nextStatus) {
        await this.bookingRepo.update(bookingId, {
          status: nextStatus,
          message: 'Booking confirmed.',
        } as any);
      }
      return {
        ok: true,
        status: nextStatus,
        locatorCode: preBooking.locatorCode,
        message: 'Booking confirmed.',
      };
    }

    let result: {
      ok: boolean;
      status?: string;
      locatorCode?: string;
      ticketNumbers?: string[];
      message?: string;
    };
    let thrown: unknown;
    try {
      result = await this.ticketBookingInternal(bookingId, opts);
    } catch (err: unknown) {
      thrown = err;
      result = {
        ok: false,
        status: 'failed',
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (result.ok) {
      return result;
    }

    const refreshed = await this.bookingRepo.findById(bookingId);
    const currentLocator = refreshed?.locatorCode ?? preBooking.locatorCode;
    // Never overwrite a real locator/PNR that already exists.
    if (currentLocator && !isFakeLocatorCode(currentLocator)) {
      if (thrown) throw thrown;
      return result;
    }

    const eligible = await this.isBookingFakeEligible(refreshed ?? preBooking);
    if (!eligible) {
      if (thrown) throw thrown;
      return result;
    }

    // Money safety: a fake-eligible session may still be a real guest who paid
    // real money (only the 3 seeded demo accounts are guaranteed to be fake
    // charges). Refund any PAID payment now, BEFORE hiding the failure behind
    // a fake success — otherwise the system never learns a refund is owed,
    // since the refund trigger below only fires on failed_supplier_booking
    // and this booking is about to stop looking like one.
    await this.autoRefundFailedBooking(
      bookingId,
      result.message ?? 'Fake booking fallback (demo/guest session).',
    );

    const fakePnr = generateFakePnr('travelport');
    const nextSummary = withFakeBookingAudit(
      (refreshed ?? preBooking).workflowSummary,
      { status: result.status, message: result.message },
    );
    await this.bookingRepo.update(bookingId, {
      status: 'held',
      locatorCode: fakePnr,
      workflowSummary: nextSummary,
      message: 'Booking confirmed.',
    } as any);
    this.logger.warn(
      `[FakeBookingFallback] Booking ${bookingId} — supplier failure faked as success (real: ${result.status ?? 'failed'} — ${result.message ?? 'no message'}), fake PNR ${fakePnr}, any paid payment refunded silently`,
    );
    // The customer never sees this failure, so make sure the real admin does:
    // same provider-failure alert the payment listener raises for real failures.
    try {
      const eventId = randomUUID();
      const alert = {
        bookingId,
        bookingType: 'FLIGHT',
        provider: 'travelport',
        reason: `[Demo fallback — customer saw a fake PNR] ${result.message ?? 'Supplier booking failed.'}`,
        amount: (refreshed ?? preBooking).amount ?? 0,
        currency: (refreshed ?? preBooking).currency ?? 'USD',
      };
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'provider.travelport.failure',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: alert,
      });
    } catch {
      this.logger.warn(
        `[FakeBookingFallback] Could not raise the admin failure alert for ${bookingId}`,
      );
    }
    return { ok: true, status: 'held', locatorCode: fakePnr, message: 'Booking confirmed.' };
  }

  /** Whether a pre-booking caller (no booking row yet) qualifies for fake fallback. */
  private async isCallerFakeEligible(
    userId?: string,
    provider?: string,
  ): Promise<boolean> {
    if (provider === 'travelport') {
      if (!userId) return isTravelportFakeEligible(undefined);
      return this.isBookingFakeEligible({ userId, provider });
    }
    if (!userId) {
      return isFakeEligibleBooking({ userEmail: undefined, isGuest: true });
    }
    return this.isBookingFakeEligible({ userId, provider });
  }

  /**
   * Manual payment methods (bank_transfer / pay_later): no gateway charge.
   * Creates a PENDING payment row + stamps the admin hold window, so the
   * booking waits for admin verify/issue (or the customer paying later)
   * instead of dying at intent creation. The hold-expiry cron treats it
   * like any other unpaid hold.
   */
  private async createManualHoldPayment(input: {
    bookingId: string;
    gateway: PaymentGateway;
    amount: number;
    currency: string;
  }): Promise<{ paymentId: string; reference: string; holdExpiresAt: string }> {
    const summaries = await this.gatewayConfigService
      .getGatewaysSummary()
      .catch(() => []);
    const gw = summaries.find(
      (g) => String(g.gateway).toLowerCase() === String(input.gateway).toLowerCase(),
    );
    if (!gw || !gw.enabled) {
      throw new BusinessError(
        'PAYMENT_GATEWAY_DISABLED',
        `Payment method "${input.gateway}" is not enabled`,
      );
    }
    const windowMinutes =
      (await this.siteSettings
        .get<number>('payLaterWindowMinutes')
        .catch(() => null)) ?? 60;
    const adminDeadline = new Date(
      Date.now() + windowMinutes * 60_000,
    ).toISOString();
    // Effective deadline = earlier of supplier hold and admin window.
    const current = await this.bookingRepo.findById(input.bookingId);
    const supplierDeadline = current?.supplierHoldExpiresAt ?? current?.holdExpiresAt;
    const holdExpiresAt =
      supplierDeadline && supplierDeadline < adminDeadline ? supplierDeadline : adminDeadline;
    // Idempotent: reuse an existing PENDING manual payment for this booking.
    const existing = await this.paymentRepository.findMany({
      bookingId: input.bookingId,
    });
    const active = existing.find(
      (p) =>
        p.status === PaymentStatus.PENDING &&
        String(p.gateway).toUpperCase() === String(input.gateway).toUpperCase(),
    );
    if (active) {
      await this.bookingRepo.update(input.bookingId, {
        holdExpiresAt,
        adminHoldExpiresAt: adminDeadline,
      });
      return {
        paymentId: active.id,
        reference: active.reference,
        holdExpiresAt,
      };
    }
    const idempotencyKey = createHash('sha256')
      .update(`manual-payment:${input.bookingId}:${input.gateway}`)
      .digest('hex')
      .slice(0, 32);
    const payment = new PaymentEntity({
      id: randomUUID(),
      idempotencyKey,
      reference: `PAY-${randomUUID().slice(0, 8).toUpperCase()}`,
      bookingId: input.bookingId,
      bookingType: BookingType.FLIGHT,
      gateway: input.gateway,
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PaymentEntity);
    await this.paymentRepository.create(payment);
    await this.bookingRepo.update(input.bookingId, {
      holdExpiresAt,
      adminHoldExpiresAt: adminDeadline,
    });
    // Invoice now (fire-and-forget): manual bookings never reach the
    // supplier_confirmed event that normally triggers generation, and the
    // success page must show an invoice number immediately.
    this.invoiceService
      .generateForBooking(input.bookingId)
      .catch((e: unknown) =>
        this.logger.warn(
          `[ManualHold] Invoice generation failed for ${input.bookingId}: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    return { paymentId: payment.id, reference: payment.reference, holdExpiresAt };
  }

  /**
   * Whether this booking's owner is eligible for the demo fake-success
   * fallback. Travelport (`provider === 'travelport'`) uses the wider
   * TRAVELPORT_FAKE_BOOKING_ENABLED rule — everyone except the real admin —
   * since real GDS inventory is currently too thin to book reliably for
   * anyone. Every other provider (Duffel, Amadeus, manual) keeps the
   * original demo-list-based rule, unchanged.
   */
  private async isBookingFakeEligible(booking: {
    userId?: string;
    provider?: string;
  }): Promise<boolean> {
    const email = booking.userId
      ? (
          await this.prisma.user.findUnique({
            where: { id: booking.userId },
            select: { email: true },
          })
        )?.email
      : undefined;
    if (booking.provider === 'travelport') {
      return isTravelportFakeEligible(email);
    }
    if (!booking.userId) {
      return isFakeEligibleBooking({ userEmail: undefined, isGuest: true });
    }
    return isFakeEligibleBooking({ userEmail: email, isGuest: false });
  }

  /**
   * Right after a supplier failure the booking briefly sits in a failed status
   * (the real failure is persisted first) until ticketBooking()'s demo
   * fallback settles it as a fake success. The success page polls during that
   * window, sees a terminal failure and stops polling. For fake-eligible
   * Travelport bookings we therefore report "still processing" during a short
   * grace period. Real customers, the real admin and older failures are never
   * masked.
   */
  private async isFakeSettlementPending(booking: {
    provider?: string;
    status: string;
    updatedAt?: string | Date;
    userId?: string;
    workflowSummary?: unknown;
    locatorCode?: string | null;
  }): Promise<boolean> {
    if (booking.provider !== 'travelport') return false;
    if (!['failed', 'failed_supplier_booking'].includes(booking.status)) {
      return false;
    }
    if (isFakeBooking(booking)) return false;
    const age = Date.now() - new Date(booking.updatedAt ?? 0).getTime();
    if (!(age >= 0 && age < FAKE_SETTLEMENT_GRACE_MS)) return false;
    return this.isBookingFakeEligible(booking);
  }

  private async ticketBookingInternal(
    bookingId: string,
    opts?: { forceTicket?: boolean },
  ): Promise<{
    ok: boolean;
    status?: string;
    locatorCode?: string;
    ticketNumbers?: string[];
    message?: string;
  }> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_FOUND',
        `Booking ${bookingId} not found.`,
      );
    }

    // If no held PNR exists yet, create one first by running the full booking workflow
    if (!booking.locatorCode) {
      this.logger.log(
        `No locator for ${bookingId} — confirming/holding PNR before ticketing`,
      );
      let confirmResult: any;
      try {
        confirmResult = await this.confirmById(bookingId);
        this.logger.log(
          `[ticketBooking] confirmById result for ${bookingId}: status=${confirmResult?.status} locatorCode=${confirmResult?.locatorCode ?? '(none)'} message=${confirmResult?.message ?? '(none)'}`,
        );
      } catch (confirmErr: unknown) {
        const msg =
          confirmErr instanceof Error ? confirmErr.message : String(confirmErr);
        this.logger.error(
          `[ticketBooking] confirmById FAILED for ${bookingId}: ${msg}`,
        );
        throw confirmErr;
      }
      // Re-fetch to get the updated locator
      const refreshed = await this.bookingRepo.findById(bookingId);
      if (!refreshed?.locatorCode) {
        return {
          ok: false,
          status: 'failed',
          message: `Failed to create held PNR before ticketing: ${confirmResult.message ?? 'Unknown error'}`,
        };
      }
      // Fall through with refreshed data
      return this.ticketBookingCore(refreshed, opts);
    }

    return this.ticketBookingCore(booking, opts);
  }

  private async ticketBookingCore(
    booking: FlightBookingEntity,
    opts?: { forceTicket?: boolean },
  ): Promise<{
    ok: boolean;
    status?: string;
    locatorCode?: string;
    ticketNumbers?: string[];
    message?: string;
  }> {
    if (booking.status === 'ticketed') {
      return {
        ok: true,
        status: booking.status,
        locatorCode: booking.locatorCode,
        ticketNumbers:
          booking.workflowSummary &&
          typeof booking.workflowSummary === 'object' &&
          'ticketNumbers' in
            (booking.workflowSummary as Record<string, unknown>)
            ? ((booking.workflowSummary as Record<string, unknown>)
                .ticketNumbers as string[])
            : Array.isArray(booking.workflowSummary)
              ? (booking.workflowSummary as string[])
              : undefined,
        message: 'Already ticketed.',
      };
    }

    // Stale processing recovery: if booking has been booking_in_progress for > 10 minutes,
    // mark it as failed so it doesn't get stuck forever.
    // If the status is fresh (< 10 min), the current caller is the legitimate worker
    // (the atomic claim in FlightPaymentListener just transitioned the status), so we
    // proceed with ticketing instead of rejecting.
    if (booking.status === 'booking_in_progress') {
      const staleMs = 10 * 60 * 1000;
      const elapsed = Date.now() - new Date(booking.updatedAt).getTime();
      if (elapsed > staleMs) {
        await this.bookingRepo.update(booking.id, {
          status: 'held',
          message:
            'Booking stuck in processing for over 10 minutes. Marked as failed.',
        });
        return {
          ok: false,
          status: 'held',
          message:
            'Stale processing timeout — booking was stuck in booking_in_progress.',
        };
      }
      // Status is fresh — the caller just claimed it. Fall through to proceed.
      // Transition to 'held' so downstream ticketing logic accepts it.
      await this.bookingRepo.update(booking.id, {
        status: 'held',
        message:
          'Transitioning from booking_in_progress to held for ticketing.',
      });
      // Refresh the local booking reference so subsequent status checks
      // see 'held' instead of the stale 'booking_in_progress'.
      booking = { ...booking, status: 'held' };
    }

    if (booking.status !== 'held' && booking.status !== 'booked') {
      // Manual-issue flow: an admin Issue on a paid-but-unconfirmed hold
      // (toggle OFF) arrives with held_pending_payment/pending_payment.
      // Claim it to held and proceed — same as the fresh booking_in_progress
      // handling above.
      if (
        booking.status === 'held_pending_payment' ||
        booking.status === 'pending_payment'
      ) {
        await this.bookingRepo.update(booking.id, {
          status: 'held',
          message: 'Claimed for manual issue (paid hold).',
        });
        booking = { ...booking, status: 'held' };
      } else {
        throw new BusinessError(
          'FLIGHTS_TICKETING_INVALID_STATUS',
          `Cannot ticket booking with status: ${booking.status}. Expected 'held' or 'booked'.`,
        );
      }
    }

    // Dispatch non-Travelport providers to the booking registry
    if (booking.provider !== 'travelport') {
      return this.ticketNonTravelport(booking);
    }

    // Ticket mode is explicit: ticketBooking() always runs the ticketing
    // workflow. Whether it runs at all is governed by the admin auto-issue
    // toggle (payment listener) or an explicit admin Issue — never by env.
    await this.bookingRepo.transitionStatus(
      booking.id,
      booking.status,
      'booking_in_progress',
      'Ticketing workflow started after payment.',
    );

    try {
      // Phase 7: Build complete workflow input from booking snapshot —
      // includes all supplier identifiers needed for ticketing.
      const workflowInput = {
        from: booking.offerSnapshot?.from ?? '',
        to: booking.offerSnapshot?.to ?? '',
        departureDate: booking.offerSnapshot?.departureDate ?? '',
        tripType: booking.offerSnapshot?.tripType,
        returnDate: booking.offerSnapshot?.returnDate,
        adults: booking.travelerSnapshot?.length || 1,
        gds: '1G',
        traveler: booking.travelerSnapshot?.[0],
        travelers: booking.travelerSnapshot,
        searchKey: booking.offerSnapshot?.searchKey,
        catalogUuid: booking.offerSnapshot?.catalogUuid,
        offerId: booking.offerSnapshot?.offerId,
        offeringId: booking.offerSnapshot?.offerId,
        productId: booking.offerSnapshot?.productId,
        productIds: booking.offerSnapshot?.productIds,
        productSelections: booking.offerSnapshot?.productSelections,
        selectedOfferContext: booking.offerSnapshot?.selectedOfferContext,
        ancillaries: booking.offerSnapshot?.ancillaries,
        seatProductIds: booking.offerSnapshot?.seatProductIds,
        baggageProductIds: booking.offerSnapshot?.baggageProductIds,
      } as any;

      const result = await this.bookingWorkflowService.runTicketingWorkflow(
        booking.locatorCode ?? '',
        workflowInput,
      );

      if (!result.ok) {
        const message =
          result.message ?? `Ticketing failed at step: ${result.failedStep}`;
        // Phase 7: Ticketing failed after payment → mark as needing refund
        await this.bookingRepo.transitionStatus(
          booking.id,
          'booking_in_progress',
          'ticketing_failed_refund_needed',
          message,
        );
        this.logger.error(
          `[ticketBooking] Ticketing failed after payment for ${booking.id}: ${message}. Status set to ticketing_failed_refund_needed.`,
        );
        // Fire refund-needed event for downstream processing
        try {
          await this.outboxWriter.writeSafe({
            eventType: 'booking.ticketing_failed_refund_needed',
            aggregateId: booking.id,
            payload: {
              bookingId: booking.id,
              provider: booking.provider,
              locatorCode: booking.locatorCode,
              message,
            },
          });
        } catch {
          // outbox write is best-effort — log already captured above
        }
        return {
          ok: false,
          status: 'ticketing_failed_refund_needed',
          locatorCode: booking.locatorCode,
          message,
        };
      }

      const ticketNumbers = result.identifiers?.ticketNumbers;
      await this.bookingRepo.transitionStatus(
        booking.id,
        'booking_in_progress',
        'ticketed',
        'Booking ticketed successfully after payment.',
      );
      await this.bookingRepo.update(booking.id, {
        locatorCode: result.identifiers?.locatorCode ?? booking.locatorCode,
        // Merge — never replace (see ticketNonTravelport).
        workflowSummary: {
          ...((booking.workflowSummary ?? {}) as Record<string, unknown>),
          ticketingMode: 'ticket_after_payment',
          locatorCode: result.identifiers?.locatorCode ?? booking.locatorCode,
          ticketNumbers: ticketNumbers ?? [],
          contentSource: (booking.offerSnapshot as Record<string, unknown>)
            ?.contentSource,
        },
      });

      return {
        ok: true,
        status: 'ticketed',
        locatorCode: booking.locatorCode,
        ticketNumbers,
      };
    } catch (error: any) {
      const message =
        error?.message ?? 'Ticketing workflow failed unexpectedly.';
      // Phase 7: Ticketing crashed after payment → mark as needing refund
      await this.bookingRepo.transitionStatus(
        booking.id,
        'booking_in_progress',
        'ticketing_failed_refund_needed',
        message,
      );
      this.logger.error(
        `[ticketBooking] Ticketing crashed after payment for ${booking.id}: ${message}. Status set to ticketing_failed_refund_needed.`,
      );
      try {
        await this.outboxWriter.writeSafe({
          eventType: 'booking.ticketing_failed_refund_needed',
          aggregateId: booking.id,
          payload: {
            bookingId: booking.id,
            provider: booking.provider,
            locatorCode: booking.locatorCode,
            message,
          },
        });
      } catch {
        // outbox write is best-effort
      }
      return {
        ok: false,
        status: 'ticketing_failed_refund_needed',
        locatorCode: booking.locatorCode,
        message,
      };
    }
  }

  async cancelBooking(bookingId: string, reason?: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    // Control surface: agent-owned bookings need agent:cancel_bookings even
    // on the public path (the agent path checks it separately).
    if (booking.userId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: booking.userId },
        select: { userType: true },
      }).catch(() => null);
      if (owner?.userType === 'AGENT') {
        await this.walletService.requireAgentPermission(booking.userId, PermissionCode.AGENT_CANCEL_BOOKINGS);
      }
    }

    const cancellableStatuses = [
      'pending_payment',
      'held_pending_payment',
      'booking_in_progress',
      'booked',
      'held',
      'ticketed',
      // Recovery: bookings stranded in void_requested (pre-fix no-revert bug)
      // must remain cancellable.
      'void_requested',
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_CANCELLABLE',
        `Flight booking cannot be cancelled in status: ${booking.status}.`,
      );
    }

    // Release or refund promo redemption based on payment status
    const wasPaid = await this.paymentRepository
      .findMany({ bookingId })
      .then((payments) =>
        payments.some((p) => p.status === PaymentStatus.PAID),
      );
    if (wasPaid) {
      await this.promoRedemptionService
        .refundByBookingId(bookingId)
        .catch(() => {});
    } else {
      await this.promoRedemptionService
        .releaseByBookingId(bookingId)
        .catch(() => {});
    }

    // Supplier cancel via booking provider adapter (best-effort)
    // Skip provider calls in demo mode: either the blanket ENABLE_DEMO_CANCEL
    // override, or this specific booking carries a fake PNR (see
    // ticketBooking()'s demo/guest fallback) — a fake locator has nothing to
    // cancel at the supplier and would otherwise surface as "offer not
    // available". Mirrors the per-booking check hotels already use.
    const isDemoCancel =
      process.env.ENABLE_DEMO_CANCEL === 'true' || isFakeBooking(booking);
    if (!isDemoCancel && booking.locatorCode) {
      // Travelport: capture the refund quote BEFORE cancelling — Travelport
      // strips pricing/segments from the PNR once cancelled, so the figure has
      // to be persisted while the booking is still live (or "unknown" forever).
      if (booking.provider === 'travelport') {
        try {
          const tpProvider =
            this.bookingProviderRegistry.getProvider('travelport');
          if (tpProvider.quoteRefund) {
            const sum = booking.workflowSummary as
              | Record<string, unknown>
              | undefined;
            const supplierBookingId =
              (sum?.supplierBookingId as string | undefined) ??
              booking.workbenchId ??
              undefined;
            const quote = await tpProvider.quoteRefund({
              bookingId,
              locatorCode: booking.locatorCode,
              supplierBookingId,
              // Channel routing (same precedence as cancelBooking below):
              // NDC pre-quotes must use canceloffer, not GDS cancelitems.
              ...this.resolveTravelportChannel(booking),
            });
            if (quote.ok && quote.refundable && quote.refundAmount != null) {
              const nextSummary = { ...(sum ?? {}) };
              nextSummary.refundQuote = {
                amount: quote.refundAmount,
                currency: quote.refundCurrency ?? booking.currency ?? 'USD',
                quotedAt: new Date().toISOString(),
              };
              await this.bookingRepo
                .update(bookingId, { workflowSummary: nextSummary } as any)
                .catch(() => {});
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `[CANCEL] Travelport refund quote capture failed for ${bookingId}: ${msg}`,
          );
        }
      }
      try {
        const provider = this.bookingProviderRegistry.getProvider(
          booking.provider,
        );
        if (provider.cancelBooking) {
          const summary = booking.workflowSummary as
            | Record<string, unknown>
            | undefined;
          const supplierBookingId =
            (summary?.supplierBookingId as string) ??
            booking.workbenchId ??
            booking.locatorCode;
          await provider.cancelBooking({
            bookingId,
            supplierBookingId,
            locatorCode: booking.locatorCode,
            // Channel routing: NDC bookings must use canceloffer, not the GDS
            // cancelitems endpoint (shared helper, same as pre-cancel quote).
            ...this.resolveTravelportChannel(booking),
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Supplier cancel failed for ${bookingId}: ${msg}. Proceeding with local cancel.`,
        );
      }
    }

    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];

    if (payment) {
      if (payment.status === PaymentStatus.PAID) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.refundPayment) {
          await gateway.refundPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.REFUNDED;
      } else if (payment.status === PaymentStatus.PENDING) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.cancelPayment) {
          await gateway.cancelPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.CANCELLED;
      }
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
    } else {
      // No gateway Payment row → possibly wallet-paid: refund the wallet
      // charge (or release a not-yet-deducted hold). Agent holds untouched
      // (agent cancel path owns those).
      try {
        const refunded = await this.customerWalletService.refundWalletBooking(bookingId);
        if (!refunded) await this.customerWalletService.releaseHoldForBooking(bookingId);
      } catch (err: any) {
        this.logger.warn(`[CANCEL] Customer wallet refund failed for ${bookingId}: ${err?.message ?? err}`);
      }
    }

    await this.bookingRepo.transitionStatus(
      bookingId,
      booking.status,
      'cancelled',
      reason ?? 'Cancelled by user.',
    );

    // Notification: flight booking cancelled
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.cancelled',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason: reason ?? 'Cancelled by user',
          amount: booking.amount,
          currency: booking.currency,
          userId: booking.userId,
        },
      });
      this.notifications
        .notifyDirect({
          idempotencyKey: eventId,
          eventType: 'booking.cancelled',
          aggregateType: 'Booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            bookingType: 'FLIGHT',
            reason: reason ?? 'Cancelled by user',
            amount: booking.amount,
            currency: booking.currency,
            userId: booking.userId,
          },
        })
        .catch(() => {});
    } catch {
      this.logger.warn(`Failed to emit booking.cancelled for ${bookingId}`);
    }

    return {
      bookingId,
      status: 'cancelled',
      paymentStatus: payment?.status ?? null,
    };
  }

  /**
   * Void a ticketed flight booking via the supplier (within airline void window).
   */
  async voidBooking(bookingId: string, reason?: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    // void_requested is accepted as a retry entry: bookings stranded there by
    // the pre-fix no-revert bug must have a way forward (retry void, or
    // cancel — both now revert instead of stranding).
    if (!['ticketed', 'booked', 'void_requested'].includes(booking.status)) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_VOIDABLE',
        `Flight booking cannot be voided in status: ${booking.status}. Only ticketed or booked bookings are voidable.`,
      );
    }

    if (!booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NO_LOCATOR',
        'Booking has no locator code — cannot void.',
      );
    }

    // Transition to void_requested
    await this.bookingRepo.transitionStatus(
      bookingId,
      booking.status,
      'void_requested',
      reason ?? 'Void requested by user.',
    );

    // Call provider void (a fake-PNR booking has no supplier ticket: settle locally)
    try {
      const provider = isFakeBooking(booking)
        ? LOCAL_FAKE_BOOKING_PROVIDER
        : this.bookingProviderRegistry.getProvider(booking.provider);
      if (!provider.voidTicket) {
        // Duffel/Amadeus expose no standalone void API (Duffel voids only
        // as part of confirming an order cancellation) — Cancel covers it.
        throw new BusinessError(
          'FLIGHTS_PROVIDER_NO_VOID',
          `Provider ${booking.provider} does not support ticket void. Use Cancel instead.`,
        );
      }

      const summary = (booking.workflowSummary ?? {}) as Record<string, unknown>;
      const storedTickets = (summary as { ticketNumbers?: unknown })
        .ticketNumbers;
      const result = await provider.voidTicket({
        bookingId,
        locatorCode: booking.locatorCode,
        ticketNumbers: Array.isArray(storedTickets)
          ? (storedTickets as string[])
          : undefined,
      });

      if (result.ok) {
        await this.bookingRepo.transitionStatus(
          bookingId,
          'void_requested',
          'voided',
          result.message ?? 'Ticket voided.',
        );
      } else {
        // Void failed — revert to previous status
        await this.bookingRepo.transitionStatus(
          bookingId,
          'void_requested',
          booking.status,
          `Void failed: ${result.message}`,
        );
        throw new BusinessError(
          'FLIGHTS_VOID_FAILED',
          result.message ?? 'Supplier void failed.',
        );
      }
    } catch (err: unknown) {
      // Always revert: a failed void must never strand the booking in
      // void_requested (a state cancel/void both reject — the booking would
      // be stuck with no way forward). Revert best-effort, then rethrow.
      const msg = err instanceof Error ? err.message : String(err);
      await this.bookingRepo
        .transitionStatus(
          bookingId,
          'void_requested',
          booking.status,
          `Void failed, reverted: ${msg}`,
        )
        .catch(() => {});
      if (err instanceof BusinessError) throw err;
      throw new BusinessError('FLIGHTS_VOID_FAILED', msg);
    }

    // Refund payment
    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];
    if (payment?.status === PaymentStatus.PAID) {
      const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
      if (gateway.refundPayment) {
        await gateway.refundPayment(payment.providerPaymentId!);
        payment.status = PaymentStatus.REFUNDED;
        payment.updatedAt = new Date();
        await this.paymentRepository.update(payment);
      }
    } else if (!payment) {
      // No gateway Payment row → possibly wallet-paid: refund to wallet.
      try {
        await this.customerWalletService.refundWalletBooking(bookingId);
      } catch (err: any) {
        this.logger.warn(`[VOID] Customer wallet refund failed for ${bookingId}: ${err?.message ?? err}`);
      }
    }

    // Release promo redemption
    await this.promoRedemptionService
      .refundByBookingId(bookingId)
      .catch(() => {});

    // Notification
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.voided',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason: reason ?? 'Voided by user',
          userId: booking.userId,
        },
      });
      this.notifications
        .notifyDirect({
          idempotencyKey: eventId,
          eventType: 'booking.voided',
          aggregateType: 'Booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            bookingType: 'FLIGHT',
            reason: reason ?? 'Voided by user',
            userId: booking.userId,
          },
        })
        .catch(() => {});
    } catch {
      this.logger.warn(`Failed to emit booking.voided for ${bookingId}`);
    }

    return { bookingId, status: 'voided' };
  }

  /**
   * Request a refund for a flight booking.
   */
  async requestRefund(bookingId: string, reason?: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    if (!['ticketed', 'booked'].includes(booking.status)) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NOT_REFUNDABLE',
        `Flight booking cannot be refunded in status: ${booking.status}. Only ticketed or booked bookings are refundable.`,
      );
    }

    if (!booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NO_LOCATOR',
        'Booking has no locator code — cannot request refund.',
      );
    }

    // Transition to refund_requested
    await this.bookingRepo.transitionStatus(
      bookingId,
      booking.status,
      'refund_requested',
      reason ?? 'Refund requested by user.',
    );

    // Call provider refund (a fake-PNR booking has no supplier order: settle locally)
    try {
      const provider = isFakeBooking(booking)
        ? LOCAL_FAKE_BOOKING_PROVIDER
        : this.bookingProviderRegistry.getProvider(booking.provider);
      if (!provider.requestRefund) {
        throw new BusinessError(
          'FLIGHTS_PROVIDER_NO_REFUND',
          `Provider ${booking.provider} does not support refund requests.`,
        );
      }

      const result = await provider.requestRefund({
        bookingId,
        locatorCode: booking.locatorCode,
        supplierBookingId: this.resolveSupplierBookingId(booking),
      });

      if (result.ok) {
        await this.bookingRepo.transitionStatus(
          bookingId,
          'refund_requested',
          'refund_pending',
          result.message ?? 'Refund requested.',
        );
      } else {
        await this.bookingRepo.transitionStatus(
          bookingId,
          'refund_requested',
          booking.status,
          `Refund failed: ${result.message}`,
        );
        throw new BusinessError(
          'FLIGHTS_REFUND_FAILED',
          result.message ?? 'Supplier refund request failed.',
        );
      }
    } catch (err: unknown) {
      if (err instanceof BusinessError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await this.bookingRepo
        .transitionStatus(
          bookingId,
          'refund_requested',
          booking.status,
          `Refund error: ${msg}`,
        )
        .catch(() => {});
      throw new BusinessError('FLIGHTS_REFUND_FAILED', msg);
    }

    // Notification
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.refund_requested',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'FLIGHT',
          reason: reason ?? 'Refund requested',
          userId: booking.userId,
        },
      });
      this.notifications
        .notifyDirect({
          idempotencyKey: eventId,
          eventType: 'booking.refund_requested',
          aggregateType: 'Booking',
          aggregateId: bookingId,
          payload: {
            bookingId,
            bookingType: 'FLIGHT',
            reason: reason ?? 'Refund requested',
            userId: booking.userId,
          },
        })
        .catch(() => {});
    } catch {
      this.logger.warn(
        `Failed to emit booking.refund_requested for ${bookingId}`,
      );
    }

    return { bookingId, status: 'refund_pending' };
  }

  /**
   * Quote refund eligibility for a flight booking.
   */
  async quoteRefund(bookingId: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('FLIGHTS_BOOKING_NOT_FOUND');

    if (!booking.locatorCode) {
      throw new BusinessError(
        'FLIGHTS_BOOKING_NO_LOCATOR',
        'Booking has no locator code — cannot quote refund.',
      );
    }

    if (isFakeBooking(booking)) {
      // No supplier reservation exists — answer from the stored fare rules.
      const stored = (booking.offerSnapshot as Record<string, any> | undefined)
        ?.display?.refundPolicy as { allowed?: boolean } | undefined;
      return {
        ok: true,
        refundable: stored?.allowed !== false,
        refundCurrency: booking.currency ?? undefined,
        message:
          'Demo booking: no supplier quote is available. The stored fare conditions apply.',
      };
    }

    const provider = this.bookingProviderRegistry.getProvider(booking.provider);
    if (!provider.quoteRefund) {
      throw new BusinessError(
        'FLIGHTS_PROVIDER_NO_REFUND_QUOTE',
        `Provider ${booking.provider} does not support refund quotes.`,
      );
    }

    return provider.quoteRefund({
      bookingId,
      locatorCode: booking.locatorCode,
      supplierBookingId: this.resolveSupplierBookingId(booking),
      // Channel routing: NDC quotes must use canceloffer, not GDS cancelitems.
      ...this.resolveTravelportChannel(booking),
    });
  }

  /**
   * Channel routing for Travelport post-booking ops: NDC bookings must use
   * canceloffer, GDS bookings cancelitems. Precedence: snapshot top level
   * (stored at creation) -> selectedOfferContext -> workflowSummary
   * (stored at ticketing).
   */
  private resolveTravelportChannel(booking: {
    offerSnapshot?: unknown;
    workflowSummary?: unknown;
  }): { contentSource?: string; offerIdentifier?: string } {
    const snapshot = booking.offerSnapshot as
      | Record<string, unknown>
      | undefined;
    const snapshotCtx = snapshot?.selectedOfferContext as
      | Record<string, unknown>
      | undefined;
    const summary = booking.workflowSummary as
      | Record<string, unknown>
      | undefined;
    const offeringIds = snapshotCtx?.offeringIds;
    return {
      contentSource:
        (snapshot?.contentSource as string | undefined) ??
        (snapshotCtx?.contentSource as string | undefined) ??
        (summary?.contentSource as string | undefined),
      offerIdentifier:
        (snapshot?.offerIdentifier as string | undefined) ??
        (Array.isArray(offeringIds)
          ? (offeringIds as string[])[0]
          : undefined),
    };
  }

  /**
   * Resolve the supplier order id (e.g. Duffel order.id) from the booking's
   * workflowSummary when present.
   */
  private resolveSupplierBookingId(booking: {
    workflowSummary?: unknown;
    workbenchId?: string | null;
  }): string | undefined {
    const summary = booking.workflowSummary as
      | Record<string, unknown>
      | undefined;
    return (
      (summary?.supplierBookingId as string | undefined) ??
      booking.workbenchId ??
      undefined
    );
  }

  /**
   * Ticket a non-Travelport booking through the booking provider registry.
   */
  private async ticketNonTravelport(booking: FlightBookingEntity): Promise<{
    ok: boolean;
    status?: string;
    locatorCode?: string;
    ticketNumbers?: string[];
    message?: string;
  }> {
    if (!booking.locatorCode) {
      return {
        ok: false,
        status: 'failed',
        message: `Booking ${booking.id} has no locator code — cannot ticket.`,
      };
    }

    // Claim booking_in_progress to prevent race conditions, matching the Travelport path
    await this.bookingRepo.update(booking.id, {
      status: 'booking_in_progress',
      message: 'Ticketing workflow started (non-Travelport).',
    });

    try {
      const provider = this.bookingProviderRegistry.getProvider(
        booking.provider,
      );
      if (!provider.ticketBooking) {
        return {
          ok: false,
          locatorCode: booking.locatorCode,
          message: `Provider ${booking.provider} does not support ticketing.`,
        };
      }
      const input = this.buildBookingProviderInput(booking);
      const result = await provider.ticketBooking(booking.locatorCode, input);

      if (!result.ok) {
        await this.bookingRepo.update(booking.id, {
          status: 'failed_supplier_booking',
          message: result.message ?? 'Ticketing failed.',
        });
        await this.autoRefundFailedBooking(
          booking.id,
          result.message ?? 'Ticketing failed.',
        );
        return {
          ok: false,
          status: 'failed_supplier_booking',
          message: result.message,
        };
      }

      await this.bookingRepo.update(booking.id, {
        status: 'ticketed',
        locatorCode: result.locatorCode ?? booking.locatorCode,
        // Merge — never replace. confirm() stored supplierBookingId (Duffel
        // order id / Amadeus order id) here; replacing it breaks admin
        // cancel/retrieve and the fare-policy readers.
        workflowSummary: {
          ...((booking.workflowSummary ?? {}) as Record<string, unknown>),
          ticketingMode: 'ticket_after_payment',
          locatorCode: result.locatorCode ?? booking.locatorCode,
          ticketNumbers: result.ticketNumbers ?? [],
        },
        message: 'Booking ticketed successfully.',
      });

      return {
        ok: true,
        status: 'ticketed',
        locatorCode: booking.locatorCode,
        ticketNumbers: result.ticketNumbers,
      };
    } catch (error: any) {
      const message = error?.message ?? 'Ticketing failed unexpectedly.';
      await this.bookingRepo.update(booking.id, {
        status: 'failed_supplier_booking',
        message,
      });
      await this.autoRefundFailedBooking(booking.id, message);
      return { ok: false, status: 'failed_supplier_booking', message };
    }
  }

  async getOfferDetail(offerId: string, _searchKey?: string) {
    return {
      offerId,
      detailAvailable: false,
      message:
        'Offer detail lookup from cached search results is no longer available. Please include offer details from the search response.',
    };
  }

  async getOfferDetailView(
    input: {
      offerId: string;
      searchKey?: string;
      provider: 'duffel' | 'travelport' | 'amadeus' | 'manual';
      catalogUuid?: string;
      offerData?: Record<string, any>;
    },
    mapper: import('../services/flight-offer-detail-view.mapper').FlightOfferDetailViewMapper,
  ) {
    const { offerId, searchKey, provider, catalogUuid, offerData } = input;

    let normalizedOffer:
      | import('../../domain/entities/flight-search-response').NormalizedFlightOffer
      | undefined;

    if (offerData) {
      const segments = Array.isArray(offerData.segments)
        ? offerData.segments.map((s: any, i: number) => ({
            id: s.id ?? `seg_${i}`,
            carrier: s.marketingCarrier ?? s.carrier,
            flightNumber: s.flightNumber,
            operatingCarrier: s.operatingCarrier,
            operatingCarrierName:
              s.operatingCarrier?.name ?? s.operatingAirlineName,
            equipment: s.aircraft?.iata_code ?? s.aircraftCode,
            duration: s.duration,
            stops: s.stops ?? 0,
            departure: {
              airport: s.from ?? s.departure?.airport ?? s.origin?.iata_code,
              date: s.departureAt
                ? s.departureAt.split('T')[0]
                : s.departure?.date,
              time: s.departureAt
                ? s.departureAt.split('T')[1]?.replace('Z', '')
                : s.departure?.time,
              terminal: s.origin?.terminal ?? s.departure?.terminal,
            },
            arrival: {
              airport: s.to ?? s.arrival?.airport ?? s.destination?.iata_code,
              date: s.arrivalAt ? s.arrivalAt.split('T')[0] : s.arrival?.date,
              time: s.arrivalAt
                ? s.arrivalAt.split('T')[1]?.replace('Z', '')
                : s.arrival?.time,
              terminal: s.destination?.terminal ?? s.arrival?.terminal,
            },
            display: s.display,
          }))
        : [];

      normalizedOffer = {
        id: offerId,
        provider,
        price: {
          currency: offerData.price?.currency ?? offerData.currency ?? 'USD',
          base: Number(offerData.price?.base ?? offerData.baseAmount ?? 0),
          taxes: Number(offerData.price?.taxes ?? offerData.taxAmount ?? 0),
          total: Number(
            offerData.price?.total ??
              offerData.totalPrice ??
              offerData.totalAmount ??
              0,
          ),
        },
        cabin: offerData.cabin,
        classOfService: offerData.classOfService,
        fareBasisCode: offerData.fareBasisCode,
        totalDuration: offerData.totalDuration,
        stops:
          typeof offerData.stops === 'number'
            ? offerData.stops
            : segments.length > 0
              ? segments.length - 1
              : 0,
        segments,
        brand: offerData.brandName
          ? { id: '', name: offerData.brandName }
          : undefined,
        baggage: offerData.baggage
          ? typeof offerData.baggage === 'object' &&
            'checked' in offerData.baggage
            ? {
                carryOn: { quantity: 1, text: 'Carry-on included' },
                checked: { quantity: 1, text: offerData.baggage.checked },
              }
            : undefined
          : undefined,
        display: offerData.display ?? {
          airlineCode: offerData.airlineCode ?? segments[0]?.carrier,
          airlineName: offerData.airlineName,
          airlineLogoUrl: offerData.airlineLogoUrl,
          flightNumber: segments[0]?.flightNumber,
          origin: {
            code: segments[0]?.departure?.airport ?? '',
            label: segments[0]?.departure?.airport ?? '',
          },
          destination: {
            code: segments[segments.length - 1]?.arrival?.airport ?? '',
            label: segments[segments.length - 1]?.arrival?.airport ?? '',
          },
          durationLabel: offerData.durationLabel,
          stopsLabel: offerData.stopsLabel,
          fareBrand: offerData.brandName,
          cabinLabel: offerData.cabinLabel ?? offerData.cabin,
          supplier: provider === 'travelport' ? 'travelport' : 'duffel',
        },
        metadata: {
          offeringId: offerData.offerId ?? offerId,
          providerCatalogUuid: catalogUuid,
          productRef: offerData.productId,
          productRefs: offerData.productIds,
          productSelections: offerData.productSelections,
          offeringIdentifierValue: offerData.offeringIdentifierValue,
          brandOfferingId: offerData.brandOfferingId,
        },
      };
    }

    if (!normalizedOffer) {
      return {
        offerId,
        detailAvailable: false,
        message:
          'No offer data provided. Include offerData from the search response.',
      };
    }

    let selectedOfferContext:
      | import('../../domain/entities/flight-search-response').SelectedOfferCacheEntry
      | null = null;
    if (provider === 'travelport' && searchKey) {
      try {
        selectedOfferContext = await this.selectedOfferCache.retrieve(
          searchKey,
          offerId,
        );
      } catch {
        this.logger.warn(
          `[OFFER_DETAIL] Could not load cached context for ${searchKey}:${offerId}`,
        );
      }
    }

    let rawOffer: any = undefined;
    if (provider === 'duffel') {
      rawOffer = offerData?.rawOffer ?? offerData;
    }

    const detail = await mapper.toDetailView({
      provider,
      normalizedOffer,
      rawOffer,
      selectedOfferContext: selectedOfferContext ?? undefined,
      searchKey,
      catalogUuid,
    });

    return { offerId, detailAvailable: true, detailView: detail };
  }

  /**
   * Return enriched flight booking details for the booking-details page.
   *
   * The frontend sends the full offerData from its search cache. The backend
   * applies markup, computes the final price, and returns everything the
   * details page needs in a single response.
   */
  async getBookingDetails(input: {
    offerId: string;
    searchKey?: string;
    offerData?: Record<string, any>;
    travelers?: Array<{
      givenName: string;
      surname: string;
      passengerTypeCode?: string;
      email?: string;
    }>;
  }) {
    const { offerId, offerData, travelers } = input;

    if (!offerData) {
      return {
        offerId,
        detailAvailable: false,
        message:
          'No offer data provided. Include offerData from the search response.',
      };
    }

    // Apply markup to get the customer-facing price
    let markupResult: { markedUpAmount: number; markupAmount: number } | null =
      null;
    try {
      const baseAmount =
        offerData.totalPrice ?? offerData.totalAmount ?? offerData.amount ?? 0;
      const currency = offerData.currency ?? 'USD';
      if (baseAmount > 0) {
        const markup = await this.markupService.calculatePrice(
          baseAmount,
          'flights',
        );
        markupResult = {
          markedUpAmount: markup.finalPrice ?? baseAmount,
          markupAmount: markup.finalPrice - baseAmount,
        };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[BOOKING_DETAILS] Markup calculation failed: ${msg}`);
    }

    return {
      offerId,
      detailAvailable: true,
      offer: offerData,
      pricing: markupResult
        ? {
            baseAmount:
              offerData.totalPrice ?? offerData.totalAmount ?? offerData.amount,
            markupAmount: markupResult.markupAmount,
            totalAmount: markupResult.markedUpAmount,
            currency: offerData.currency ?? 'USD',
          }
        : {
            baseAmount:
              offerData.totalPrice ?? offerData.totalAmount ?? offerData.amount,
            markupAmount: 0,
            totalAmount:
              offerData.totalPrice ?? offerData.totalAmount ?? offerData.amount,
            currency: offerData.currency ?? 'USD',
          },
      travelers: travelers ?? offerData.travelers ?? [],
      searchKey: input.searchKey ?? offerData.searchKey ?? null,
    };
  }

  /**
   * Normalize legacy ancillary product IDs and/or unified ancillary selections
   * into a single structured format for storage and workflow.
   */
  private normalizeAncillaryInput(input: BookingPreviewDto):
    | {
        seats: Array<{
          type: 'seat';
          travelerIndex: number;
          travelerRef: string;
          segmentRef: string;
          seatNumber: string;
          ancillaryProductId: string;
          catalogOfferingsIdentifier?: string;
          catalogOfferingIdentifierValue?: string;
          price: { amount: number; currency: string };
        }>;
        baggage: Array<{
          type: 'baggage';
          travelerIndex: number;
          travelerRef: string;
          segmentRef: string;
          ancillaryProductId: string;
          label: string;
          baggageType: string;
          weight: string;
          pieces: number;
          price: { amount: number; currency: string };
        }>;
        meals: Array<{
          type: 'meal';
          travelerIndex: number;
          travelerRef: string;
          segmentRef: string;
          ancillaryProductId: string;
          mealCode: string;
          mealName: string;
          dietaryType: string;
          price: { amount: number; currency: string };
        }>;
        services: Array<{
          type:
            | 'sports_equipment'
            | 'priority'
            | 'lounge'
            | 'wifi'
            | 'pet'
            | 'other';
          travelerIndex: number;
          travelerRef: string;
          segmentRef: string;
          ancillaryProductId: string;
          catalogOfferingIdentifier?: string;
          catalogOfferingsIdentifier?: string;
          label: string;
          serviceType: string;
          quantity: number;
          price: { amount: number; currency: string };
        }>;
      }
    | undefined {
    // If unified ancillaries are provided, use them directly
    if (input.ancillaries) {
      return input.ancillaries;
    }

    // If only legacy seatProductIds/baggageProductIds are provided, create structured entries
    const hasLegacySeats =
      Array.isArray(input.seatProductIds) && input.seatProductIds.length > 0;
    const hasLegacyBaggage =
      Array.isArray(input.baggageProductIds) &&
      input.baggageProductIds.length > 0;
    // Meal ids are per-traveler `meal:<urlencoded JSON>` strings (position =
    // travelerIndex); service ids are `service:<urlencoded JSON>`.
    const decodePrefixed = (value: string, prefix: string): any | undefined => {
      if (typeof value !== 'string' || !value.startsWith(prefix)) {
        return undefined;
      }
      try {
        return JSON.parse(decodeURIComponent(value.slice(prefix.length)));
      } catch {
        return undefined;
      }
    };
    const parsePriceText = (
      text: unknown,
    ): { amount: number; currency: string } => {
      const m =
        typeof text === 'string' ? text.match(/^([\d.]+)\s*([A-Za-z]+)$/) : null;
      return m
        ? { amount: parseFloat(m[1]), currency: m[2] }
        : { amount: 0, currency: 'USD' };
    };
    const rawMeals = Array.isArray(input.mealSelectionIds)
      ? input.mealSelectionIds
      : [];
    const rawServices = Array.isArray(input.serviceProductIds)
      ? input.serviceProductIds
      : [];
    const hasMeals = rawMeals.some((m) => !!m);
    const hasServices = rawServices.some((s) => !!s);

    if (!hasLegacySeats && !hasLegacyBaggage && !hasMeals && !hasServices) {
      return undefined;
    }

    const seats: SeatSelection[] = [];
    const baggage: BaggageSelection[] = [];

    // Convert legacy seat product IDs to structured format.
    // Ids are `seat:<urlencoded JSON>` ({seat, priceText, ...}) — decode so
    // stored seatNumber/price render human-readable everywhere downstream.
    if (hasLegacySeats) {
      for (let i = 0; i < input.seatProductIds!.length; i++) {
        const raw = input.seatProductIds![i];
        const decoded = decodePrefixed(raw, 'seat:');
        const travelerIndex =
          typeof decoded?.passengerIndex === 'number'
            ? decoded.passengerIndex
            : i;
        seats.push({
          type: 'seat' as const,
          travelerIndex,
          travelerRef: `travelerRefId_${travelerIndex + 1}`,
          segmentRef: String(decoded?.segmentId ?? 'segment_1'),
          seatNumber: String(decoded?.seat ?? raw),
          ancillaryProductId: String(
            decoded?.ancillaryProductId ?? decoded?.seat ?? raw,
          ),
          price: parsePriceText(decoded?.priceText),
        });
      }
    }

    // Convert legacy baggage product IDs to structured format.
    // Ids are `baggage:<urlencoded JSON>` — decode label/price when present.
    if (hasLegacyBaggage) {
      for (const id of input.baggageProductIds!) {
        const decoded = decodePrefixed(id, 'baggage:');
        baggage.push({
          type: 'baggage' as const,
          travelerIndex: 0,
          travelerRef: 'travelerRefId_1',
          segmentRef: 'segment_1',
          ancillaryProductId: String(decoded?.productId ?? id),
          label: String(
            decoded?.label ?? decoded?.name ?? 'Checked Baggage',
          ),
          baggageType: 'Checked',
          weight: String(decoded?.weight ?? '23kg'),
          pieces: typeof decoded?.pieces === 'number' ? decoded.pieces : 1,
          price: parsePriceText(decoded?.priceText),
        });
      }
    }

    return {
      seats: seats.length > 0 ? seats : [],
      baggage: baggage.length > 0 ? baggage : [],
      meals: rawMeals.flatMap((raw, travelerIndex) => {
        if (!raw) return [];
        const decoded = decodePrefixed(raw, 'meal:');
        if (!decoded?.mealCode) return [];
        return [
          {
            type: 'meal' as const,
            travelerIndex,
            travelerRef: `travelerRefId_${travelerIndex + 1}`,
            segmentRef: 'segment_1',
            ancillaryProductId: String(
              decoded.productId ?? decoded.mealCode,
            ),
            mealCode: String(decoded.mealCode),
            mealName: String(decoded.mealName ?? decoded.mealCode),
            dietaryType: String(decoded.dietaryType ?? ''),
            price: parsePriceText(decoded.priceText),
          },
        ];
      }),
      services: rawServices.flatMap((raw) => {
        if (!raw) return [];
        const decoded = decodePrefixed(raw, 'service:');
        if (!decoded?.productId) return [];
        const allowed = [
          'sports_equipment',
          'priority',
          'lounge',
          'wifi',
          'pet',
          'other',
        ] as const;
        const type = allowed.includes(decoded.serviceType)
          ? decoded.serviceType
          : 'other';
        const travelerIndex =
          typeof decoded.travelerIndex === 'number'
            ? decoded.travelerIndex
            : 0;
        return [
          {
            type,
            travelerIndex,
            travelerRef: `travelerRefId_${travelerIndex + 1}`,
            segmentRef: String(decoded.segmentRef ?? 'segment_1'),
            ancillaryProductId: String(decoded.productId),
            catalogOfferingIdentifier: decoded.catalogOfferingIdentifier,
            catalogOfferingsIdentifier: decoded.catalogOfferingsIdentifier,
            label: String(decoded.label ?? decoded.productId),
            serviceType: String(decoded.serviceType ?? 'other'),
            quantity: 1,
            price: parsePriceText(decoded.priceText),
          },
        ];
      }),
    };
  }

  /**
   * Extract the total ancillary price from a Travelport `buildancillaryoffersfromcatalogofferings`
   * response. Navigates the response to find all priced products and sums their prices.
   */
  private extractAncillaryTotalPrice(response: unknown): {
    seatTotal: number;
    baggageTotal: number;
    mealTotal: number;
    serviceTotal: number;
  } | null {
    let seatTotal = 0;
    let baggageTotal = 0;
    let mealTotal = 0;
    let serviceTotal = 0;

    // Track processed product IDs to avoid double-counting
    const seenIds = new Set<string>();

    const queue: unknown[] = [response];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;

      // Deduplicate by product id
      const productId =
        (record.id as string | undefined) ??
        (record.productRef as string | undefined);
      if (productId && seenIds.has(productId)) continue;
      if (productId) seenIds.add(productId);

      // Check for a Product with pricing information
      const productType = record['@type'] as string | undefined;
      const isSeat =
        productType?.includes('Seat') ||
        record.seatNumber !== undefined ||
        record.SeatNumber !== undefined;
      const isBaggage =
        productType?.includes('Baggage') || record.baggageType !== undefined;
      const isMeal =
        productType?.includes('Meal') || record.SSRCode !== undefined;
      const isService =
        !isSeat &&
        !isBaggage &&
        !isMeal &&
        (productType?.includes('Service') ||
          productType?.includes('Ancillary'));

      if (isSeat || isBaggage || isMeal || isService) {
        // Try TotalPrice first, then totalPrice, then Total, then value
        const priceVal =
          (record.TotalPrice as number | undefined) ??
          (record.totalPrice as number | undefined) ??
          (record.Total as number | undefined) ??
          (record.value as number | undefined);

        if (typeof priceVal === 'number') {
          if (isSeat) seatTotal += priceVal;
          else if (isBaggage) baggageTotal += priceVal;
          else if (isMeal) mealTotal += priceVal;
          else if (isService) serviceTotal += priceVal;
          continue; // Don't also recurse into this product's sub-objects
        }

        // Check nested Price object
        const priceObj = record.Price as Record<string, unknown> | undefined;
        if (priceObj) {
          const nestedAmount =
            (priceObj.TotalPrice as number | undefined) ??
            (priceObj.totalPrice as number | undefined) ??
            (priceObj.totalAmount as number | undefined) ??
            (priceObj.TotalAmount as number | undefined) ??
            (priceObj.value as number | undefined);
          if (typeof nestedAmount === 'number') {
            if (isSeat) seatTotal += nestedAmount;
            else if (isBaggage) baggageTotal += nestedAmount;
            else if (isMeal) mealTotal += nestedAmount;
            else if (isService) serviceTotal += nestedAmount;
            continue;
          }
        }
      }

      // Only recurse into structured arrays, not all values (avoids double-counting)
      const ancillaryOffering = record.AncillaryOffering as
        | unknown[]
        | undefined;
      if (ancillaryOffering) queue.push(...ancillaryOffering);

      const products = record.Product as unknown[] | undefined;
      if (products) queue.push(...products);

      const ancillaryOfferings = record.AncillaryOfferings as
        | Record<string, unknown>
        | undefined;
      if (ancillaryOfferings?.AncillaryOffering) {
        queue.push(...(ancillaryOfferings.AncillaryOffering as unknown[]));
      }
    }

    if (
      seatTotal === 0 &&
      baggageTotal === 0 &&
      mealTotal === 0 &&
      serviceTotal === 0
    )
      return null;
    return { seatTotal, baggageTotal, mealTotal, serviceTotal };
  }

  /**
   * Phase 7 — Fresh repricing for selected ancillaries.
   *
   * Calls Travelport's ancillary price endpoint for the selected seat/baggage/meal
   * product IDs and compares the returned prices with the user-submitted prices.
   *
   * @param catalogUuid - Catalog UUID from the search response, needed to construct the price request
   * @returns Fresh ancillary price breakdown with verification status, or null if unavailable
   */
  private async repriceAncillaries(
    searchKey: string | undefined,
    offerId: string | undefined,
    catalogUuid: string | undefined,
    mainProductIds: string[],
    ancillaries: {
      seats: Array<{
        type: 'seat';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        seatNumber: string;
        ancillaryProductId: string;
        price: { amount: number; currency: string };
      }>;
      baggage: Array<{
        type: 'baggage';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        label: string;
        baggageType: string;
        weight: string;
        pieces: number;
        price: { amount: number; currency: string };
      }>;
      meals: Array<{
        type: 'meal';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        mealCode: string;
        mealName: string;
        dietaryType: string;
        price: { amount: number; currency: string };
      }>;
      services: Array<{
        type:
          | 'sports_equipment'
          | 'priority'
          | 'lounge'
          | 'wifi'
          | 'pet'
          | 'other';
        travelerIndex: number;
        travelerRef: string;
        segmentRef: string;
        ancillaryProductId: string;
        catalogOfferingIdentifier?: string;
        catalogOfferingsIdentifier?: string;
        label: string;
        serviceType: string;
        quantity: number;
        price: { amount: number; currency: string };
      }>;
    },
    travelerCount: number,
  ): Promise<{
    seatTotal: number;
    baggageTotal: number;
    mealTotal: number;
    serviceTotal: number;
    verified: boolean;
    individualBaggagePrices?: number[];
  } | null> {
    // Collect all ancillary product IDs for a single price request
    const seatIds = ancillaries.seats
      .map((s) => s.ancillaryProductId)
      .filter(Boolean);
    const baggageIds = ancillaries.baggage
      .map((b) => b.ancillaryProductId)
      .filter(Boolean);
    const serviceIds = ancillaries.services
      .map((s) => s.ancillaryProductId)
      .filter(Boolean);
    const allIds = [...seatIds, ...baggageIds, ...serviceIds];

    if (allIds.length === 0) {
      // Meals have $0 cost (SSR) — no repricing needed, return submitted prices as verified
      return {
        seatTotal: ancillaries.seats.reduce(
          (sum, s) => sum + (s.price?.amount ?? 0),
          0,
        ),
        baggageTotal: ancillaries.baggage.reduce(
          (sum, b) => sum + (b.price?.amount ?? 0),
          0,
        ),
        mealTotal: 0,
        serviceTotal: ancillaries.services.reduce(
          (sum, s) => sum + (s.price?.amount ?? 0),
          0,
        ),
        verified: true,
      };
    }

    if (!searchKey || !offerId || !catalogUuid) {
      this.logger.warn(
        'Cannot reprice ancillaries: missing searchKey, offerId, or catalogUuid',
      );
      return null;
    }

    try {
      const offeringId = offerId;

      const pricePayload = {
        catalogUuid,
        offeringId,
        offerId,
        searchKey,
        productIds: mainProductIds,
        seatProductIds: seatIds,
        baggageProductIds: baggageIds,
        travelerCount,
      };

      const priceResponse =
        await this.ancillaryService.ancillaryPrice(pricePayload);

      // Parse the response to extract prices
      const extracted = this.extractAncillaryTotalPrice(priceResponse);
      if (!extracted) {
        this.logger.warn(
          'Could not extract ancillary prices from Travelport response — using submitted prices unverified',
        );
        // Return submitted prices as unverified instead of null.
        // The booking should not stall because Travelport's ancillary price
        // endpoint is unavailable or returned an error (e.g. 4374).
        return {
          seatTotal: ancillaries.seats.reduce(
            (sum, s) => sum + (s.price?.amount ?? 0),
            0,
          ),
          baggageTotal: ancillaries.baggage.reduce(
            (sum, b) => sum + (b.price?.amount ?? 0),
            0,
          ),
          mealTotal:
            ancillaries.meals?.reduce(
              (sum, m) => sum + (m.price?.amount ?? 0),
              0,
            ) ?? 0,
          serviceTotal:
            ancillaries.services?.reduce(
              (sum, s) => sum + (s.price?.amount ?? 0),
              0,
            ) ?? 0,
          verified: false,
        };
      }

      // Compare submitted vs. fresh prices for tolerance check
      const submittedSeatTotal = ancillaries.seats.reduce(
        (sum, s) => sum + (s.price?.amount ?? 0),
        0,
      );
      const submittedBaggageTotal = ancillaries.baggage.reduce(
        (sum, b) => sum + (b.price?.amount ?? 0),
        0,
      );
      const tolerance =
        this.configService.travelport.ancillaryPriceTolerance ?? 0.03;

      let verified = true;
      const priceDiffs: string[] = [];

      if (submittedSeatTotal > 0 && extracted.seatTotal > 0) {
        const seatDiff =
          Math.abs(extracted.seatTotal - submittedSeatTotal) /
          submittedSeatTotal;
        if (seatDiff > tolerance) {
          verified = false;
          priceDiffs.push(
            `seats: submitted=${submittedSeatTotal} fresh=${extracted.seatTotal} change=${+(seatDiff * 100).toFixed(1)}%`,
          );
        }
      }

      if (submittedBaggageTotal > 0 && extracted.baggageTotal > 0) {
        const baggageDiff =
          Math.abs(extracted.baggageTotal - submittedBaggageTotal) /
          submittedBaggageTotal;
        if (baggageDiff > tolerance) {
          verified = false;
          priceDiffs.push(
            `baggage: submitted=${submittedBaggageTotal} fresh=${extracted.baggageTotal} change=${+(baggageDiff * 100).toFixed(1)}%`,
          );
        }
      }

      if (!verified) {
        this.logger.warn(
          `Ancillary price verification failed: ${priceDiffs.join('; ')} (tolerance=${+(tolerance * 100).toFixed(1)}%)`,
        );
      } else if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
        this.logger.log(
          `Ancillary prices verified: seats=${extracted.seatTotal} baggage=${extracted.baggageTotal}`,
        );
      }

      return {
        seatTotal: extracted.seatTotal,
        baggageTotal: extracted.baggageTotal,
        mealTotal: 0,
        serviceTotal: extracted.serviceTotal,
        verified,
        individualBaggagePrices:
          baggageIds.length > 0
            ? [extracted.baggageTotal / baggageIds.length]
            : undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Ancillary repricing failed: ${message}`);
      return null;
    }
  }

  /**
   * Attempt a fresh reprice by calling the provider's reprice endpoint.
   * For Travelport, uses `/price/offers/buildfromproducts` via the workflow service.
   * For other providers, dispatches through the booking provider registry.
   * Falls back to the cached search response price if the API call fails — unless
   * `strictReprice` is enabled, in which case the booking fails immediately.
   */
  private async freshReprice(
    searchKey: string,
    offerId: string,
    fallbackPrice?: number,
    fallbackCurrency?: string,
    provider?: string,
    tripType?: string,
  ): Promise<{ amount: number; currency: string }> {
    // https://travelport.com: multi-city Travelport uses LEG mode — products expire quickly.
    // Live reprice unsupported; use cached search-time price. Detect multi-city from
    // tripType param OR offerId pattern (combined offers have "+" separator).
    const isMultiCity =
      (provider === 'travelport' && tripType === 'multi_city') ||
      (provider === 'travelport' && offerId.includes('+'));
    if (isMultiCity) {
      if (fallbackPrice && fallbackCurrency) {
        this.logger.warn(
          `[freshReprice] Multi-city Travelport — using cached price (${fallbackPrice} ${fallbackCurrency})`,
        );
        return { amount: fallbackPrice, currency: fallbackCurrency };
      }
      // QA 2026-09-14: the caller-supplied fallback (from the checkout request
      // body) is 0/missing — this happened on every multi-city checkout that
      // didn't happen to carry a non-zero client-computed totalPrice (e.g. the
      // page-load reprice failed and the client's price state never updated).
      // Before hard-failing, try the selected-offer cache — repriceFromSnapshot()
      // re-primes this same cache entry from the snapshot's own supplierPrice on
      // page load, so it's usually still there and is the authoritative
      // search-time price, exactly like the non-multi-city path below uses.
      try {
        const cachedEntry = await this.selectedOfferCache.retrieve(
          searchKey,
          offerId,
          provider,
        );
        if (cachedEntry?.supplierPrice?.amount && cachedEntry.supplierPrice.currency) {
          this.logger.warn(
            `[freshReprice] Multi-city Travelport — no request-body fallback; using selected-offer cache price (${cachedEntry.supplierPrice.amount} ${cachedEntry.supplierPrice.currency})`,
          );
          return {
            amount: cachedEntry.supplierPrice.amount,
            currency: cachedEntry.supplierPrice.currency,
          };
        }
      } catch {
        // fall through to the hard failure below
      }
      throw new Error(
        'Multi-city Travelport: no cached price available for reprice',
      );
    }

    // Try fresh API reprice via the booking workflow service
    try {
      if (provider && provider !== 'travelport') {
        const bp = this.bookingProviderRegistry.getProvider(
          provider as import('../../../settings/domain/provider-config.entity').FlightsProviderKey,
        );
        if (bp.reprice) {
          const freshPrice = await bp.reprice(searchKey, offerId);
          return freshPrice;
        }
        // Non-Travelport provider without custom reprice — skip Travelport fallback,
        // go straight to cached price. Duffle offers have guaranteed prices.
        throw new Error(`${provider} does not support fresh reprice`);
      }
      const freshPrice =
        await this.bookingWorkflowService.priceForCheckoutSession(
          searchKey,
          offerId,
        );

      // If Travelport returned a different currency than the user selected, convert
      if (fallbackCurrency && freshPrice.currency !== fallbackCurrency) {
        try {
          const converted = await this.convertCurrency(
            freshPrice.amount,
            freshPrice.currency,
            fallbackCurrency,
          );
          if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
            this.logger.log(
              `Converted price from ${freshPrice.currency} ${freshPrice.amount} to ${converted.currency} ${converted.amount} (preferred: ${fallbackCurrency})`,
            );
          }
          return converted;
        } catch (convErr: unknown) {
          // Conversion unavailable — use Travelport's price as-is
          this.logger.warn(
            `Currency conversion from ${freshPrice.currency} to ${fallbackCurrency} unavailable: ${convErr instanceof Error ? convErr.message : String(convErr)}. Using Travelport price in ${freshPrice.currency}.`,
          );
          return freshPrice;
        }
      }

      return freshPrice;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const upperMessage = message.toUpperCase();

      // For non-Travelport providers, skip strictReprice — Duffel prices are guaranteed.
      // Go straight to cached price lookup.
      if (provider && provider !== 'travelport') {
        this.logger.warn(
          `[${provider}] Fresh reprice unavailable for ${offerId}: ${message}. Falling back to cached price.`,
        );
      } else {
        // Checked FIRST and made authoritative below: this is our OWN
        // reprice()'s "cache miss" message (selectedOfferCache TTL expiry or
        // an in-memory cache eviction after a process restart — routine
        // infra, not a supplier rejection), and it happens to contain the
        // substring "no longer available" — the exact phrase
        // isFareAvailabilityError also matches on. With that check tested
        // first (as this was previously ordered), every cache-miss got
        // misclassified as a hard "fare unavailable" rejection and hard-
        // blocked checkout/redirected to search, even though the snapshot's
        // cached price was still perfectly usable. Reproduced live: a
        // one-way Travelport checkout that took a few minutes of form-
        // filling (real user pace) hit this exact path and got redirected
        // to search with "Fare No Longer Available" — nothing wrong with
        // the fare itself.
        const isCacheMiss =
          upperMessage.includes('SELECTED OFFER IS NO LONGER AVAILABLE') ||
          upperMessage.includes('FLIGHTS_OFFER_EXPIRED');

        // Fare availability errors (cabin sold out, class unavailable) mean
        // the selected fare CANNOT be ticketed at any price. Block checkout
        // immediately so the user picks another flight instead of paying and
        // then hitting a refund loop. Excludes isCacheMiss matches — those
        // are ours, not the supplier's, and must fall through to the cached
        // price below regardless of which phrase they happen to contain.
        const isFareAvailabilityError =
          !isCacheMiss &&
          (upperMessage.includes('REQUESTED CABIN HAS NO AVAILABLE FARES') ||
            upperMessage.includes('NO AVAILABLE FARES') ||
            upperMessage.includes('FARE IS NOT AVAILABLE') ||
            upperMessage.includes('CLASS OF SERVICE') ||
            upperMessage.includes('NO LONGER AVAILABLE') ||
            upperMessage.includes('FLIGHT SEGMENTS UNAVAILABLE') ||
            upperMessage.includes('UNAVAILABLE IN THE REQUESTED CLASS'));

        // Fare availability errors mean the cabin/class is sold out — the cached
        // price is stale and booking will fail. Block checkout immediately.
        if (isFareAvailabilityError) {
          throw new BusinessError(
            'FLIGHTS_OFFER_UNAVAILABLE',
            `The selected fare is no longer available: ${message}`,
            undefined,
            { offerId, provider: provider ?? 'travelport', reason: message },
          );
        }

        if (isCacheMiss) {
          // Cache miss is an infrastructure issue (process restart, in-memory cache
          // eviction), not a price verification failure. Always fall through to the
          // search cache fallback regardless of strictReprice.
          this.logger.warn(
            `[strictReprice] Offer cache miss for ${offerId}: ${message}. Falling back to search cache.`,
          );
        } else if (this.configService.travelport.strictReprice) {
          // Actual API reprice failure (Travelport returned an error or different price).
          // strictReprice = true means we must reject — cannot guarantee current price.
          throw new BusinessError(
            'FLIGHTS_REPRICE_FAILED',
            `Unable to verify current price: ${message}. Booking rejected because strictReprice is enabled.`,
          );
        } else {
          this.logger.warn(
            `Fresh reprice unavailable for ${offerId}: ${message}. Falling back to cached price.`,
          );
        }
      }
      // Fall through to cache-based price
    }

    // Fall back to cached search response price
    // The aggregator stores per-provider raw responses under `flight-search:${searchKey}:provider:${provider}`
    try {
      const providerKey = provider ?? 'travelport';
      const cacheKey = `flight-search:${searchKey}:provider:${providerKey}`;
      const cachedSearch =
        await this.cacheService.get<NormalizedFlightSearchResponse>(cacheKey);
      const offers = cachedSearch?.offers ?? [];
      if (offers.length) {
        const matchedOffer = offerId
          ? offers.find(
              (o) => o.metadata?.offeringId === offerId || o.id === offerId,
            )
          : undefined;
        const targetOffer = matchedOffer ?? offers[0];
        const totalPrice = targetOffer?.price?.total;
        const currency =
          targetOffer?.price?.currency ?? fallbackCurrency ?? 'USD';
        if (typeof totalPrice === 'number' && totalPrice > 0) {
          return { amount: totalPrice, currency };
        }
      }
    } catch {
      // Cache lookup failed — fall through to fallback
    }

    if (
      typeof fallbackPrice === 'number' &&
      fallbackPrice > 0 &&
      fallbackCurrency
    ) {
      return { amount: fallbackPrice, currency: fallbackCurrency };
    }
    throw new BusinessError(
      'FLIGHTS_SEARCH_KEY_MISSING',
      'Total price is required to process the booking. Please include totalPrice and currency from the search results.',
    );
  }

  private async resolvePrice(
    searchKey: string | undefined,
    offerId: string,
    fallbackPrice?: number,
    fallbackCurrency?: string,
    provider?: string,
    tripType?: string,
  ): Promise<{ amount: number; currency: string }> {
    if (searchKey) {
      return this.freshReprice(
        searchKey,
        offerId,
        fallbackPrice,
        fallbackCurrency,
        provider,
        tripType,
      );
    }

    if (
      typeof fallbackPrice === 'number' &&
      fallbackPrice > 0 &&
      fallbackCurrency
    ) {
      return { amount: fallbackPrice, currency: fallbackCurrency };
    }
    throw new BusinessError(
      'FLIGHTS_SEARCH_KEY_MISSING',
      'Total price is required to process the booking. Please include totalPrice and currency from the search results.',
    );
  }

  /**
   * Convert an amount from one currency to another using the pre-configured
   * exchange rates stored in the currency module.
   *
   * Both rates are relative to the configured base currency (e.g. if base=USD,
   * KWD.exchangeRate = 3.25 means 1 KWD = 3.25 USD). The conversion formula:
   *   amountInTarget = amount * (sourceRate / targetRate)
   *
   * @throws Error if either currency's exchange rate is not available
   */
  private async convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<{ amount: number; currency: string }> {
    if (fromCurrency === toCurrency) {
      return { amount, currency: toCurrency };
    }

    const from = await this.currencyService.getByCode(fromCurrency);
    const to = await this.currencyService.getByCode(toCurrency);

    if (!from) {
      throw new Error(
        `Exchange rate not found for source currency: ${fromCurrency}`,
      );
    }
    if (!to) {
      throw new Error(
        `Exchange rate not found for target currency: ${toCurrency}`,
      );
    }

    // Both rates are relative to the base currency
    const fromRate = Number(from.exchangeRate);
    const toRate = Number(to.exchangeRate);

    if (!Number.isFinite(fromRate) || fromRate <= 0) {
      throw new Error(`Invalid exchange rate for ${fromCurrency}: ${fromRate}`);
    }
    if (!Number.isFinite(toRate) || toRate <= 0) {
      throw new Error(`Invalid exchange rate for ${toCurrency}: ${toRate}`);
    }

    const convertedAmount = amount * (toRate / fromRate);
    const decimals = to.decimals ?? 2;
    const multiplier = Math.pow(10, decimals);
    const rounded = Math.round(convertedAmount * multiplier) / multiplier;

    return { amount: rounded, currency: toCurrency };
  }

  private extractWorkflowErrorMessages(payload: unknown): string[] {
    const messages: string[] = [];
    const queue: unknown[] = [payload];

    while (queue.length > 0 && messages.length < 5) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') {
        continue;
      }

      if (Array.isArray(current)) {
        queue.push(...current);
        continue;
      }

      const record = current as Record<string, unknown>;
      const code =
        typeof record.SourceCode === 'string'
          ? record.SourceCode
          : typeof record.Code === 'string'
            ? record.Code
            : typeof record.code === 'string'
              ? record.code
              : undefined;
      const text =
        typeof record.Message === 'string'
          ? record.Message
          : typeof record.message === 'string'
            ? record.message
            : typeof record.Description === 'string'
              ? record.Description
              : typeof record.description === 'string'
                ? record.description
                : undefined;

      if (code || text) {
        messages.push([code, text].filter(Boolean).join(': '));
      }

      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return messages;
  }
}
