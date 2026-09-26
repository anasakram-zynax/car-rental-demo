import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessError } from '../../../../shared/errors/business-error';
import { createHash, randomUUID } from 'node:crypto';
import { generatePublicRef } from '../../../../shared/utils/public-ref.util';
import type { HotelBookingRepoPort } from '../ports/hotel-booking-repo.port';
import { HotelBookingRepoPortToken } from '../ports/hotel-booking-repo.port';
import { HotelsProviderRegistryService } from '../../providers/registry/hotels-provider-registry.service';
import { CreateBookingDto } from '../../api/dto/create-booking.dto';
import { CheckoutDto } from '../../api/dto/checkout.dto';
import { CreatePaymentIntentUseCase } from '../../../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../../../payment/domain/enums/booking-type.enum';
import { PaymentGateway, isManualPaymentGateway } from '../../../payment/domain/enums/payment-gateway.enum';
import { PaymentEntity } from '../../../payment/domain/entities/payment.entity';
import { PaymentRepository } from '../../../payment/domain/repositories/payment.repository';
import { PaymentStatus } from '../../../payment/domain/enums/payment-status.enum';
import { SiteSettingStore } from '../../../settings/infrastructure/site-setting.store';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { InvoiceService } from '../../../invoices/application/services/invoice.service';
import { PaymentOrchestratorService } from '../../../payment/application/services/payment-orchestrator.service';
import { MarkupService } from '../../../markup/markup.service';
import { PrismaService } from '../../../../shared/database/prisma.service';
import {
  generateFakePnr,
  isFakeLocatorCode,
  isTravelportFakeEligible,
  withFakeBookingAudit,
} from '../../../../shared/booking/demo-booking-fallback.util';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { PromoCodeRedemptionService } from '../../../promo-codes/application/services/promo-code-redemption.service';
import { PromoCodeEligibilityService } from '../../../promo-codes/application/services/promo-code-eligibility.service';
import { PromoCodePricingService } from '../../../promo-codes/application/services/promo-code-pricing.service';
import { NotificationService } from '../../../notifications/application/notification.service';
import {
  PromoCodeRepositoryToken,
  type IPromoCodeRepository,
} from '../../../promo-codes/application/ports/promo-code.repository.port';
import type { HotelProvider } from '../../domain/interfaces/hotel-provider.interface';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import {
  computeHotelCancellationFee,
  type HotelCancellationPolicyInput,
} from './hotel-cancellation-fee.util';
import { PolicyAggregatorService } from '../../policies/policy-aggregator.service';
import { HotelbedsPolicyNormalizer } from '../../policies/hotelbeds-policy-normalizer';
import { AmadeusPolicyNormalizer } from '../../policies/amadeus-policy-normalizer';
import { RateHawkPolicyNormalizer } from '../../policies/ratehawk-policy-normalizer';
import { TravelportStaysPolicyNormalizer } from '../../policies/travelport-stays-policy-normalizer';
import { WalletService } from '../../../wallet/wallet.service';
import { CustomerWalletService } from '../../../wallet/customer-wallet.service';
import { PermissionCode } from '../../../access-control/domain/enums/permission-code.enum';
import { ImmediateOutboxDispatcherService } from '../../../../shared/outbox/application/immediate-outbox-dispatcher.service';
import type { PolicyNormalizer } from '../../policies/policy-normalizer.interface';

@Injectable()
export class HotelBookingService {
  private readonly logger = new Logger(HotelBookingService.name);

  constructor(
    @Inject(HotelBookingRepoPortToken)
    private readonly bookingRepo: HotelBookingRepoPort,
    private readonly providerRegistry: HotelsProviderRegistryService,
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    private readonly paymentRepository: PaymentRepository,
    private readonly paymentOrchestrator: PaymentOrchestratorService,
    private readonly markupService: MarkupService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly promoRedemptionService: PromoCodeRedemptionService,
    private readonly promoEligibilityService: PromoCodeEligibilityService,
    private readonly promoPricingService: PromoCodePricingService,
    @Inject(PromoCodeRepositoryToken)
    private readonly promoCodeRepo: IPromoCodeRepository,
    private readonly notifications: NotificationService,
    private readonly currencyService: CurrencyService,
    private readonly configService: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly policyAggregator: PolicyAggregatorService,
    private readonly hotelbedsPolicyNormalizer: HotelbedsPolicyNormalizer,
    private readonly amadeusPolicyNormalizer: AmadeusPolicyNormalizer,
    private readonly ratehawkPolicyNormalizer: RateHawkPolicyNormalizer,
    private readonly walletService: WalletService,
    private readonly customerWalletService: CustomerWalletService,
    private readonly immediateDispatcher: ImmediateOutboxDispatcherService,
    private readonly siteSettings: SiteSettingStore,
    private readonly gatewayConfigService: PaymentGatewayConfigService,
    private readonly invoiceService: InvoiceService,
  ) {}

  /**
   * Manual payment methods (bank_transfer / pay_later): no gateway charge.
   * Creates a PENDING payment row so the booking waits for admin verify/issue
   * (or the customer paying later). No hold timer for hotels v1 — confirm()
   * re-validates the rate, so a stale rate safely refuses at issue time.
   */
  private async createManualHoldPayment(input: {
    bookingId: string;
    gateway: PaymentGateway;
    amount: number;
    currency: string;
  }): Promise<{ paymentId: string; reference: string }> {
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
    const existing = await this.paymentRepository.findMany({
      bookingId: input.bookingId,
    });
    const active = existing.find(
      (p) =>
        p.status === PaymentStatus.PENDING &&
        String(p.gateway).toUpperCase() === String(input.gateway).toUpperCase(),
    );
    if (active) {
      return { paymentId: active.id, reference: active.reference };
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
      bookingType: BookingType.HOTEL,
      gateway: input.gateway,
      amount: input.amount,
      currency: input.currency,
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as PaymentEntity);
    await this.paymentRepository.create(payment);
    // Invoice now (fire-and-forget): manual bookings never reach the
    // supplier_confirmed event that normally triggers generation.
    this.invoiceService
      .generateForBooking(input.bookingId)
      .catch((e: unknown) =>
        this.logger.warn(
          `[ManualHold] Invoice generation failed for ${input.bookingId}: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
    return { paymentId: payment.id, reference: payment.reference };
  }

  /** Get the correct policy normalizer for a provider. */
  private readonly travelportStaysPolicyNormalizer = new TravelportStaysPolicyNormalizer();

  private getPolicyNormalizer(providerKey: string): PolicyNormalizer {
    switch (providerKey) {
      case 'amadeus':
        return this.amadeusPolicyNormalizer;
      case 'ratehawk':
        return this.ratehawkPolicyNormalizer;
      case 'travelport-stays':
        return this.travelportStaysPolicyNormalizer;
      case 'hotelbeds':
      default:
        return this.hotelbedsPolicyNormalizer;
    }
  }

  /**
   * Compute the customer (marked-up) price for a validated supplier amount.
   * Used by the validate-rate endpoint so the returned display price matches
   * what the customer actually pays at checkout — keeping detail/checkout/
   * payment consistent across all hotel suppliers.
   */
  async computeValidatedCustomerPrice(
    supplierAmount: number,
    supplierId?: string,
  ): Promise<number> {
    try {
      const markupResult = await this.markupService.calculatePrice(
        supplierAmount,
        'hotels',
        undefined,
        supplierId,
        undefined,
        undefined,
      );
      return markupResult.finalPrice;
    } catch {
      return supplierAmount;
    }
  }

  /**
   * Compute the DISPLAY price for a validated supplier amount, aware of the
   * caller's role: agents are shown/charged the AGENT-marked-up price (which the
   * agent-booking endpoint enforces server-side), everyone else the customer
   * markup. Keeps validate → booking price expectations consistent per role.
   */
  async computeValidatedDisplayPrice(
    supplierAmount: number,
    supplierId?: string,
    opts?: { userType?: string | null; agentProfileId?: string | null },
  ): Promise<number> {
    const isAgent = opts?.userType === 'AGENT';
    if (isAgent) {
      try {
        const agentPreview = await this.markupService.calculatePrice(
          supplierAmount,
          'hotels',
          opts?.agentProfileId ?? undefined,
          supplierId,
          undefined,
          undefined,
        );
        return agentPreview.finalPrice;
      } catch {
        return supplierAmount;
      }
    }
    return this.computeValidatedCustomerPrice(supplierAmount, supplierId);
  }

  /**
   * Normalize the paxes payload defensively: accepts flat PaxDto[] or a
   * legacy grouped array-of-arrays and always stores a flat, non-empty
   * array of pax objects. Kills the 'paxes: [[]]' malformation seen in QA.
   */
  private normalizePaxes(input: CreateBookingDto): Array<Record<string, unknown>> {
    const raw = (input as any).guests?.length ? (input as any).guests : input.paxes;
    if (!Array.isArray(raw)) return [];
    const flat = raw.flat(2).filter(
      (p: any) => p && typeof p === 'object' && (p.name || p.firstName || p.type),
    );
    return flat as Array<Record<string, unknown>>;
  }

  /**
   * Step 1: validate rate, apply markup, create pending_payment booking.
   * Unified pipeline Phase 5: role-aware — agents get agent-markup pricing
   * (one source of truth with the booking-time revalidation), everyone else
   * keeps customer markup. opts threaded from the controller's auth context.
   */
  async preview(
    input: CreateBookingDto,
    userId?: string,
    opts?: { userType?: string | null; agentProfileId?: string | null },
  ) {
    // Route by selected provider (from the offer the customer chose)
    const providerKey = input.provider ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(providerKey);

    // Check that the provider is booking-enabled before making upstream calls
    const bookingProviders = await this.providerRegistry.getBookingProviders();
    if (!bookingProviders.some((p) => p.key === providerKey)) {
      this.logger.warn(
        `[PREVIEW] Provider "${providerKey}" is not booking-enabled. Rejecting preview.`,
      );
      throw new BusinessError(
        'HOTELS_PROVIDER_BOOKING_DISABLED',
        `Provider "${providerKey}" is not enabled for booking. Please contact support.`,
      );
    }

    // Determine which rate identifier to use: rateId (preferred) or rateKey (legacy)
    const rateId = input.rateId ?? input.rateKey;
    if (!rateId) {
      throw new BusinessError(
        'HOTELS_RATE_ID_REQUIRED',
        'A rate identifier (rateId or rateKey) is required.',
      );
    }

    // Validate the rate using the provider adapter (pass search context when available)
    const validatedRate = await provider.validateRate({
      rateId,
      searchKey: input.searchKey,
      // Prefer the explicit providerHotelId (clean provider-specific ID, e.g.
      // Travelport Stays' "chainCode:propertyCode") over hotelId, which may be
      // the client's provider-prefixed/URL-encoded aggregate ID
      // ("travelport-stays:RT:00372" or worse, un-decoded) and isn't safe to
      // pass straight into a provider's own ID parsing.
      providerHotelId: input.providerHotelId ?? input.hotelId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.roomAdults
        ? [{ adults: input.roomAdults, children: input.roomChildren ?? 0 }]
        : undefined,
    });

    const currency = validatedRate.supplierCurrency ?? 'EUR';
    const net = validatedRate.supplierAmount;

    if (!Number.isFinite(net) || net <= 0) {
      throw new BusinessError(
        'HOTELS_RATE_CHECK_FAILED',
        'Could not determine a valid price for the given rate.',
      );
    }

    // Charge currency = the customer's selected currency (falls back to supplier).
    // Supplier-facing calls (validateRate/bookHotel) always use the supplier currency.
    const chargeCurrency = (
      input.currency ??
      input.displayCurrency ??
      currency
    ).toUpperCase();

    this.logger.debug(
      `[PREVIEW] provider=${provider.key} rateId=${rateId} net=${net} currency=${currency}`,
    );

    // Apply markup rules (global, supplier, product) for customer pricing.
    // supplierId MUST be passed — supplier-scoped rules (e.g. a template
    // applied to hotelbeds) otherwise never match and the booking is charged
    // the unmarked net while search cards show the marked price.
    // Unified pipeline Phase 5: role-aware pricing — agents priced with
    // their agent rules + profile fallback; everyone else customer markup.
    const isAgentCaller = opts?.userType === 'AGENT';
    const markupResult = isAgentCaller
      ? await this.markupService.calculatePrice(
          net,
          'hotels',
          opts?.agentProfileId ?? undefined,
          providerKey,
          undefined,
          undefined,
        )
      : await this.markupService.calculatePrice(
          net,
          'hotels',
          undefined, // no agentId → skips agent-specific rules
          providerKey, // supplierId → matches supplier-scoped rules
          undefined, // routeFrom
          undefined, // routeTo
        );
    const markedUpNet = markupResult.finalPrice;
    const markupAmount = markedUpNet - net;

    // Calculate agent commission (if user is an agent)
    let commissionAmount: number | null = null;
    let commissionRate: number | null = null;
    if (userId) {
      try {
        const agentProfile = await this.prisma.agentProfile.findUnique({
          where: { userId },
          select: { commissionRate: true },
        });
        if (
          agentProfile?.commissionRate &&
          Number(agentProfile.commissionRate) > 0
        ) {
          commissionRate = Number(agentProfile.commissionRate);
          commissionAmount = net * (commissionRate / 100);
        }
      } catch {
        // Agent lookup failed — proceed without commission
      }
    }

    // Convert the marked-up amount to the charge currency for customer-facing pricing.
    let chargeAmount = markedUpNet;
    let chargeExchangeRate: number | null = null;
    if (chargeCurrency !== currency) {
      try {
        const converted = await this.currencyService.convert(
          markedUpNet,
          currency,
          chargeCurrency,
        );
        chargeAmount = converted.amount;
        const fromRate = await this.currencyService.getByCode(currency);
        const toRate = await this.currencyService.getByCode(chargeCurrency);
        if (fromRate && toRate) {
          chargeExchangeRate =
            Number(toRate.exchangeRate) / Number(fromRate.exchangeRate);
        }
      } catch {
        throw new BusinessError(
          'HOTELS_CHARGE_CURRENCY_CONVERSION_FAILED',
          `Cannot charge in ${chargeCurrency}: conversion from ${currency} failed. Please select a different currency or retry.`,
        );
      }
    }

    // Rate semantics: supplier APIs (Hotelbeds checkrate net, RateHawk prebook
    // price, Amadeus offer.price.total) quote the TOTAL for the whole stay.
    // Only manual inventory quotes per-night prices (capabilities.ratesArePerNight).
    // Multiplying stay totals by nights overcharged multi-night bookings —
    // multiply ONLY when the provider actually returns per-night rates.
    const nights = input.checkIn && input.checkOut
      ? Math.max(1, Math.round(
          (new Date(input.checkOut).getTime() - new Date(input.checkIn).getTime()) / 86400000,
        ))
      : 1;
    const ratesArePerNight = provider.capabilities?.ratesArePerNight ?? false;
    const stayMultiplier = ratesArePerNight ? nights : 1;
    if (stayMultiplier > 1) {
      chargeAmount = chargeAmount * stayMultiplier;
      commissionAmount = commissionAmount != null ? commissionAmount * stayMultiplier : null;
    }

    // Persist the markup in the CHARGE currency so admin earnings match what
    // the customer actually paid — the success page and bookings table render
    // customerCurrency; storing the supplier-currency markup here produced
    // wrong earnings whenever the two currencies differ.
    // All totals below are STAY totals: stay base = net × stayMultiplier.
    const stayBaseSupplier = net * stayMultiplier;
    let markupAmountCharged = markupAmount * stayMultiplier;
    // Supplier base converted into the charge currency — persisted so every
    // surface (success page, admin views) can render the breakdown in ONE
    // currency instead of mixing the raw supplier EUR amount with USD totals.
    let supplierBaseInCharge: number | null = null;
    if (chargeCurrency !== currency) {
      try {
        const netConverted = await this.currencyService.convert(
          stayBaseSupplier,
          currency,
          chargeCurrency,
        );
        supplierBaseInCharge = netConverted.amount;
        markupAmountCharged = chargeAmount - netConverted.amount;
      } catch {
        // Keep supplier-currency markup as fallback rather than blocking booking.
      }
    } else {
      supplierBaseInCharge = stayBaseSupplier;
    }

    // Extract per-room occupancy from the validated rate response
    const firstRoom = validatedRate.rooms?.[0];
    const firstRate = firstRoom?.rates?.[0];
    const roomAdults = input.roomAdults ?? firstRate?.adults ?? 1;
    const roomChildren = input.roomChildren ?? firstRate?.children ?? 0;

    // Build the rate snapshot from validated rate data
    const freshRateIds =
      validatedRate.rooms
        ?.flatMap((room) => room.rates.map((r: any) => r.rateId ?? r.rateKey))
        .filter(Boolean)
        .join('|||') ?? rateId;

    const booking: import('../../domain/entities/hotel-booking.entity').CreateHotelBookingInput =
      {
        id: randomUUID(),
        publicRef: generatePublicRef(),
        provider: provider.key,
        status: 'pending_payment',
        receiptUrl: null,

        // Provider-neutral fields (preferred)
        searchKey: input.searchKey ?? null,
        hotelId: input.hotelId ?? null,
        providerHotelId: input.providerHotelId ?? null,
        // supplierRateId = the rate identifier the supplier accepts for a
        // re-price (original hotelpage hash for RateHawk; search rateKey for
        // Hotelbeds). The fresh prebook/checkrate token goes in prebookToken.
        supplierRateId: rateId,
        prebookToken: validatedRate.prebookToken ?? null,
        prebookExpiresAt: validatedRate.prebookExpiresAt ?? null,
        partnerOrderId: null,
        supplierReference: null,
        supplierStatus: null,
        supplierBookingId: null,
        supplierOrderId: null,
        supplierItemId: null,
        guests: this.normalizePaxes(input) as any,
        supplierAmount: net,
        supplierCurrency: currency,
        customerAmount: chargeAmount,
        customerCurrency: chargeCurrency,
        markupAmount: markupAmountCharged,
        markupSnapshot: {
          breakdown: markupResult.appliedRules ?? null,
          appliedAt: new Date().toISOString(),
          // Audit trail: total markup in the SUPPLIER currency (stay total)
          // before charge-currency conversion.
          supplierCurrencyMarkup: markupAmount * stayMultiplier,
          supplierCurrency: currency,
          chargeCurrency,
          // Supplier base converted to the CHARGE currency (stay total) —
          // guarantees supplier + markup = customer total in one currency.
          supplierBaseInChargeCurrency: supplierBaseInCharge,
        },
        commissionAmount,
        commissionRate,
        rateSnapshot: {
          roomAdults,
          roomChildren,
          checkedAt: new Date().toISOString(),
          roomCount: validatedRate.rooms?.length ?? 1,
          cancellationPolicies: extractCancellationPolicies(validatedRate),
          // Terms received from the supplier BEFORE confirmation — kept on the
          // booking so cancel estimates, admin views and demo (fake-reference)
          // bookings never depend on a live supplier lookup.
          refundable: (firstRate as any)?.refundable ?? null,
          cancellationPolicyText:
            (firstRate as any)?.cancellationPolicyText ?? null,
          rateComments: (firstRate as any)?.rateComments ?? null,
          guaranteeType: (firstRate as any)?.guaranteeType ?? null,
          policySource: (firstRate as any)?.policySource ?? null,
          policiesCapturedAt: new Date().toISOString(),
          stayNights: nights,
          hotelName: input.hotelName ?? null,
          roomName: input.roomName ?? null,
          boardName: input.boardName ?? null,
          chargeCurrency,
          chargeExchangeRate,
        },
        hotelConfirmationNumber: null,
        hotelConfirmationStatus: null,
        hotelConfirmationLastCheckedAt: null,
        hotelConfirmationNextCheckAt: null,
        hotelConfirmationAttempts: 0,
        // Travelport Stays needs providerHotelId + stay dates to re-validate
        // the rate at confirm time (its API has no dates-free prebook token
        // the way Hotelbeds/RateHawk do) — stash them here since there's no
        // dedicated checkIn/checkOut column on the booking record.
        supplierPayload:
          input.userIp || input.checkIn || input.checkOut
            ? {
                ...(input.userIp ? { userIp: input.userIp } : {}),
                ...(input.checkIn ? { checkIn: input.checkIn } : {}),
                ...(input.checkOut ? { checkOut: input.checkOut } : {}),
              }
            : null,
        workflowTrace: null,
        supplierErrorCode: null,
        supplierErrorText: null,

        // Legacy fields (kept for backward compatibility with existing records)
        rateKey: freshRateIds,
        holder: input.holder,
        clientReference: input.clientReference,
        paxes: this.normalizePaxes(input) as any,
        amount: chargeAmount,
        currency: chargeCurrency,
        hotelbedsRef: null,
        hotelbedsStatus: null,
        hotelSnapshot: null,
        priceSnapshot: {
          roomAdults,
          roomChildren,
          checkedAt: new Date().toISOString(),
        },
        message: null,
        userId,
      };

    await this.bookingRepo.create(booking);

    // ── Promo code logic ──
    let promoDiscountMinor = 0;
    let appliedPromoCode: string | undefined;

    if (input.promoCode) {
      try {
        const promo = await this.promoCodeRepo.findByCode(input.promoCode);
        if (promo) {
          const bookingSubtotalMinor = await this.currencyService.toSmallestUnit(
            chargeAmount,
            chargeCurrency,
          );

          const eligibility = await this.promoEligibilityService.check({
            promoCode: promo,
            userId,
            productType: 'hotels',
            currency: chargeCurrency,
            bookingSubtotalMinor,
            hotelId: input.hotelId,
            destinationCode: undefined,
            providerKey: provider.key,
          });

          if (eligibility.eligible) {
            const discount = this.promoPricingService.calculate({
              promoCode: promo,
              bookingSubtotalMinor,
              currency: chargeCurrency,
            });
            promoDiscountMinor = discount.discountMinor;
            appliedPromoCode = input.promoCode;

            // Reserve promo redemption
            try {
              await this.promoRedemptionService.reserve({
                promoCodeId: promo.id,
                userId,
                bookingId: booking.id,
                bookingType: 'HOTEL',
                discountMinor: promoDiscountMinor,
                currency: chargeCurrency,
                bookingSubtotalMinor,
                idempotencyKey: `promo:${booking.id}:${input.promoCode}`,
              });
            } catch (reserveErr: unknown) {
              const msg =
                reserveErr instanceof Error
                  ? reserveErr.message
                  : String(reserveErr);
              this.logger.warn(
                `[Preview] Promo reservation failed: ${msg}. Proceeding without promo.`,
              );
              promoDiscountMinor = 0;
              appliedPromoCode = undefined;
            }
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

    // Apply promo discount to total amount (in charge currency)
    const chargeMinorUnit = await this.currencyService.getDecimals(chargeCurrency);
    const discountMajor = await this.currencyService.fromSmallestUnit(promoDiscountMinor, chargeCurrency);
    const finalAmount = Math.max(
      0,
      Number((chargeAmount - discountMajor).toFixed(chargeMinorUnit)),
    );

    // Convert response to display currency when it differs from the charge currency
    let displayAmount = finalAmount;
    let displayCurrency = chargeCurrency;
    let displayExchangeRate: number | null = null;
    if (input.displayCurrency && input.displayCurrency !== chargeCurrency) {
      try {
        const converted = await this.currencyService.convert(
          finalAmount,
          chargeCurrency,
          input.displayCurrency,
        );
        if (converted.amount > 0) {
          displayAmount = converted.amount;
          displayCurrency = converted.currency;
          const fromRate = await this.currencyService.getByCode(chargeCurrency);
          const toRate = await this.currencyService.getByCode(
            input.displayCurrency,
          );
          if (fromRate && toRate) {
            displayExchangeRate =
              Number(toRate.exchangeRate) / Number(fromRate.exchangeRate);
          }
        }
      } catch {
        throw new BusinessError(
          'HOTELS_DISPLAY_CURRENCY_CONVERSION_FAILED',
          `Cannot show checkout prices in ${input.displayCurrency}: conversion from ${chargeCurrency} failed. Please select a different currency or retry.`,
        );
      }
    }

    // Notification: hotel booking created
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.hotel.created',
        aggregateType: 'Booking',
        aggregateId: booking.id,
        payload: {
          bookingId: booking.id,
          bookingType: 'HOTEL',
          amount: finalAmount,
          currency: chargeCurrency,
          supplierAmount: net,
          supplierCurrency: currency,
          userId,
        },
      });
      this.notifications
        .notifyDirect({
          idempotencyKey: eventId,
          eventType: 'booking.hotel.created',
          aggregateType: 'Booking',
          aggregateId: booking.id,
          payload: {
            bookingId: booking.id,
            bookingType: 'HOTEL',
            amount: finalAmount,
            currency: chargeCurrency,
            supplierAmount: net,
            supplierCurrency: currency,
            userId,
          },
        })
        .catch(() => {});
    } catch {
      this.logger.warn(
        `Failed to emit booking.hotel.created for ${booking.id}`,
      );
    }

    // Compute aggregated policy from validated rate (firstRate already defined above)
    const normalizer = this.getPolicyNormalizer(provider.key);
    const supplierPolicy = normalizer.normalize(firstRate);
    const aggregatedPolicy = this.policyAggregator.aggregate(
      provider.key,
      supplierPolicy,
    );

    return {
      bookingId: booking.id,
      amount: finalAmount,
      currency: chargeCurrency,
      displayAmount,
      displayCurrency,
      displayExchangeRate,
      status: booking.status,
      aggregatedPolicy,
      next: 'payment',
      ...(promoDiscountMinor > 0 && appliedPromoCode
        ? { discountMinor: promoDiscountMinor, promoCode: appliedPromoCode }
        : {}),
    };
  }

  /**
   * Step 2: create payment intent and return client-facing payment details.
   */
  async checkout(
    input: CheckoutDto,
    userId?: string,
    opts?: { userType?: string | null; agentProfileId?: string | null },
  ) {
    // Idempotency: Check if there's already a pending booking for this user+rateKey
    // This prevents duplicate bookings when checkout is called multiple times (e.g., double-click)
    if (userId && input.rateKey) {
      const existingBooking =
        await this.bookingRepo.findPendingByUserAndRateKey(
          userId,
          input.rateKey,
        );
      if (existingBooking) {
        this.logger.log(
          `[Checkout] Found existing pending booking ${existingBooking.id} for user ${userId} and rateKey ${input.rateKey}`,
        );

        // Check if the existing booking has a payment record
        const existingPayments = await this.paymentRepository.findMany({
          bookingId: existingBooking.id,
          status: PaymentStatus.PENDING,
        });

        if (existingPayments.length > 0) {
          // Return the existing payment ID
          const existingPayment = existingPayments[0];
          return {
            bookingId: existingBooking.id,
            paymentId: existingPayment.id,
            amount:
              existingBooking.amount ?? existingBooking.customerAmount ?? 0,
            currency:
              existingBooking.currency ??
              existingBooking.customerCurrency ??
              'USD',
            clientSecret: existingPayment.providerClientSecret ?? null,
            checkoutUrl: existingPayment.providerCheckoutUrl ?? null,
            existingBooking: true, // Flag to indicate this is an existing booking
          };
        }

        // No payment record exists yet, create a new payment intent for the existing booking
        const paymentAmount =
          existingBooking.amount ?? existingBooking.customerAmount ?? 0;
        const paymentCurrency =
          existingBooking.currency ?? existingBooking.customerCurrency ?? 'USD';

        // Determine capture method for this provider
        let captureMethod: 'automatic' | 'manual' | undefined;
        try {
          const pKey =
            existingBooking.provider ?? input.provider ?? 'hotelbeds';
          const p = this.providerRegistry.getProvider(pKey);
          if (
            !p.capabilities.requiresInstantPayment &&
            !p.capabilities.supportsPrePaymentHold
          ) {
            captureMethod = 'manual';
          }
        } catch {
          captureMethod = undefined;
        }

        // Manual methods (bank_transfer / pay_later): PENDING row, no intent.
        if (isManualPaymentGateway(String(input.gateway))) {
          const manual = await this.createManualHoldPayment({
            bookingId: existingBooking.id,
            gateway: input.gateway as PaymentGateway,
            amount: paymentAmount,
            currency: paymentCurrency,
          });
          return {
            bookingId: existingBooking.id,
            paymentId: manual.paymentId,
            amount: paymentAmount,
            currency: paymentCurrency,
            clientSecret: null,
            checkoutUrl: null,
            paymentMethod: input.gateway,
            message:
              'Booking held — complete payment or wait for admin verification.',
          };
        }

        const paymentIntent = await this.createPaymentIntentUseCase.execute({
          bookingId: existingBooking.id,
          bookingType: BookingType.HOTEL,
          gateway: input.gateway,
          amount: paymentAmount,
          currency: paymentCurrency,
          captureMethod,
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          customerId: input.customerId,
        });

        return {
          bookingId: existingBooking.id,
          paymentId: paymentIntent.paymentId,
          amount: paymentAmount,
          currency: paymentCurrency,
          clientSecret: paymentIntent.clientSecret ?? null,
          checkoutUrl: paymentIntent.checkoutUrl ?? null,
        };
      }
    }

    // Agent eligibility gate (unified pipeline Phase 9) — every agent
    // checkout (wallet OR card) passes the same checks the legacy delegate ran.
    if (opts?.userType === 'AGENT' && opts.agentProfileId && userId) {
      await this.walletService.validateAgentBookingPermission(
        opts.agentProfileId,
        userId,
        'hotel',
        { provider: input.provider ?? 'hotelbeds', gateway: input.gateway ? String(input.gateway) : undefined },
      );
    }

    // ── Agent wallet/credit branch (unified pipeline Phase 5) ──
    // Agents pay from wallet + credit via the reserve-commit hold pattern;
    // guests/customers keep the gateway PaymentIntent flow below, unchanged.
    if (opts?.userType === 'AGENT' && opts.agentProfileId && input.paymentMethod !== 'gateway') {
      const agentPreview = await this.preview(input, userId, opts);
      const effectivePrice = agentPreview.amount;

      // Reserve: wallet + credit check under FOR UPDATE lock, hold created.
      const hold = await this.walletService.reserveHoldForBooking(
        opts.agentProfileId,
        effectivePrice,
        'hotel',
        agentPreview.currency ?? undefined,
      );

      try {
        // Link the hold to the booking for the deduction phase.
        await this.prisma.walletHold.update({
          where: { id: hold.id },
          data: { bookingId: agentPreview.bookingId },
        });

        // Same event the agent path fires today: HotelPaymentListener claims
        // the pending_payment booking and runs the supplier workflow; wallet
        // is deducted on booking.supplier_confirmed by finalizeSupplierConfirmedBooking.
        const paymentSucceededPayload = {
          paymentId: `wallet-${agentPreview.bookingId}`,
          paymentMethod: 'wallet',
          bookingId: agentPreview.bookingId,
          bookingType: 'HOTEL',
          amount: effectivePrice,
          currency: agentPreview.currency ?? 'USD',
        };
        const eventId = await this.outboxWriter.write({
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: agentPreview.bookingId,
          idempotencyKey: `agent-wallet-payment-authorized:${agentPreview.bookingId}`,
          payload: paymentSucceededPayload,
        });
        this.immediateDispatcher.dispatch({
          id: eventId,
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: agentPreview.bookingId,
          idempotencyKey: `agent-wallet-payment-authorized:${agentPreview.bookingId}`,
          payload: paymentSucceededPayload,
        });

        return {
          bookingId: agentPreview.bookingId,
          paymentId: paymentSucceededPayload.paymentId,
          amount: effectivePrice,
          currency: agentPreview.currency ?? 'USD',
          paymentMethod: 'wallet',
          holdId: hold.id,
          walletDeducted: 0,
          message: 'Pending supplier confirmation — wallet will be deducted on success.',
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
    if (opts?.userType === 'CUSTOMER' && userId && input.paymentMethod === 'wallet') {
      const customerPreview = await this.preview(input, userId, opts);
      const customerPrice = customerPreview.amount;

      const hold = await this.customerWalletService.reserveHoldForBooking(
        userId,
        customerPrice,
        'hotel',
        customerPreview.currency ?? undefined,
      );

      try {
        await this.prisma.walletHold.update({
          where: { id: hold.id },
          data: { bookingId: customerPreview.bookingId },
        });

        const paymentSucceededPayload = {
          paymentId: `wallet-${customerPreview.bookingId}`,
          paymentMethod: 'wallet',
          bookingId: customerPreview.bookingId,
          bookingType: 'HOTEL',
          amount: customerPrice,
          currency: customerPreview.currency ?? 'USD',
        };
        const eventId = await this.outboxWriter.write({
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: customerPreview.bookingId,
          idempotencyKey: `customer-wallet-payment-authorized:${customerPreview.bookingId}`,
          payload: paymentSucceededPayload,
        });
        this.immediateDispatcher.dispatch({
          id: eventId,
          eventType: 'payment.succeeded',
          aggregateType: 'Booking',
          aggregateId: customerPreview.bookingId,
          idempotencyKey: `customer-wallet-payment-authorized:${customerPreview.bookingId}`,
          payload: paymentSucceededPayload,
        });

        return {
          bookingId: customerPreview.bookingId,
          paymentId: paymentSucceededPayload.paymentId,
          amount: customerPrice,
          currency: customerPreview.currency ?? 'USD',
          paymentMethod: 'wallet',
          holdId: hold.id,
          walletDeducted: 0,
          message: 'Pending supplier confirmation — wallet will be deducted on success.',
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

    const previewResult = await this.preview(input, userId, opts);

    // ALWAYS use the server-computed price from preview — never trust totalPrice from frontend.
    // preview() derives the stay total (provider rate × nights for per-night
    // providers), so this is already the TOTAL stay price.
    const paymentAmount = previewResult.amount;
    const paymentCurrency = previewResult.currency;

    // Determine capture method from provider capabilities:
    //   automatic — capture immediately (RateHawk: requiresInstantPayment)
    //   manual    — authorize-only, capture after supplier confirms (Hotelbeds)
    let captureMethod: 'automatic' | 'manual' | undefined;
    try {
      const pKey = input.provider ?? 'hotelbeds';
      const p = this.providerRegistry.getProvider(pKey);
      if (
        !p.capabilities.requiresInstantPayment &&
        !p.capabilities.supportsPrePaymentHold
      ) {
        captureMethod = 'manual';
      }
    } catch {
      captureMethod = undefined;
    }

    // Manual methods (bank_transfer / pay_later): PENDING row, no intent.
    if (isManualPaymentGateway(String(input.gateway))) {
      const manual = await this.createManualHoldPayment({
        bookingId: previewResult.bookingId,
        gateway: input.gateway as PaymentGateway,
        amount: paymentAmount,
        currency: paymentCurrency,
      });
      return {
        bookingId: previewResult.bookingId,
        paymentId: manual.paymentId,
        amount: paymentAmount,
        currency: paymentCurrency,
        displayAmount: (previewResult as any).displayAmount ?? paymentAmount,
        displayCurrency:
          (previewResult as any).displayCurrency ?? paymentCurrency,
        displayExchangeRate: (previewResult as any).displayExchangeRate ?? null,
        clientSecret: null,
        checkoutUrl: null,
        paymentMethod: input.gateway,
        message:
          'Booking held — complete payment or wait for admin verification.',
      };
    }

    try {
      const paymentIntent = await this.createPaymentIntentUseCase.execute({
        bookingId: previewResult.bookingId,
        bookingType: BookingType.HOTEL,
        gateway: input.gateway,
        amount: paymentAmount,
        currency: paymentCurrency,
        captureMethod,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        customerId: input.customerId,
      });

      return {
        bookingId: previewResult.bookingId,
        paymentId: paymentIntent.paymentId,
        amount: paymentAmount,
        currency: paymentCurrency,
        displayAmount: (previewResult as any).displayAmount ?? paymentAmount,
        displayCurrency:
          (previewResult as any).displayCurrency ?? paymentCurrency,
        displayExchangeRate: (previewResult as any).displayExchangeRate ?? null,
        clientSecret: paymentIntent.clientSecret ?? null,
        checkoutUrl: paymentIntent.checkoutUrl ?? null,
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
   * Step 3: on payment success, confirm the booking with the supplier.
   *
   * Flow:
   *  1. Route by the provider that was used when this booking was created
   *  2. Re-validate rate to get fresh price
   *  3. Compare supplier amounts — reject if price changed >5%
   *  4. Generate deterministic partnerOrderId for idempotent retries
   *  5. Call provider.createBooking() to book with the supplier
   *  6. For async providers (RateHawk), poll checkBookingStatus until terminal state
   *  7. Retrieve confirmed booking details from the supplier
   *  8. Store supplier reference/status in provider-neutral fields
   *  9. Mark local booking as 'booked'
   *
   * On supplier failure after payment:
   *  - Sets status to 'failed_supplier_booking' (not 'booked' or generic 'failed')
   *  - Triggers payment refund via gateway
   *  - Stores supplier error details in workflowTrace
   */
  async confirm(bookingId: string) {
    try {
      return await this.confirmInternal(bookingId);
    } catch (err: unknown) {
      const faked = await this.tryFakeStaysConfirmation(bookingId, err);
      if (faked) return faked;
      throw err;
    }
  }

  /**
   * Demo fallback for Travelport Stays: when the supplier rejects the booking
   * for a fake-eligible owner (demo account or guest in demo mode; never the
   * real super admin), show a normal confirmed booking with a clearly-marked
   * fake reference instead of the failure. confirmInternal() has already
   * refunded any paid payment before throwing, so no real money is kept. The
   * real failure stays in workflowTrace.realFailure for admins.
   */
  private async isStaysFakeEligible(booking: {
    userId?: string;
  }): Promise<boolean> {
    let userEmail: string | undefined;
    if (booking.userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: booking.userId },
        select: { email: true },
      });
      userEmail = user?.email;
    }
    // Travelport Stays currently has very little real supplier inventory, so
    // — unlike the generic demo-list rule other providers use — everyone
    // except the real admin is fake-eligible here, gated only by
    // TRAVELPORT_FAKE_BOOKING_ENABLED. This function is only ever called for
    // provider === 'travelport-stays' bookings (see callers below).
    return isTravelportFakeEligible(userEmail);
  }

  /**
   * confirmInternal() persists the real failure (and refunds) before the demo
   * fallback settles the booking as a fake success. The success page polls in
   * between, sees a terminal failure and stops. For fake-eligible
   * Travelport Stays bookings report "still processing" during a short grace
   * period so the page keeps polling until the booking is settled.
   */
  private async isStaysFakeSettlementPending(booking: {
    provider?: string;
    status: string;
    updatedAt?: string | Date;
    userId?: string;
    supplierReference?: string | null;
    workflowTrace?: unknown;
  }): Promise<boolean> {
    if (booking.provider !== 'travelport-stays') return false;
    if (booking.status !== 'failed_supplier_booking') return false;
    if (
      isFakeLocatorCode(booking.supplierReference) ||
      (booking.workflowTrace as any)?.demoMode === true
    ) {
      return false;
    }
    const age = Date.now() - new Date(booking.updatedAt ?? 0).getTime();
    if (!(age >= 0 && age < 60_000)) return false;
    return this.isStaysFakeEligible(booking);
  }

  private async tryFakeStaysConfirmation(bookingId: string, err: unknown) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (
      !booking ||
      booking.provider !== 'travelport-stays' ||
      booking.status !== 'failed_supplier_booking' ||
      (booking.supplierReference &&
        !isFakeLocatorCode(booking.supplierReference))
    ) {
      return null;
    }

    if (await this.isStaysFakeEligible(booking)) {
      const reference = generateFakePnr('travelport-stays');
      const rs = (booking.rateSnapshot ?? {}) as Record<string, any>;
      const sp = (booking.supplierPayload ?? {}) as Record<string, any>;
      // The real supplier confirmation never happened, so hotelSnapshot is
      // empty — rebuild it from what we captured at booking time so the
      // success page and admin views show the hotel, room and stay dates.
      const hotelSnapshot = {
        name: rs.hotelName ?? null,
        checkIn: sp.checkIn ?? null,
        checkOut: sp.checkOut ?? null,
        rooms: rs.roomName
          ? [{ name: rs.roomName, rates: [{ boardName: rs.boardName ?? null }] }]
          : [],
      };
      await this.bookingRepo.update(bookingId, {
        status: 'booked',
        supplierReference: reference,
        supplierStatus: 'confirmed',
        supplierErrorCode: undefined,
        supplierErrorText: undefined,
        hotelSnapshot: booking.hotelSnapshot ?? (hotelSnapshot as any),
        message: 'Hotel booked successfully.',
        workflowTrace: withFakeBookingAudit(booking.workflowTrace, {
          status: 'failed_supplier_booking',
          message: err instanceof Error ? err.message : String(err),
        }) as any,
      });
      this.logger.warn(
        `[FakeBookingFallback] Stays booking ${bookingId} — supplier failure faked as success, fake reference ${reference}, payment already refunded`,
      );
      return {
        bookingId,
        status: 'booked',
        reference,
        message: 'Hotel booked successfully.',
        fresh: true,
      };
    }
    return null;
  }

  private async confirmInternal(bookingId: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');
    }

    if (booking.status === 'booked') {
      return {
        bookingId: booking.id,
        status: booking.status,
        reference: booking.supplierReference ?? booking.hotelbedsRef,
        message: 'Already booked.',
        fresh: false,
      };
    }

    if (booking.status === 'booking_in_progress') {
      return {
        bookingId: booking.id,
        status: booking.status,
        reference: booking.supplierReference ?? booking.hotelbedsRef,
        message: 'Booking confirmation is already in progress.',
        fresh: false,
      };
    }

    if (
      booking.status === 'cancelled' ||
      booking.status === 'cancellation_requested'
    ) {
      throw new BusinessError(
        'HOTELS_BOOKING_CANCELLED',
        'This booking has been cancelled and cannot be confirmed.',
      );
    }

    // Route by the provider that was used when this booking was created
    const providerKey = booking.provider ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(providerKey);

    let claimed = await this.bookingRepo.atomicClaimStatus(
      bookingId,
      'pending_payment',
      'booking_in_progress',
      'Hotel booking confirmation started.',
    );
    if (!claimed) {
      // Auto-Issue After Payment was off when payment succeeded — the admin
      // clicking Issue now is the first real confirm attempt, from
      // 'awaiting_issue' rather than 'pending_payment'.
      claimed = await this.bookingRepo.atomicClaimStatus(
        bookingId,
        'awaiting_issue',
        'booking_in_progress',
        'Hotel booking confirmation started (admin issue after manual hold).',
      );
    }
    if (!claimed) {
      const latest = await this.bookingRepo.findById(bookingId);
      if (latest?.status === 'booked') {
        return {
          bookingId: latest.id,
          status: latest.status,
          reference: latest.supplierReference ?? latest.hotelbedsRef,
          message: 'Already booked.',
        };
      }
      if (latest?.status === 'booking_in_progress') {
        return {
          bookingId: latest.id,
          status: latest.status,
          reference: latest.supplierReference ?? latest.hotelbedsRef,
          message: 'Booking confirmation is already in progress.',
        };
      }
      throw new BusinessError(
        'HOTELS_BOOKING_ALREADY_PROCESSED',
        `Cannot confirm hotel booking in status: ${latest?.status ?? 'unknown'}.`,
      );
    }

    await this.bookingRepo.update(bookingId, {
      workflowTrace: {
        ...((booking.workflowTrace ?? {}) as object),
        confirmationStartedAt: new Date().toISOString(),
      } as any,
    });

    try {
      // Step 1: Re-validate the rate to get the latest price + a FRESH
      // booking token. Prebook/checkrate hashes expire (especially RateHawk
      // sandbox), so always re-prebook at confirm instead of reusing the
      // preview-time token.
      const isRatehawk = provider.key === 'ratehawk';

      // RateHawk's prebook expects the ORIGINAL hotelpage hash (stored in
      // supplierRateId / rateKey) — the preview `prebookToken` is a p- prefixed
      // book_hash that only booking/finish accepts after a fresh prebook.
      const validateRateId = isRatehawk
        ? (booking.supplierRateId ?? booking.rateKey)
        : (booking.prebookToken ?? booking.supplierRateId ?? booking.rateKey);

      let rateId = validateRateId;
      let freshNet = booking.supplierAmount ?? 0;
      let freshCurrency = booking.supplierCurrency ?? 'EUR';

      // Travelport Stays needs providerHotelId + stay dates to re-validate
      // (see preview()'s supplierPayload note) — stashed there since the
      // booking record has no dedicated checkIn/checkOut column.
      const stashedDates = (booking.supplierPayload ?? {}) as {
        checkIn?: string;
        checkOut?: string;
      };
      const validatedRate = await provider.validateRate({
        rateId: validateRateId,
        searchKey: booking.searchKey ?? undefined,
        providerHotelId: booking.providerHotelId ?? undefined,
        checkIn: stashedDates.checkIn,
        checkOut: stashedDates.checkOut,
      });

      freshNet = validatedRate.supplierAmount;
      freshCurrency = validatedRate.supplierCurrency ?? 'EUR';

      // Use the fresh token returned by prebook/checkrate — this is the value
      // the supplier accepts on the final booking call.
      if (validatedRate.prebookToken) {
        rateId = validatedRate.prebookToken;
        await this.bookingRepo.update(bookingId, {
          prebookToken: validatedRate.prebookToken,
          prebookExpiresAt: validatedRate.prebookExpiresAt ?? null,
        });
      } else if (
        validatedRate.rateId &&
        validatedRate.rateId !== validateRateId
      ) {
        rateId = validatedRate.rateId;
      }

      const currency = booking.supplierCurrency ?? 'EUR';

      // Step 2: Compare supplier amounts (not customer amounts)
      const storedSupplierAmount = booking.supplierAmount ?? booking.amount;
      const priceDiff = storedSupplierAmount
        ? Math.abs(freshNet - storedSupplierAmount)
        : 0;
      const priceDiffPercent =
        storedSupplierAmount && storedSupplierAmount > 0
          ? (priceDiff / storedSupplierAmount) * 100
          : 0;

      this.logger.log(
        `[CONFIRM] booking=${bookingId} provider=${provider.key} stored=${storedSupplierAmount} fresh=${freshNet} diff%=${priceDiffPercent.toFixed(2)}`,
      );

      if (
        storedSupplierAmount &&
        storedSupplierAmount > 0 &&
        priceDiffPercent > 5
      ) {
        await this.bookingRepo.update(bookingId, {
          status: 'failed',
          message: `Price changed by ${priceDiffPercent.toFixed(1)}% (was ${storedSupplierAmount}, now ${freshNet}).`,
        });
        throw new BusinessError(
          'HOTELS_RATE_PRICE_CHANGED',
          `Room rate changed from ${storedSupplierAmount} to ${freshNet} (${priceDiffPercent.toFixed(1)}% difference). Please rebook at the current rate.`,
          undefined,
          {
            storedAmount: storedSupplierAmount,
            currentAmount: freshNet,
            diffPercent: +priceDiffPercent.toFixed(1),
          },
        );
      }

      // Step 3: Update with fresh rate info before booking.
      // Also refresh cancellationPolicies from the fresh validation so the
      // stored snapshot matches what the customer saw at checkout — keeps
      // detail/checkout/success pages consistent (same validated policy set).
      const freshPolicies = extractCancellationPolicies(validatedRate);
      await this.bookingRepo.update(bookingId, {
        supplierRateId: rateId,
        rateKey: rateId,
        supplierAmount: freshNet,
        priceSnapshot: {
          ...((booking.priceSnapshot ?? {}) as object),
          recheckedAt: new Date().toISOString(),
          recheckedAmount: freshNet,
        },
        rateSnapshot: {
          ...((booking.rateSnapshot ?? {}) as object),
          recheckedAt: new Date().toISOString(),
          recheckedAmount: freshNet,
          ...(freshPolicies?.length
            ? { cancellationPolicies: freshPolicies }
            : {}),
        },
      });

      // Step 4: Determine if this is an async provider (RateHawk) that needs idempotency key
      const isAsyncProvider = provider.key === 'ratehawk';

      // Generate deterministic partnerOrderId only for async providers (RateHawk)
      // Hotelbeds uses the real booking reference returned by createBooking
      let partnerOrderId: string | null = null;
      if (isAsyncProvider) {
        partnerOrderId = booking.partnerOrderId ?? `hotel_${booking.id}`;
        await this.bookingRepo.update(bookingId, { partnerOrderId });
      }

      // Step 5: Create booking with the supplier
      const roomOccupancy = (booking.rateSnapshot ??
        booking.priceSnapshot ??
        {}) as {
        roomAdults?: number;
        roomChildren?: number;
      };

      const userIp = (booking.supplierPayload as { userIp?: string } | null)
        ?.userIp;

      const tolerance = this.configService.hotelbeds.tolerancePercent ?? 5;

      const createResult = await provider.createBooking({
        rateId,
        holder: booking.holder as any,
        clientReference: booking.clientReference,
        paxes: booking.paxes as any,
        roomAdults: roomOccupancy.roomAdults ?? 1,
        roomChildren: roomOccupancy.roomChildren ?? 0,
        tolerance,
        partnerOrderId: partnerOrderId ?? undefined,
        userIp,
      });

      if (!createResult.booking?.reference) {
        throw new Error('No booking reference returned from supplier.');
      }

      // Extract RateHawk-specific identifiers from provider result
      let etgOrderId: string | null = null;
      let etgItemId: string | null = null;
      if (isAsyncProvider) {
        const createRaw = createResult.raw as
          | Record<string, unknown>
          | undefined;
        etgOrderId = (createRaw?.etgOrderId as string) ?? null;
        etgItemId = (createRaw?.etgItemId as string) ?? null;
      }

      // Determine supplierReference based on provider type:
      //   RateHawk → real ETG order_id (used for display, retrieve, cancel)
      //   Hotelbeds → real booking reference from createResult.booking.reference
      const supplierReference = isAsyncProvider
        ? (etgOrderId ?? partnerOrderId!)
        : createResult.booking.reference;

      if (isAsyncProvider) {
        await this.bookingRepo.update(bookingId, {
          supplierReference: etgOrderId ?? partnerOrderId!,
          supplierOrderId: etgOrderId,
          supplierItemId: etgItemId,
        });
      } else {
        // For Hotelbeds, store the real reference in both supplierReference and hotelbedsRef
        await this.bookingRepo.update(bookingId, {
          supplierReference,
          hotelbedsRef: supplierReference,
          hotelConfirmationNumber:
            (createResult.raw as any)?.confirmationNumber ?? null,
        });
      }

      // For RateHawk (async provider): if booking_finish returned an ETG order ID,
      // the booking is accepted by the supplier. Mark as 'booked' immediately —
      // the hotel confirmation number (HCN) arrives later via webhook/background sync.
      // Do NOT hold the booking as 'booking_in_progress' waiting for a webhook;
      // the customer should see success as soon as the supplier accepts the order.
      if (isAsyncProvider) {
        if (etgOrderId) {
          // Supplier accepted the order — mark as booked, HCN pending
          const now = new Date();
          await this.bookingRepo.update(bookingId, {
            status: 'booked',
            supplierStatus: 'accepted',
            hotelConfirmationStatus: 'pending',
            hotelConfirmationNextCheckAt: new Date(
              now.getTime() + 15 * 60 * 1000,
            ),
            hotelConfirmationAttempts: 0,
            workflowTrace: {
              ...((booking.workflowTrace ?? {}) as object),
              bookingCreatedAt: now.toISOString(),
              supplierReference,
              statusSource: 'booking_finish_accepted',
              etgOrderId,
              etgItemId,
            } as any,
            message:
              'Booking accepted by RateHawk. Hotel confirmation number is pending.',
          });

          return {
            bookingId: booking.id,
            status: 'booked',
            reference: supplierReference,
            message:
              'Booking accepted by RateHawk. Hotel confirmation number is pending.',
            fresh: true,
          };
        }

        // No ETG order ID — supplier is still processing, keep as in-progress
        // until fallback status check or webhook confirms.
        const now = new Date();
        await this.bookingRepo.update(bookingId, {
          status: 'booking_in_progress',
          supplierStatus: 'processing',
          hotelConfirmationNextCheckAt: new Date(
            now.getTime() + 15 * 60 * 1000,
          ),
          hotelConfirmationAttempts: 0,
          workflowTrace: {
            ...((booking.workflowTrace ?? {}) as object),
            bookingCreatedAt: now.toISOString(),
            supplierReference,
            etgOrderId: null,
            etgItemId: null,
          } as any,
          message: 'Booking submitted to supplier. Awaiting processing.',
        });

        return {
          bookingId: booking.id,
          status: 'booking_in_progress',
          reference: supplierReference,
          message: 'Booking submitted to supplier. Awaiting processing.',
          fresh: true,
        };
      }

      // ── Hotelbeds (sync) flow: retrieve + confirm immediately ──

      // Retrieve confirmed booking details from the supplier
      let retrievedDetails = createResult;
      try {
        retrievedDetails = await provider.retrieveBooking({
          reference: supplierReference,
        });
      } catch (retrieveError: unknown) {
        this.logger.warn(
          `[CONFIRM] retrieveBooking failed for ${supplierReference}: ${retrieveError instanceof Error ? retrieveError.message : 'unknown error'}`,
        );
      }

      const bookingData = retrievedDetails.booking ?? createResult.booking;
      const finalStatus = (bookingData.status ?? 'confirmed').toLowerCase();
      const successStates = ['confirmed', 'booked', 'ok'];
      const failedStates = ['failed', 'error', 'cancelled'];

      if (failedStates.includes(finalStatus)) {
        await this.bookingRepo.update(bookingId, {
          status: 'failed_supplier_booking',
          supplierStatus: finalStatus,
          supplierErrorText: `Supplier booking returned status: ${finalStatus}`,
          workflowTrace: {
            ...((booking.workflowTrace ?? {}) as object),
            supplierFinalStatus: finalStatus,
            supplierBookingFailedAt: new Date().toISOString(),
          } as any,
          message: `Supplier booking failed with status: ${finalStatus}. Refund initiated.`,
        });

        await this.triggerRefund(bookingId);

        throw new BusinessError(
          'HOTELS_SUPPLIER_BOOKING_FAILED',
          `Supplier booking failed with status: ${finalStatus}. A refund has been initiated.`,
          undefined,
          { supplierReference, supplierStatus: finalStatus },
        );
      }

      const now = new Date();
      await this.bookingRepo.update(bookingId, {
        status: 'booked',
        supplierStatus: bookingData.status ?? 'confirmed',
        hotelSnapshot: bookingData.hotel ?? null,
        priceSnapshot: bookingData.price ?? null,
        message: 'Hotel booked successfully.',
      });

      // For manual capture payments, capture the authorization now
      await this.captureIfManualCapture(bookingId);

      return {
        bookingId: booking.id,
        status: 'booked',
        reference: supplierReference,
        hotelSnapshot: bookingData.hotel ?? null,
        price: bookingData.price ?? null,
        fresh: true,
      };
    } catch (error: any) {
      // If the error is already a BusinessError from supplier failure, mark
      // the booking failed + trigger refund BEFORE re-throwing. Otherwise the
      // booking stays stuck in 'booking_in_progress' and the success page
      // polls forever.
      if (error instanceof BusinessError) {
        await this.bookingRepo
          .update(bookingId, {
            status: 'failed_supplier_booking',
            message:
              error.message ??
              'Hotel booking failed at the supplier. Your payment has been refunded.',
            workflowTrace: {
              ...((booking.workflowTrace ?? {}) as object),
              failedAt: new Date().toISOString(),
              error: error.message,
            } as any,
          })
          .catch(() => {});
        await this.triggerRefund(bookingId).catch(() => {});
        throw error;
      }

      const msg = error?.message || 'Hotel booking failed.';
      this.logger.error(
        `[CONFIRM] Booking ${bookingId} failed: ${msg}`,
        JSON.stringify(
          {
            errorName: error?.name,
            errorMessage: error?.message,
            upstreamDetails:
              error?.response?.details ??
              error?.response?.data ??
              error?.details ??
              null,
            stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
          },
          null,
          2,
        ),
      );

      // Extract real upstream error for admin/support visibility
      // For NestJS BadGatewayException, the error shape is:
      //   { response: { code, message, details: { upstreamStatus, upstreamResponse: { error: { code, message } } } } }
      // For plain HTTP errors from axios, the shape is:
      //   { response: { data: { error: { code, message } } } }
      const errorResponse =
        error?.response?.details?.upstreamResponse ??
        error?.response?.data ??
        error?.response?.details ??
        error?.details ??
        null;
      const supplierErrorCode =
        errorResponse?.error?.code ??
        errorResponse?.code ??
        (typeof error?.status === 'number' ? 'HTTP_ERROR' : null) ??
        null;
      const supplierErrorText =
        errorResponse?.error?.message ??
        errorResponse?.message ??
        errorResponse?.description ??
        msg;

      // Friendly customer-facing message
      const customerFacingMsg =
        supplierErrorCode === 'PRODUCT_ERROR'
          ? 'The hotel price changed before supplier confirmation. Your payment has been refunded. Please search again.'
          : supplierErrorCode === 'SYSTEM_ERROR'
            ? 'The hotel booking system is temporarily unavailable. Your payment has been refunded.'
            : `Hotel booking failed (${supplierErrorCode ?? 'UNKNOWN'}). Your payment has been refunded.`;

      await this.bookingRepo.update(bookingId, {
        status: 'failed_supplier_booking',
        message: customerFacingMsg,
        supplierErrorCode: supplierErrorCode ?? undefined,
        supplierErrorText: supplierErrorText ?? msg,
        workflowTrace: {
          ...((booking.workflowTrace ?? {}) as object),
          failedAt: new Date().toISOString(),
          supplierErrorCode,
          supplierErrorText,
          error: msg,
          errorResponse,
        } as any,
      });

      // Trigger refund on unexpected failure after payment
      await this.triggerRefund(bookingId);

      throw new BusinessError(
        'HOTELS_SUPPLIER_BOOKING_FAILED',
        msg,
        undefined,
        {
          upstream:
            error?.response?.details ??
            error?.response?.data ??
            error?.details ??
            null,
        },
      );
    }
  }

  /**
   * Trigger a refund for a booking that failed after payment was captured.
   */
  private async captureIfManualCapture(bookingId: string): Promise<void> {
    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];
    if (
      !payment ||
      payment.captureMethod !== 'manual' ||
      payment.status !== PaymentStatus.AUTHORIZED
    ) {
      return;
    }
    try {
      const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
      if (gateway.capturePayment) {
        await gateway.capturePayment(payment.providerPaymentId!);
      }
      payment.status = PaymentStatus.PAID;
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
      this.logger.log(
        `[CAPTURE] Captured payment ${payment.id} for booking ${bookingId}`,
      );
    } catch (captureError: unknown) {
      const msg =
        captureError instanceof Error ? captureError.message : 'unknown error';
      this.logger.error(
        `[CAPTURE] Capture failed for payment on booking ${bookingId}: ${msg}`,
      );
    }
  }

  private async triggerRefund(bookingId: string): Promise<void> {
    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];

    if (!payment || payment.status !== PaymentStatus.PAID) {
      // Manual capture: payment is AUTHORIZED but not yet PAID — cancel the hold instead
      if (payment && payment.status === PaymentStatus.AUTHORIZED) {
        try {
          const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
          if (gateway.cancelPayment) {
            await gateway.cancelPayment(payment.providerPaymentId!);
          }
          payment.status = PaymentStatus.CANCELLED;
          payment.updatedAt = new Date();
          await this.paymentRepository.update(payment);
          this.logger.log(
            `[CANCEL] Cancelled authorization for payment ${payment.id} on booking ${bookingId}`,
          );
        } catch (cancelError: unknown) {
          const cancelMsg =
            cancelError instanceof Error
              ? cancelError.message
              : 'unknown error';
          this.logger.error(
            `[CANCEL] Authorization cancellation failed for payment on booking ${bookingId}: ${cancelMsg}`,
          );
          await this.bookingRepo
            .update(bookingId, {
              workflowTrace: {
                cancelFailedAt: new Date().toISOString(),
                cancelError: cancelMsg,
              } as any,
            })
            .catch(() => undefined);
        }
      }
      return; // Nothing to refund
    }

    try {
      const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
      if (gateway.refundPayment) {
        await gateway.refundPayment(payment.providerPaymentId!);
      }
      payment.status = PaymentStatus.REFUNDED;
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
      this.logger.log(
        `[REFUND] Refunded payment ${payment.id} for booking ${bookingId}`,
      );
    } catch (refundError: unknown) {
      const refundMsg =
        refundError instanceof Error ? refundError.message : 'unknown error';
      this.logger.error(
        `[REFUND] Refund failed for payment on booking ${bookingId}: ${refundMsg}`,
      );
      // Store refund failure in workflow for manual review
      await this.bookingRepo
        .update(bookingId, {
          workflowTrace: {
            refundFailedAt: new Date().toISOString(),
            refundError: refundMsg,
          } as any,
        })
        .catch(() => undefined);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private addMinutes(date: Date, minutes: number): Date {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + minutes);
    return d;
  }

  /**
   * Cancel a booking — handles local cancellation and supplier cancellation
   * for confirmed bookings.
   */
  async cancelBooking(bookingId: string, reason?: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');

    // Control surface: agent-owned bookings need agent:cancel_bookings even
    // on the public path.
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
      'booking_in_progress',
      'booked',
      'failed_supplier_booking',
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BusinessError(
        'HOTELS_BOOKING_NOT_CANCELLABLE',
        `Hotel booking cannot be cancelled in status: ${booking.status}.`,
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

    // For confirmed bookings, attempt supplier cancellation first
    // Also attempt cancellation for failed_supplier_booking (cleanup stale supplier state)
    // Demo-cancel mode only skips the supplier call for demo bookings (demo-user emails),
    // real bookings ALWAYS reach the supplier.
    const demoEmails = (process.env.DEMO_MODE_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const holderEmail = String(
      (booking.holder as any)?.email ?? booking.clientReference ?? '',
    ).toLowerCase();
    const isDemoBooking =
      demoEmails.length > 0 && demoEmails.includes(holderEmail);
    const isDemoCancel =
      (process.env.ENABLE_DEMO_CANCEL === 'true' && isDemoBooking) ||
      isFakeLocatorCode(booking.supplierReference);

    if (
      !isDemoCancel &&
      (booking.status === 'booked' ||
        booking.status === 'failed_supplier_booking') &&
      (booking.supplierReference ?? booking.hotelbedsRef)
    ) {
      // Never throws — provider failures are captured in the return value.
      await this.cancelSupplier(bookingId, reason);
    }

    // Re-load booking to get updated workflowTrace with cancel result
    const updatedBooking = await this.bookingRepo.findById(bookingId);

    // Handle payment refund / cancellation
    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];

    // Wallet-paid customer booking (no gateway Payment row): base the
    // fee math on the wallet charge instead of a payment row.
    let walletDeduct: { userId: string; amount: number; currency: string } | null = null;
    let paidAmount =
      payment?.status === PaymentStatus.PAID
        ? Number(
            payment.amount ?? updatedBooking?.amount ?? booking.amount ?? 0,
          )
        : 0;
    if (!payment) {
      try {
        walletDeduct = await this.customerWalletService.getWalletDeduct(bookingId);
      } catch (err: any) {
        this.logger.warn(`[CANCEL] Wallet deduct lookup failed for ${bookingId}: ${err?.message ?? err}`);
      }
      if (walletDeduct) paidAmount = walletDeduct.amount;
    }
    const chargeExchangeRate =
      Number((updatedBooking?.rateSnapshot as any)?.chargeExchangeRate) ||
      Number((booking.rateSnapshot as any)?.chargeExchangeRate) ||
      1;

    // Try to extract live policies from the cancel result (stored in workflowTrace)
    const workflowTrace =
      updatedBooking?.workflowTrace ?? booking.workflowTrace ?? {};
    const cancelResultRaw = workflowTrace?.cancellationResult?.raw;
    const livePolicies =
      cancelResultRaw?.booking?.hotel?.rooms?.[0]?.rates?.[0]
        ?.cancellationPolicies;

    // Use live policies if available, otherwise fall back to snapshot
    const policiesToUse = livePolicies?.length
      ? livePolicies.map((p: any) => ({
          amount: p.amount,
          from: p.from,
          deadline: p.deadline,
          policyType: p.policyType,
          percentage: p.percentage,
          numberOfNights: p.numberOfNights,
        }))
      : ((updatedBooking?.rateSnapshot as any)?.cancellationPolicies ??
        (booking.rateSnapshot as any)?.cancellationPolicies ??
        []);

    const feeResult = computeHotelCancellationFee(
      policiesToUse,
      paidAmount,
      new Date(),
      chargeExchangeRate,
    );
    const cancellationFee = paidAmount > 0 ? feeResult.cancellationFee : 0;
    const refundAmount = paidAmount > 0 ? feeResult.refundAmount : 0;

    if (payment) {
      if (payment.status === PaymentStatus.PAID) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.refundPayment) {
          if (refundAmount > 0) {
            // Partial refund: paid amount minus supplier cancellation fee
            await gateway.refundPayment(
              payment.providerPaymentId!,
              refundAmount,
              payment.currency,
            );
          }
        }
        payment.status = PaymentStatus.REFUNDED;
      } else if (
        payment.status === PaymentStatus.PENDING ||
        payment.status === PaymentStatus.AUTHORIZED
      ) {
        const gateway = this.paymentOrchestrator.getGateway(payment.gateway);
        if (gateway.cancelPayment) {
          await gateway.cancelPayment(payment.providerPaymentId!);
        }
        payment.status = PaymentStatus.CANCELLED;
      }
      payment.updatedAt = new Date();
      await this.paymentRepository.update(payment);
    } else if (!payment) {
      // No gateway Payment row → possibly wallet-paid: refund net amount
      // to the customer wallet (or release a not-yet-deducted hold).
      try {
        const refunded = await this.customerWalletService.refundWalletBooking(
          bookingId,
          refundAmount > 0 ? refundAmount : undefined,
          walletDeduct?.currency,
          `Refund for hotel booking ${bookingId.slice(0, 8).toUpperCase()} (fee ${cancellationFee} applied)`,
        );
        if (!refunded) await this.customerWalletService.releaseHoldForBooking(bookingId);
      } catch (err: any) {
        this.logger.warn(`[CANCEL] Customer wallet refund failed for ${bookingId}: ${err?.message ?? err}`);
      }
    }

    // Update local booking status
    const updateData: Record<string, any> = {
      status: 'cancelled',
      message: reason ?? 'Cancelled by user.',
      workflowTrace: {
        ...((booking.workflowTrace ?? {}) as object),
        cancellationFee,
        refundAmount,
        isFreeCancellation: feeResult.isFreeCancellation,
        cancellationPolicyDescription: feeResult.policyDescription,
      },
    };

    await this.bookingRepo.update(bookingId, updateData as any);

    // Notification: hotel booking cancelled
    try {
      const eventId = randomUUID();
      await this.outboxWriter.write({
        idempotencyKey: eventId,
        eventType: 'booking.cancelled',
        aggregateType: 'Booking',
        aggregateId: bookingId,
        payload: {
          bookingId,
          bookingType: 'HOTEL',
          reason: reason ?? 'Cancelled by user',
          userId: booking.userId,
          cancellationFee,
          refundAmount,
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
            bookingType: 'HOTEL',
            reason: reason ?? 'Cancelled by user',
            userId: booking.userId,
            cancellationFee,
            refundAmount,
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
      cancellationFee,
      refundAmount,
      isFreeCancellation: feeResult.isFreeCancellation,
      cancellationPolicyDescription: feeResult.policyDescription,
    };
  }

  /**
   * Cancel the booking at the supplier only. Does not touch local status,
   * payments, or promos. Never throws — failures are returned for the caller
   * to decide whether to continue with the local cancellation.
   */
  async cancelSupplier(bookingId: string, reason?: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');

    const reference =
      booking.supplierReference ??
      booking.hotelbedsRef ??
      booking.supplierOrderId;
    if (!reference) {
      return {
        supplierCancelled: false,
        reason: 'No supplier reference on booking.',
      };
    }
    if (isFakeLocatorCode(reference)) {
      return {
        supplierCancelled: false,
        reference,
        message: 'Demo booking — no supplier order exists, cancelled locally.',
      };
    }

    try {
      // Route by the provider that was used for this booking
      const provider = this.providerRegistry.getProvider(
        booking.provider ?? 'hotelbeds',
      );
      const cancelResult = await provider.cancelBooking({
        reference,
        reason,
      });

      const succeeded = cancelResult.status !== 'failed';
      await this.bookingRepo.update(bookingId, {
        supplierStatus: succeeded ? 'cancelled' : booking.supplierStatus,
        workflowTrace: {
          ...((booking.workflowTrace ?? {}) as object),
          cancellationRequestedAt: new Date().toISOString(),
          cancellationResult: cancelResult,
        } as any,
      });

      if (!succeeded) {
        this.logger.warn(
          `[CANCEL] Supplier cancellation reported failure for booking ${bookingId}: ${cancelResult.message}`,
        );
      }

      return {
        supplierCancelled: succeeded,
        reference,
        supplierStatus: cancelResult.status,
        message: cancelResult.message,
      };
    } catch (cancelError: unknown) {
      this.logger.warn(
        `[CANCEL] Supplier cancellation failed for booking ${bookingId}: ${cancelError instanceof Error ? cancelError.message : 'unknown error'}`,
      );
      return {
        supplierCancelled: false,
        reference,
        error:
          cancelError instanceof Error ? cancelError.message : 'unknown error',
      };
    }
  }

  /**
   * Pull the latest supplier booking state from the provider and persist it.
   * Admin panel uses this to reconcile supplier data without Postman.
   */
  async syncSupplierStatus(bookingId: string) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');

    const reference =
      booking.supplierReference ??
      booking.hotelbedsRef ??
      booking.supplierOrderId;
    if (!reference) {
      throw new BusinessError(
        'HOTELS_SUPPLIER_REFERENCE_MISSING',
        'This booking has no supplier reference to sync.',
      );
    }

    if (isFakeLocatorCode(reference)) {
      return {
        bookingId,
        reference,
        supplierStatus: booking.supplierStatus,
        message: 'Demo booking — no supplier order to sync.',
      };
    }

    const provider = this.providerRegistry.getProvider(
      booking.provider ?? 'hotelbeds',
    );
    const retrieved = await provider.retrieveBooking({ reference });

    const bookingData = (retrieved as any)?.booking ?? null;
    const supplierStatus = bookingData?.status ?? null;

    await this.bookingRepo.update(bookingId, {
      supplierStatus,
      hotelSnapshot: bookingData?.hotel ?? booking.hotelSnapshot,
      workflowTrace: {
        ...((booking.workflowTrace ?? {}) as object),
        supplierSyncedAt: new Date().toISOString(),
        supplierSyncSource: 'admin',
      } as any,
    });

    return {
      bookingId,
      reference,
      supplierStatus,
      supplierBooking: bookingData,
      localStatus: booking.status,
    };
  }

  /**
   * Change/edit a booked hotel (dates and/or holder) at the supplier.
   *
   * Flow:
   *  1. Load local booking + supplier reference.
   *  2. Retrieve live booking from the supplier.
   *  3. Verify the offer is changeable (modificationPolicies.modification).
   *  4. SIMULATION first to preview, then BOOKING to commit (when confirm=true).
   *  5. Persist the fresh supplier snapshot locally.
   */
  async changeBooking(
    bookingId: string,
    input: {
      checkIn?: string;
      checkOut?: string;
      holder?: { name?: string; surname?: string };
      confirm?: boolean;
    },
  ) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');

    if (booking.status !== 'booked') {
      throw new BusinessError(
        'HOTELS_BOOKING_NOT_CHANGEABLE',
        `Only confirmed bookings can be changed (current status: ${booking.status}).`,
      );
    }

    const reference =
      booking.supplierReference ??
      booking.hotelbedsRef ??
      booking.supplierOrderId;
    if (!reference) {
      throw new BusinessError(
        'HOTELS_SUPPLIER_REFERENCE_MISSING',
        'This booking has no supplier reference to change.',
      );
    }
    if (isFakeLocatorCode(reference)) {
      throw new BusinessError(
        'HOTELS_CHANGE_NOT_SUPPORTED',
        'Demo bookings cannot be modified — no supplier order exists.',
      );
    }

    const provider = this.providerRegistry.getProvider(
      booking.provider ?? 'hotelbeds',
    );
    if (!provider.changeBooking) {
      throw new BusinessError(
        'HOTELS_CHANGE_NOT_SUPPORTED',
        `Provider "${provider.key}" does not support booking changes.`,
      );
    }

    // Live retrieve → check modification policy.
    const retrieved = await provider.retrieveBooking({ reference });
    const bookingData = (retrieved as any)?.booking ?? null;
    const modificationAllowed = bookingData?.modificationAllowed ?? true;

    if (!modificationAllowed) {
      throw new BusinessError(
        'HOTELS_BOOKING_NOT_MODIFIABLE',
        'This offer is not changeable per the supplier modification policy.',
      );
    }

    const simulate = await provider.changeBooking({
      bookingId,
      reference,
      mode: 'SIMULATION',
      changes: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        holder: input.holder,
      },
    });

    if (!simulate.changeable || simulate.status === 'failed') {
      return {
        bookingId,
        reference,
        changeable: false,
        status: simulate.status,
        message: simulate.message ?? 'Supplier rejected the change simulation.',
        simulated: false,
      };
    }

    if (!input.confirm) {
      await this.bookingRepo.update(bookingId, {
        workflowTrace: {
          ...((booking.workflowTrace ?? {}) as object),
          changeSimulatedAt: new Date().toISOString(),
          changeSimulation: simulate,
        } as any,
      });
      return {
        bookingId,
        reference,
        changeable: true,
        status: simulate.status,
        message: 'Change simulated successfully. Confirm to commit.',
        simulated: true,
        booking: simulate.booking ?? null,
      };
    }

    // Re-simulate on confirm and use its re-priced payload as the commit base —
    // the original booking payload carries stale dates/net and Hotelbeds
    // rejects the BOOKING call with a 400 when the price no longer matches.
    const simForCommit = await provider.changeBooking({
      bookingId,
      reference,
      mode: 'SIMULATION',
      changes: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        holder: input.holder,
      },
    });
    if (!simForCommit.changeable || simForCommit.status === 'failed') {
      throw new BusinessError(
        'HOTELS_CHANGE_SIMULATION_FAILED',
        simForCommit.message ?? 'Supplier rejected the change simulation.',
      );
    }
    const simBase = (simForCommit.raw as any)?.booking ?? null;

    const committed = await provider.changeBooking({
      bookingId,
      reference,
      mode: 'BOOKING',
      changes: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        holder: input.holder,
      },
      baseBooking: simBase,
    });

    if (!committed.changeable || committed.status === 'failed') {
      throw new BusinessError(
        'HOTELS_CHANGE_FAILED',
        committed.message ?? 'Supplier rejected the booking change.',
      );
    }

    const committedBooking = (committed as any).booking ?? null;
    await this.bookingRepo.update(bookingId, {
      supplierStatus: committedBooking?.status ?? booking.supplierStatus,
      hotelSnapshot: committedBooking?.hotel ?? booking.hotelSnapshot,
      workflowTrace: {
        ...((booking.workflowTrace ?? {}) as object),
        changedAt: new Date().toISOString(),
        changeResult: committed,
      } as any,
      message: 'Booking changed successfully.',
    });

    return {
      bookingId,
      reference,
      changeable: true,
      status: committed.status,
      message: 'Booking changed successfully.',
      simulated: false,
      booking: committedBooking,
    };
  }

  /**
   * Estimate the cancellation fee and refund WITHOUT cancelling.
   * Used by dashboards to display the fee before the user confirms.
   *
   * Policy resolution order:
   *   1. LIVE supplier policies (fresh retrieve when a reference exists)
   *   2. Stored rateSnapshot policies (what the guest agreed to at booking)
   *   3. UNKNOWN — never fabricated: pre-payment bookings are genuinely free;
   *      confirmed bookings with no retrievable policy surface an explicit
   *      `policiesKnown:false` so admins see real supplier charges may apply.
   */
  async getCancelEstimate(bookingId: string, opts?: { refreshLive?: boolean }) {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');

    const cancellableStatuses = [
      'pending_payment',
      'booking_in_progress',
      'booked',
      'failed_supplier_booking',
    ];
    if (!cancellableStatuses.includes(booking.status)) {
      throw new BusinessError(
        'HOTELS_BOOKING_NOT_CANCELLABLE',
        `Hotel booking cannot be cancelled in status: ${booking.status}.`,
      );
    }

    const payments = await this.paymentRepository.findMany({ bookingId });
    const payment = payments?.[0];
    const fakeBooking =
      isFakeLocatorCode(booking.supplierReference) ||
      (booking.workflowTrace as any)?.demoMode === true;
    // A demo (fake-reference) booking's real payment was already refunded when
    // the supplier failed — estimate against the booking amount so the admin
    // still sees the stored policy applied to a meaningful figure.
    const paidAmount =
      payment?.status === PaymentStatus.PAID
        ? Number(payment.amount ?? booking.amount ?? 0)
        : fakeBooking
          ? Number(booking.amount ?? booking.customerAmount ?? 0)
          : 0;
    const currency = payment?.currency ?? booking.currency ?? 'USD';

    // Pre-payment bookings were never confirmed with the supplier — voiding
    // costs nothing. This "free" is genuine, not a missing-data fallback.
    const notYetBooked = ['pending_payment', 'failed_supplier_booking'].includes(
      booking.status,
    );
    const reference =
      booking.supplierReference ??
      booking.hotelbedsRef ??
      booking.supplierOrderId;

    let policies = (booking.rateSnapshot as any)?.cancellationPolicies as
      | HotelCancellationPolicyInput[]
      | undefined;
    let policySource: 'live' | 'snapshot' | 'none' = policies?.length
      ? 'snapshot'
      : 'none';

    // Live-first: refresh policies from the supplier when we can. Skipped
    // when the caller already serves a fast local path (admin detail).
    if (
      opts?.refreshLive !== false &&
      !notYetBooked &&
      !fakeBooking &&
      reference &&
      booking.provider
    ) {
      try {
        const provider = this.providerRegistry.getProvider(booking.provider);
        const live = await provider.retrieveBooking({ reference });
        const raw = (live as any)?.raw;
        const livePolicies: HotelCancellationPolicyInput[] | undefined =
          raw?.booking?.hotel?.rooms
            ?.flatMap((r: any) => r?.rates ?? [])
            ?.flatMap((r: any) => r?.cancellationPolicies ?? [])
            .filter(Boolean);
        if (livePolicies?.length) {
          policies = livePolicies;
          policySource = 'live';
          // Persist the live policies: the next estimate (or workspace)
          // reuses the stored snapshot instead of re-hitting the supplier.
          // Best-effort — never blocks the answer.
          this.bookingRepo
            .update(bookingId, {
              rateSnapshot: {
                ...((booking.rateSnapshot ?? {}) as Record<string, unknown>),
                cancellationPolicies: livePolicies,
              },
            } as any)
            .catch((e: unknown) =>
              this.logger.warn(
                `[CancelEstimate] Live-policy persist failed for ${bookingId}: ${e instanceof Error ? e.message : String(e)}`,
              ),
            );
        }
      } catch {
        // Live retrieve failed — fall through to snapshot/unknown handling.
      }
    }

    // No policy data at all on a CONFIRMED booking: never fabricate free/full.
    if (!policies?.length && !notYetBooked) {
      return {
        bookingId,
        bookingType: 'HOTEL' as const,
        status: booking.status,
        totalAmount: paidAmount,
        currency,
        policiesKnown: false,
        policySource: 'none' as const,
        policyDescription: null,
        message:
          'Supplier cancellation policy could not be retrieved. The supplier may still apply charges per its own policy — confirm before cancelling.',
        cancellationFee: null,
        refundAmount: null,
        isFreeCancellation: false,
        upcomingFee: undefined,
        upcomingFeeFrom: undefined,
        upcomingFeeDescription: undefined,
      };
    }

    const chargeExchangeRate =
      Number((booking.rateSnapshot as any)?.chargeExchangeRate) || 1;
    const feeResult = computeHotelCancellationFee(
      policies ?? [],
      paidAmount,
      new Date(),
      chargeExchangeRate,
    );

    return {
      bookingId,
      bookingType: 'HOTEL' as const,
      status: booking.status,
      totalAmount: paidAmount,
      currency,
      policiesKnown: true,
      policySource,
      cancellationFee: feeResult.cancellationFee,
      refundAmount: feeResult.refundAmount,
      isFreeCancellation: feeResult.isFreeCancellation,
      policyDescription: feeResult.policyDescription,
      upcomingFee: feeResult.upcomingFee,
      upcomingFeeFrom: feeResult.upcomingFeeFrom,
      upcomingFeeDescription: feeResult.upcomingFeeDescription,
    };
  }

  /**
   * The real Payment record's status (PENDING/AUTHORIZED/PAID/REFUNDED/
   * CANCELLED), for display alongside the booking's own status — the two are
   * independent: a booking can be `awaiting_issue` while payment already
   * shows PAID (Auto-Issue After Payment off).
   */
  private async resolvePaymentStatus(
    bookingId: string,
    supplierReference?: string | null,
  ): Promise<string | null> {
    try {
      const payments = await this.paymentRepository.findMany({ bookingId });
      let paymentStatus: string | null = payments?.[0]?.status ?? null;
      // ponytail temp: a fake-reference booking's payment row reads Paid for
      // instant gateways in admin/customer views. Real row keeps REFUNDED
      // truth. Remove with fake fallback.
      const demoPay = payments?.[0] as any;
      const demoGw = String(demoPay?.gateway ?? '').toUpperCase();
      const demoManual =
        demoGw.includes('BANK') ||
        demoGw.includes('PAY_LATER') ||
        demoGw.includes('PAYLATER') ||
        demoGw.includes('MANUAL');
      if (isFakeLocatorCode(supplierReference) && demoPay && !demoManual) {
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
      throw new BusinessError('HOTELS_BOOKING_NOT_FOUND', 'Booking not found.');
    }
    const trace = booking.workflowTrace ?? {};
    const settlementPending = await this.isStaysFakeSettlementPending(booking);
    const isSuccess = ['booked'].includes(booking.status);
    const isAwaitingIssue = booking.status === 'awaiting_issue';
    const isFailure =
      !settlementPending &&
      ['failed', 'failed_supplier_booking'].includes(booking.status);

    const title = isSuccess
      ? 'Booking confirmed'
      : isAwaitingIssue
        ? 'Payment received'
        : isFailure
          ? 'Booking failed'
          : 'Processing your booking';

    // Percent based on booking status, not just 0 or 100
    const percent = isSuccess || isAwaitingIssue
      ? 100
      : isFailure
        ? 100
        : booking.status === 'booking_in_progress' || settlementPending
          ? 65
          : booking.status === 'pending_payment'
            ? 15
            : booking.supplierStatus === 'accepted'
              ? 100
              : booking.supplierOrderId && !isSuccess
                ? 80
                : (trace.percent ?? 0);

    return {
      bookingId: id,
      module: 'hotels',
      provider: booking.provider,
      status: isSuccess
        ? 'success'
        : isAwaitingIssue
          ? 'awaiting_issue'
          : isFailure
            ? 'failed'
            : booking.status === 'booking_in_progress' ||
                booking.status === 'pending_payment' ||
                settlementPending
              ? 'running'
              : 'idle',
      percent,
      title,
      message: settlementPending
        ? undefined
        : isAwaitingIssue
          ? 'Payment verified. Your booking will be confirmed shortly.'
          : booking.status === 'failed_supplier_booking'
            ? 'The supplier could not confirm this booking. Our team will review it.'
            : (trace.message ?? undefined),
      customerMessage: this.getCustomerFacingMessage(
        settlementPending ? 'booking_in_progress' : booking.status,
        booking.provider,
      ),
      paymentStatus: await this.resolvePaymentStatus(
        id,
        booking.supplierReference ?? booking.hotelbedsRef,
      ),
      adminTrace: this.sanitizeTraceForCustomer(trace),
      steps: trace.steps ?? [],
    };
  }

  /**
   * Attach a bank-transfer receipt URL (admin verifies in the workspace,
   * then Issues or Cancels). Receipts are meaningless once booked.
   */
  async attachReceipt(
    bookingId: string,
    receiptUrl: string,
  ): Promise<{ bookingId: string; receiptUrl: string }> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');
    }
    const status = (booking.status ?? '').toLowerCase();
    if (['booked', 'confirmed', 'cancelled', 'refunded'].includes(status)) {
      throw new BusinessError(
        'HOTELS_RECEIPT_INVALID_STATE',
        `Receipts cannot be attached in status=${booking.status}.`,
      );
    }
    const payments = await this.paymentRepository.findMany({ bookingId });
    if (!payments.some((p) => String(p.gateway).toUpperCase() === 'BANK_TRANSFER')) {
      throw new BusinessError(
        'HOTELS_RECEIPT_INVALID_STATE',
        'Receipts can only be attached to bank transfer bookings.',
      );
    }
    await this.bookingRepo.update(bookingId, {
      receiptUrl,
      message: 'Payment receipt uploaded — awaiting admin verification.',
    });
    return { bookingId, receiptUrl };
  }

  async getBooking(id: string) {
    const booking = await this.bookingRepo.findById(id);
    if (!booking) {
      throw new BusinessError('HOTELS_BOOKING_NOT_FOUND');
    }
    const settlementPending = await this.isStaysFakeSettlementPending(booking);
    return {
      id: booking.id,
      provider: booking.provider,
      status: settlementPending ? 'booking_in_progress' : booking.status,
      paymentStatus: await this.resolvePaymentStatus(
        id,
        booking.supplierReference ?? booking.hotelbedsRef,
      ),
      // Provider-neutral fields (preferred)
      searchKey: booking.searchKey,
      hotelId: booking.hotelId,
      providerHotelId: booking.providerHotelId,
      supplierRateId: booking.supplierRateId,
      supplierOrderId: booking.supplierOrderId,
      hotelConfirmationNumber: booking.hotelConfirmationNumber,
      hotelConfirmationStatus: booking.hotelConfirmationStatus,
      // Fallback chain: supplier fields → legacy fields
      reference: booking.supplierReference ?? booking.hotelbedsRef,
      supplierReference: booking.supplierReference ?? booking.hotelbedsRef,
      supplierStatus: booking.supplierStatus ?? booking.hotelbedsStatus ?? null,
      // Pricing
      supplierAmount: booking.supplierAmount,
      supplierCurrency: booking.supplierCurrency,
      customerAmount: booking.customerAmount ?? booking.amount,
      customerCurrency: booking.customerCurrency ?? booking.currency,
      markupAmount: booking.markupAmount,
      // Legacy fields (kept for backward compatibility)
      rateKey: booking.rateKey,
      holder: booking.holder,
      clientReference: booking.clientReference,
      paxes: booking.paxes,
      amount: booking.amount,
      currency: booking.currency,
      hotelbedsRef: booking.hotelbedsRef,
      hotelStatus: booking.hotelbedsStatus,
      hotel: booking.hotelSnapshot,
      hotelSnapshot: booking.hotelSnapshot,
      rateSnapshot: booking.rateSnapshot,
      message: settlementPending ? undefined : booking.message,
      receiptUrl: booking.receiptUrl ?? null,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
      userId: booking.userId,
    };
  }

  /**
   * Return a customer-safe error message based on booking status and provider.
   * Never exposes raw supplier technical errors, timeout details, or API keys.
   */
  private getCustomerFacingMessage(
    status: string,
    provider?: string,
  ): string | undefined {
    switch (status) {
      case 'failed_supplier_booking':
        return 'The supplier could not confirm this booking. Our team will review it and contact you if needed.';
      case 'failed':
        return 'We were unable to process your booking. Please contact support for assistance.';
      case 'failed_payment':
        return 'Your payment could not be processed. Please try a different payment method.';
      case 'cancelled':
        return undefined;
      case 'booked':
        return undefined;
      default:
        return provider === 'ratehawk'
          ? 'Your booking has been submitted to the supplier. Confirmation typically arrives within a few seconds.'
          : 'Please wait while we finalize your reservation.';
    }
  }

  /**
   * Sanitize a workflow trace for customer display.
   * Removes raw API responses, error codes, and internal diagnostics.
   * Keeps only step labels, statuses, and customer-safe messages.
   */
  private sanitizeTraceForCustomer(
    trace: Record<string, any>,
  ): Record<string, any> | undefined {
    if (!trace || Object.keys(trace).length === 0) return undefined;
    // Return a sanitized version keeping only step metadata, no raw API responses
    return {
      steps: (trace.steps ?? []).map((s: any) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        provider: s.provider,
        durationMs: s.durationMs,
        message:
          s.status === 'failed'
            ? 'An error occurred during this step.'
            : s.status === 'warning'
              ? s.message?.includes('Pending')
                ? s.message
                : 'This step completed with warnings.'
              : undefined,
      })),
      percent: trace.percent,
    };
  }

  async list(user?: { id: string; role?: string }) {
    const bookings =
      user?.role === 'admin'
        ? await this.bookingRepo.findAll()
        : user?.id
          ? await this.bookingRepo.findByUserId(user.id)
          : [];
    return bookings.map((b) => ({
      id: b.id,
      provider: b.provider,
      status: b.status,
      supplierOrderId: b.supplierOrderId,
      hotelConfirmationNumber: b.hotelConfirmationNumber,
      hotelConfirmationStatus: b.hotelConfirmationStatus,
      // Supplier reference with fallback
      reference: b.supplierReference ?? b.hotelbedsRef,
      supplierReference: b.supplierReference,
      // Pricing with fallback
      customerAmount: b.customerAmount ?? b.amount,
      customerCurrency: b.customerCurrency ?? b.currency,
      supplierAmount: b.supplierAmount,
      // Legacy fields (backward compat)
      amount: b.amount,
      currency: b.currency,
      hotel: b.hotelSnapshot,
      hotelSnapshot: b.hotelSnapshot,
      message: b.message,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));
  }

  /**
   * Return hotel + rate details for the booking-details page.
   *
   * Accepts a rateId and optional searchKey/provider identifiers.
   * Calls the appropriate provider to get fresh hotel and rate information.
   * The frontend uses this to display the full booking details before payment.
   */
  async getBookingDetails(input: {
    rateId: string;
    searchKey?: string;
    provider?: string;
    hotelId?: string;
    providerHotelId?: string;
    hotelGroupId?: string;
    checkIn?: string;
    checkOut?: string;
    occupancy?: Array<{
      adults: number;
      children?: number;
      childAges?: number[];
    }>;
    guests?: Array<{
      roomId: string;
      type: string;
      name: string;
      surname: string;
    }>;
  }) {
    const {
      rateId,
      searchKey,
      provider: providerKey,
      hotelId,
      providerHotelId,
      hotelGroupId,
      checkIn,
      checkOut,
      occupancy,
      guests,
    } = input;

    // Resolve provider — default to hotelbeds
    const resolvedProvider = providerKey ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(resolvedProvider);

    try {
      // Single provider lookup using the NormalizedHotelDetailsResponse type
      const resolvedSearchKey = searchKey ?? rateId;
      const resolvedHotelId =
        hotelId ?? providerHotelId ?? hotelGroupId ?? rateId;
      const details = await provider.getHotelDetails({
        searchKey: resolvedSearchKey,
        hotelId: resolvedHotelId,
      });

      // Extract the specific rate matching rateId from the flat rates array
      const allRates = details?.rates ?? [];
      const matchedRate = allRates.find(
        (r) => r.rateId === rateId || r.rateKey === rateId,
      );

      return {
        rateId,
        provider: resolvedProvider,
        hotel: {
          hotelId: details.hotelId,
          name: details.name,
          images: details.images ?? [],
          amenities: details.amenities ?? [],
          description: details.description ?? null,
          address: details.address ?? null,
          checkIn: details.checkIn ?? null,
          checkOut: details.checkOut ?? null,
        },
        matchedRate: matchedRate ?? null,
        allRates,
        occupancy: occupancy ?? null,
        guests: guests ?? null,
        checkIn: checkIn ?? null,
        checkOut: checkOut ?? null,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[HOTEL_BOOKING_DETAILS] Failed to fetch details for rate ${rateId}: ${msg}`,
      );
      return {
        rateId,
        provider: resolvedProvider,
        hotel: null,
        matchedRate: null,
        allRates: [],
        error: msg,
      };
    }
  }
}

/**
 * Extract cancellation policies from a validated rate response.
 * Hotelbeds checkRate returns policies per rate inside rooms[].rates[].
 * Falls back to top-level cancellationPolicies if present.
 */
function extractCancellationPolicies(validatedRate: {
  rooms?: any[];
  cancellationPolicies?: any[];
}): any[] | undefined {
  if (
    Array.isArray(validatedRate?.cancellationPolicies) &&
    validatedRate.cancellationPolicies.length
  ) {
    return validatedRate.cancellationPolicies;
  }
  const fromRooms = (validatedRate?.rooms ?? [])
    .flatMap((room: any) => room?.rates ?? [])
    .flatMap((rate: any) => rate?.cancellationPolicies ?? [])
    .filter(Boolean);
  return fromRooms.length ? fromRooms : undefined;
}
