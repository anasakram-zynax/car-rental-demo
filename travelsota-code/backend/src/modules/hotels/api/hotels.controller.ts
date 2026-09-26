import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { uploadFileToCloudinary } from '../../upload/cloudinary-upload.util';
import { AuthGuard } from '@nestjs/passport';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { RateLimitGuard } from '../../../shared/rate-limit/rate-limit.guard';
import { OptionalJwtAuthGuard } from '../../../shared/auth/optional-jwt-auth.guard';
import { GuestBookingGuard } from '../../settings/api/guards/guest-booking.guard';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { HotelsProviderRegistryService } from '../providers/registry/hotels-provider-registry.service';
import { HotelSearchAggregatorService } from '../application/services/hotel-search-aggregator.service';
import { HotelSearchFilterService } from '../application/services/hotel-search-filter.service';
import { HotelBookingService } from '../application/services/hotel-booking.service';
import { HotelDetailsService } from '../application/services/hotel-details.service';
import { HotelDetailsOrchestratorService } from '../application/services/hotel-details-orchestrator.service';
import { HotelSearchDto } from './dto/hotel-search.dto';
import { CheckRateDto } from './dto/check-rate.dto';
import { HotelDetailsDto } from './dto/hotel-details.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CheckoutDto } from './dto/checkout.dto';
import { ValidateRateDto } from './dto/validate-rate.dto';
import { HotelBookingDetailsDto } from './dto/hotel-booking-details.dto';
import {
  paginate,
  parsePagination,
} from '../../../shared/helpers/pagination.helper';
import { RateLimitTier } from '../../../shared/rate-limit/rate-limit-tier.decorator';
import { SearchJobService } from '../../search-job/search-job.service';
import { CurrencyService } from '../../currency/application/services/currency.service';
import { BusinessError } from '../../../shared/errors/business-error';
import { PrismaService } from '../../../shared/database/prisma.service';
import { PolicyAggregatorService } from '../policies/policy-aggregator.service';
import { HotelbedsPolicyNormalizer } from '../policies/hotelbeds-policy-normalizer';
import { AmadeusPolicyNormalizer } from '../policies/amadeus-policy-normalizer';
import { RateHawkPolicyNormalizer } from '../policies/ratehawk-policy-normalizer';
import { isFakeLocatorCode } from '../../../shared/booking/demo-booking-fallback.util';
import { TravelportStaysPolicyNormalizer } from '../policies/travelport-stays-policy-normalizer';
import type { PolicyNormalizer } from '../policies/policy-normalizer.interface';

@UserTypes('public')
@Controller('hotels')
@RateLimitTier({ tier: 'anonymous' })
export class HotelsController {
  private readonly logger = new Logger(HotelsController.name);

  constructor(
    private readonly providerRegistry: HotelsProviderRegistryService,
    private readonly searchAggregator: HotelSearchAggregatorService,
    private readonly filterService: HotelSearchFilterService,
    private readonly hotelBookingService: HotelBookingService,
    private readonly hotelDetailsService: HotelDetailsService,
    private readonly detailsOrchestrator: HotelDetailsOrchestratorService,
    private readonly searchJobService: SearchJobService,
    private readonly currencyService: CurrencyService,
    private readonly policyAggregator: PolicyAggregatorService,
    private readonly hotelbedsPolicyNormalizer: HotelbedsPolicyNormalizer,
    private readonly amadeusPolicyNormalizer: AmadeusPolicyNormalizer,
    private readonly ratehawkPolicyNormalizer: RateHawkPolicyNormalizer,
    private readonly prisma: PrismaService,
  ) {}

  /** Resolve the caller's role + agent profile for role-aware pricing (null for guests). */
  private async resolveCallerPricingContext(user?: { id?: string; userType?: string } | null) {
    if (!user?.id) return { userType: null as string | null, agentProfileId: null as string | null };
    const userType = user.userType ?? null;
    let agentProfileId: string | null = null;
    if (userType === 'AGENT') {
      const profile = await this.prisma.agentProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      agentProfileId = profile?.id ?? null;
    }
    return { userType, agentProfileId };
  }

  /** Get the correct policy normalizer for a provider. */
  private readonly travelportStaysPolicyNormalizer = new TravelportStaysPolicyNormalizer();

  private getPolicyNormalizer(provider: string): PolicyNormalizer {
    switch (provider) {
      case 'amadeus': return this.amadeusPolicyNormalizer;
      case 'ratehawk': return this.ratehawkPolicyNormalizer;
      case 'travelport-stays': return this.travelportStaysPolicyNormalizer;
      case 'hotelbeds':
      default: return this.hotelbedsPolicyNormalizer;
    }
  }

  /**
   * Ownership enforcement: customers can only access their own bookings.
   * Admins and agents can access any booking.
   * Guest bookings (userId == null) are accessible by anyone with the booking UUID.
   */
  private assertOwnership(
    booking: { userId?: string | null },
    user?: { id: string; userType: string },
  ) {
    if (!user) return;
    if (user.userType === 'CUSTOMER') {
      if (booking.userId && booking.userId !== user.id) {
        throw new BusinessError(
          'AUTH_INSUFFICIENT_PERMISSIONS',
          'You do not have access to this booking.',
          403,
        );
      }
    }
  }

  /**
   * Provider status check — uses getProvider() for direct lookup
   * so any registered provider can be checked by key.
   */
  @Get('providers/:provider/status')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Provider status checked.')
  async checkProviderStatus(@Param('provider') provider: string) {
    const registered = this.providerRegistry.getRegisteredProviders();
    if (!registered.includes(provider)) {
      return {
        ok: false,
        provider,
        message: `Provider "${provider}" is not registered. Available: ${registered.join(', ') || 'none'}.`,
      };
    }

    try {
      const prov = this.providerRegistry.getProvider(provider);
      return prov.checkStatus();
    } catch {
      return {
        ok: false,
        provider,
        message: `Provider "${provider}" could not be checked (not enabled or misconfigured).`,
      };
    }
  }

  /**
   * Legacy endpoint — kept for backward compatibility.
   * @deprecated Use GET /hotels/providers/:provider/status
   */
  @Get('providers/hotelbeds/status')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Hotelbeds status checked.')
  async checkHotelbedsStatus() {
    const activeProvider = await this.providerRegistry.resolveActiveProvider();
    return activeProvider.checkStatus();
  }

  @Post('search')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Hotel search completed.')
  async searchHotels(@Body() body: HotelSearchDto, @CurrentUser() user?: any) {
    this.logger.debug(
      `[HOTEL_SEARCH] Incoming request — destinationCode="${body.destinationCode ?? ''}" destinationName="${body.destinationName ?? ''}" hotelName="${body.hotelName ?? ''}" geolocation=${body.geolocation ? JSON.stringify(body.geolocation) : 'NONE'}`,
    );

    // Strip supplier filters for non-staff users
    const isStaff = user?.userType === 'STAFF' || user?.userType === 'AGENT';
    if (!isStaff && body.filters?.suppliers) {
      body.filters.suppliers = undefined;
    }

    // Map occupancies to rooms if rooms not provided
    // OccupancyDto is summary format { rooms: 1, adults: 2, children: 0 }
    // HotelSearchInput.rooms expects per-room detail [{ adults: 2, children: 0 }]
    if (!body.rooms?.length && body.occupancies?.length) {
      body.rooms = body.occupancies.flatMap((o) =>
        Array.from({ length: o.rooms ?? 1 }, () => ({
          adults: o.adults,
          children: o.children,
          childAges: o.childAges,
        })),
      );
    }

    // Use the search aggregator to query all search-enabled providers in parallel
    const combined = await this.searchAggregator.aggregateSearch(body);

    // Apply post-search filters & sort BEFORE pagination
    const filterResult = this.filterService.applyFilters(
      combined.hotels,
      body.filters,
      body.sort,
    );

    // Apply pagination to the filtered hotel list
    const { page, pageSize } = parsePagination(body.page, body.pageSize);
    const { items: pagedHotels, pagination: paginationMeta } = paginate(
      filterResult.filtered,
      page,
      pageSize,
    );

    return {
      ...combined,
      hotels: pagedHotels,
      meta: {
        total: filterResult.originalTotal,
        pagination: paginationMeta,
      },
      // Server-side filter metadata
      originalTotal: filterResult.originalTotal,
      filteredTotal: filterResult.filteredTotal,
      facets: isStaff
        ? filterResult.facets
        : this.stripSupplierFacet(filterResult.facets),
      appliedFilters: filterResult.appliedFilters,
    };
  }

  @Post('search/jobs')
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @ResponseMessage('Hotel search job created.')
  async createSearchJob(
    @Body() body: HotelSearchDto,
    @CurrentUser() user?: { id?: string; userType?: string },
  ) {
    // Unified pipeline Phase 2: resolve the caller's role ONCE and thread it
    // through the background job so agent jobs return agent-priced cards
    // (guests/customers keep customer pricing — identical to the sync path).
    const pricingCtx = await this.resolveCallerPricingContext(user);
    const searchProviders = await this.searchAggregator.getSearchProviderInfo();
    const job = await this.searchJobService.createJob(
      'hotels',
      searchProviders,
    );

    // Run the search in the background — don't await
    this.runSearchJob(job.searchId, body, pricingCtx).catch((err) => {
      this.logger.error(
        `[SearchJob] Background hotel search failed: ${err?.message ?? err}`,
      );
    });

    return job;
  }

  private async runSearchJob(
    searchId: string,
    body: HotelSearchDto,
    pricingCtx?: { agentProfileId?: string | null },
  ) {
    try {
      // Watchdog: a hung provider/enrichment phase must not leave the job
      // running forever — fail it so the frontend stops waiting.
      const combined = await Promise.race([
        this.searchAggregator.aggregateSearch(body, searchId, pricingCtx),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Search watchdog timed out after 90s')),
            90_000,
          ),
        ),
      ]);

      // Skip expensive final work if user already selected an offer
      const job = await this.searchJobService.getJob(searchId);
      if (!job || job.lifecycle === 'cancelled') return;

      // Apply post-search filters & sort
      const filterResult = this.filterService.applyFilters(
        combined.hotels,
        body.filters,
        body.sort,
      );

      // Store ALL filtered hotels — frontend paginates client-side
      const totalHotels = filterResult.filtered.length;
      const viewResult = {
        ...combined,
        hotels: filterResult.filtered,
        meta: {
          total: filterResult.originalTotal,
          pagination: {
            page: 1,
            pageSize: totalHotels,
            total: totalHotels,
            totalPages: 1,
          },
        },
        originalTotal: filterResult.originalTotal,
        filteredTotal: filterResult.filteredTotal,
        facets: this.stripSupplierFacet(filterResult.facets),
        appliedFilters: filterResult.appliedFilters,
      };
      await this.searchJobService.storeResult(searchId, viewResult);

      // Determine if partial
      const providerResults = combined.providerResults ?? [];
      const failedCount = providerResults.filter(
        (p) => p.status !== 'ok',
      ).length;
      const partial = failedCount > 0 && providerResults.length > 1;

      await this.searchJobService.completeJob(
        searchId,
        filterResult.originalTotal,
        partial,
      );
    } catch (err: unknown) {
      this.logger.error(
        `[SearchJob] ${searchId} failed: ${err instanceof Error ? err.message : err}`,
      );
      await this.searchJobService.failJob(searchId, 'ALL_SUPPLIERS_FAILED');
    }
  }

  /**
   * Get full hotel details and live rates for a specific hotel.
   *
   * Multi-provider orchestration:
   * - If hotelGroupId is provided, queries all providers that have this hotel
   * - If only a specific provider is given, queries just that provider
   * - Returns CombinedHotelDetailsResponse with providerSections
   */
  @Post('details')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Hotel details retrieved.')
  async getHotelDetails(@Body() body: HotelDetailsDto) {
    if (!body.searchKey) {
      const manualProvider = this.providerRegistry.getProvider('manual');
      try {
        const manual = await manualProvider.getHotelDetails({
          searchKey: '',
          hotelId: body.hotelId,
        });
        const amenityObjects = (manual.amenities ?? []).map((a: any) =>
          typeof a === 'string' ? { code: a, name: undefined } : a,
        );

        return {
          searchKey: '',
          hotelGroupId: manual.hotelId,
          hotel: {
            hotelGroupId: manual.hotelId,
            displayName: manual.name,
            location: {
              latitude: undefined,
              longitude: undefined,
              city: manual.address ?? undefined,
            },
            starRating: undefined,
            images: manual.images,
            amenities: amenityObjects as any,
            description: manual.description,
            address: manual.address,
          },
          content: {
            hotelGroupId: manual.hotelId,
            displayName: manual.name,
            images: manual.images,
            amenities: amenityObjects as any,
            description: manual.description,
            address: manual.address,
          },
          providerSections: [
            {
              provider: 'manual',
              providerHotelId: manual.providerHotelId,
              status: 'available' as const,
              rates: manual.rates.map((r) => ({
                provider: 'manual',
                providerHotelId: manual.providerHotelId,
                rateId: r.rateId,
                roomName: r.roomName ?? 'Room',
                boardName: r.boardName,
                refundable: r.refundable,
                cancellationPolicy: r.cancellationPolicyText,
                occupancy: { adults: r.adults ?? 2, children: r.children ?? 0 },
                supplierPrice: {
                  amount: r.supplierAmount,
                  currency: r.supplierCurrency ?? 'USD',
                },
                customerPrice: {
                  amount: r.customerAmount ?? r.supplierAmount,
                  currency: r.customerCurrency ?? r.supplierCurrency ?? 'USD',
                },
              })),
            },
          ],
          warnings: [],
        };
      } catch {
        // not a manual hotel — fall through
      }
    }

    if (body.hotelGroupId) {
      return this.detailsOrchestrator.getCombinedDetails(
        body.searchKey ?? '',
        body.hotelGroupId,
        body.provider,
        body.providerHotelId,
        body.displayCurrency,
        body.checkIn,
        body.checkOut,
        body.rooms,
        body.hotelName,
        body.destinationName,
      );
    }

    const providerKey = body.provider ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(providerKey);
    const details = await provider.getHotelDetails({
      searchKey: body.searchKey ?? '',
      hotelId: body.hotelId,
    });
    // Direct-provider path must serve MARKED rates too — same engine as the
    // orchestrated path, so no detail page ever shows raw supplier prices.
    await this.detailsOrchestrator.applyMarkupToNormalizedRates(
      providerKey,
      details.rates ?? [],
    );
    return details;
  }

  /**
   * Provider-neutral rate validation / prebook endpoint.
   * Accepts a selected rate from any provider and runs provider-specific
   * validation (Hotelbeds check-rate or RateHawk prebook).
   */
  @Post('rates/validate')
  @UseGuards(OptionalJwtAuthGuard, RateLimitGuard)
  @ResponseMessage('Rate validated.')
  async validateRate(
    @Body() body: ValidateRateDto,
    @CurrentUser() user?: { id?: string; userType?: string },
  ) {
    const pricingCtx = await this.resolveCallerPricingContext(user);
    const provider = this.providerRegistry.getProvider(body.provider);
    const validated = await provider.validateRate({
      rateId: body.rateId,
      searchKey: body.searchKey,
      providerHotelId: body.providerHotelId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      rooms: body.occupancy?.map((o) => ({
        adults: o.adults,
        children: o.children,
        childAges: o.childAges,
      })),
    });

    const displayCurrency = body.displayCurrency;
    const chargeCurrency = validated.supplierCurrency;

    // Rate semantics: supplier APIs (Hotelbeds checkrate, RateHawk prebook,
    // Amadeus) return STAY totals — only manual inventory quotes per-night
    // prices (capabilities.ratesArePerNight). Multiplying stay totals by
    // nights produced 3× prices for multi-night bookings.
    const ratesArePerNight = provider.capabilities?.ratesArePerNight ?? false;
    const nights =
      body.checkIn && body.checkOut
        ? Math.max(
            1,
            Math.round(
              (new Date(body.checkOut).getTime() - new Date(body.checkIn).getTime()) / 86400000,
            ),
          )
        : 1;
    const stayMultiplier = ratesArePerNight ? nights : 1;

    // Apply customer markup to the supplier net — this is what the customer
    // actually pays (matches preview/checkout, where markup is applied to the
    // provider-quoted amount and then multiplied for per-night providers).
    // Role-aware: agents see/are charged the AGENT-marked-up price so the
    // booking endpoint's server-side markup check matches what validate showed.
    let customerAmount = await this.hotelBookingService.computeValidatedDisplayPrice(
      validated.supplierAmount,
      body.provider,
      { userType: pricingCtx.userType, agentProfileId: pricingCtx.agentProfileId },
    );
    if (stayMultiplier > 1) customerAmount = customerAmount * stayMultiplier;
    const supplierStayTotal = validated.supplierAmount * stayMultiplier;

    let displayAmount: number | undefined = customerAmount;
    let displayCurrencyOut = chargeCurrency;
    if (
      displayCurrency &&
      displayCurrency.toUpperCase() !== chargeCurrency?.toUpperCase()
    ) {
      try {
        const converted = await this.currencyService.convert(
          customerAmount,
          chargeCurrency,
          displayCurrency,
        );
        displayAmount = converted.amount;
        displayCurrencyOut = displayCurrency;
      } catch {
        throw new BusinessError(
          'HOTELS_DISPLAY_CURRENCY_CONVERSION_FAILED',
          `Cannot show prices in ${displayCurrency}: conversion from ${chargeCurrency} failed. Please select a different currency.`,
        );
      }
    }

    // Authoritative markup fields in the DISPLAY currency — the frontend
    // renders these directly instead of subtracting amounts that may be in
    // different currencies (supplier vs display), which produced wrong math.
    let supplierAmountInDisplay: number | null = null;
    try {
      supplierAmountInDisplay =
        displayCurrencyOut?.toUpperCase() === chargeCurrency?.toUpperCase()
          ? supplierStayTotal
          : (
              await this.currencyService.convert(
                supplierStayTotal,
                chargeCurrency,
                displayCurrencyOut,
              )
            ).amount;
    } catch {
      supplierAmountInDisplay = null;
    }
    const markupAmount =
      supplierAmountInDisplay != null && displayAmount != null
        ? Math.max(0, displayAmount - supplierAmountInDisplay)
        : null;

    // Compute aggregated policy from the first rate's cancellation policies
    const firstRate = validated.rooms?.[0]?.rates?.[0];
    const normalizer = this.getPolicyNormalizer(validated.provider);
    const supplierPolicy = normalizer.normalize(firstRate);
    const aggregatedPolicy = this.policyAggregator.aggregate(
      validated.provider,
      supplierPolicy,
    );

    return {
      rateId: validated.rateId,
      provider: validated.provider,
      // Stay total in the supplier currency (stay totals for API providers;
      // per-night × nights for manual inventory).
      supplierAmount: supplierStayTotal,
      supplierCurrency: validated.supplierCurrency,
      customerAmount,
      customerCurrency: chargeCurrency,
      displayAmount,
      displayCurrency: displayCurrencyOut,
      markupAmount,
      supplierAmountInDisplay,
      prebookToken: validated.prebookToken,
      prebookExpiresAt: validated.prebookExpiresAt,
      rooms: validated.rooms,
      aggregatedPolicy,
      message: 'Rate validated successfully.',
    };
  }

  /**
   * Validate a rate — routes by provider if specified.
   * @deprecated Use the provider-neutral flow (preview → checkout → confirm) instead.
   */
  @Post('check-rate')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Rate checked successfully.')
  async checkRate(@Body() body: CheckRateDto) {
    const providerKey = body.provider ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(providerKey);
    const rateId = body.rateId ?? body.rateKey;
    if (!rateId) {
      throw new BadRequestException('rateId or rateKey is required.');
    }
    return provider.validateRate({ rateId });
  }

  /**
   * Step 1 of the payment-enabled booking flow.
   * Validates rateId via the active provider, extracts real price,
   * saves the booking with status = pending_payment,
   * and returns bookingId + server-derived amount/currency.
   */
  @Post('bookings/preview')
  @UseGuards(GuestBookingGuard)
  @ResponseMessage('Hotel booking created — proceed to payment.')
  previewBooking(@Body() body: CreateBookingDto, @CurrentUser() user?: any) {
    return this.hotelBookingService.preview(body, user?.id);
  }

  /**
   * One-step checkout: validates rateId, creates booking (pending_payment),
   * and creates a Stripe PaymentIntent / PayPal order in a single call.
   * Returns everything the frontend needs to complete payment.
   */
  @Post('bookings/checkout')
  @UseGuards(GuestBookingGuard)
  @ResponseMessage('Checkout initiated — proceed to payment.')
  async checkout(
    @Body() body: CheckoutDto,
    @CurrentUser() user?: any,
    @Req() req?: any,
  ) {
    if (!body.userIp && req?.ip) {
      body.userIp = req.ip;
    }
    // Unified pipeline Phase 5: role-aware checkout — agents take the wallet/
    // credit reserve-commit branch; guests/customers keep PaymentIntent.
    const pricingCtx = await this.resolveCallerPricingContext(user);
    return this.hotelBookingService.checkout(body, user?.id, pricingCtx);
  }

  @Post('bookings/details')
  @ResponseMessage('Hotel booking details fetched.')
  async getBookingDetails(@Body() body: HotelBookingDetailsDto) {
    return this.hotelBookingService.getBookingDetails(body);
  }

  @Get('bookings')
  // QA 2026-09-09 R4: agents book via unified checkout but couldn't list their own
  // bookings (403). list() filters by user.id for non-admins.
  @UserTypes('customer', 'admin', 'agent')
  @ResponseMessage('Hotel bookings listed.')
  listHotelBookings(@CurrentUser() user?: any) {
    return this.hotelBookingService.list(user);
  }

  @Post('bookings/:id/cancel')
  @UserTypes('customer', 'admin')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Hotel booking cancelled.')
  async cancelHotelBooking(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('reason') reason?: string,
  ) {
    const booking = await this.hotelBookingService.getBooking(id);
    this.assertOwnership(booking, user);
    // Routes by booking.provider internally — no active-provider resolution needed
    return this.hotelBookingService.cancelBooking(id, reason);
  }

  /**
   * Preview cancellation fee + refund WITHOUT cancelling.
   * Used by dashboards to show the fee before user confirmation.
   */
  @Get('bookings/:id/cancel-estimate')
  @UserTypes('customer', 'admin', 'agent')
  @UseGuards(AuthGuard('jwt'))
  @ResponseMessage('Hotel cancellation estimate retrieved.')
  async getCancelEstimate(@Param('id') id: string, @CurrentUser() user?: any) {
    const booking = await this.hotelBookingService.getBooking(id);
    this.assertOwnership(booking, user);
    return this.hotelBookingService.getCancelEstimate(id);
  }

  @Get('bookings/:id')
  @UserTypes('public')
  @ResponseMessage('Hotel booking details retrieved.')
  async getHotelBooking(@Param('id') id: string, @CurrentUser() user?: any) {
    const booking = await this.hotelBookingService.getBooking(id);
    this.assertOwnership(booking, user);
    return booking;
  }

  @Post('bookings/:id/receipt')
  @UserTypes('public')
  @UseGuards(GuestBookingGuard, RateLimitGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(tmpdir(), 'travelsota-uploads'),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
          ),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.match(
            /^image\/(jpeg|png|gif|webp)$|^application\/pdf$/,
          )
        ) {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, WebP, GIF images or PDF files are allowed (max 5MB).',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ResponseMessage('Payment receipt uploaded.')
  async uploadReceipt(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @UploadedFile() file?: { path: string },
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const booking = await this.hotelBookingService.getBooking(id);
    this.assertOwnership(booking, user);
    const url = await uploadFileToCloudinary(file.path, 'travelsota-receipts');
    return this.hotelBookingService.attachReceipt(id, url);
  }

  /**
   * Legacy direct-book endpoint (B2B / admin use only).
   * Routes by provider from the body, falls back to 'hotelbeds'.
   * @deprecated Use the preview → payment → webhook flow for customer-facing flows.
   */
  @Post('book')
  @ResponseMessage('Hotel booked successfully.')
  async bookHotel(@Body() body: CreateBookingDto) {
    const providerKey = body.provider ?? 'hotelbeds';
    const provider = this.providerRegistry.getProvider(providerKey);
    const rateId = body.rateId ?? body.rateKey;
    if (!rateId) {
      throw new BadRequestException('rateId or rateKey is required.');
    }
    return provider.createBooking({
      rateId,
      holder: body.holder as any,
      clientReference: body.clientReference,
      paxes: body.paxes as any,
    });
  }

  /**
   * Get the workflow progress for a hotel booking.
   * Returns the structured workflow trace saved during booking processing.
   * Frontend polls this endpoint every 2-3 seconds.
   */
  @Get('bookings/:id/progress')
  @UserTypes('public')
  @ResponseMessage('Booking progress retrieved.')
  async getBookingProgress(@Param('id') id: string, @CurrentUser() user?: any) {
    const booking = await this.hotelBookingService.getBooking(id);
    if (booking) {
      this.assertOwnership(booking, user);
    }
    return this.hotelBookingService.getBookingProgress(id);
  }

  @Get('bookings/:reference/by-reference')
  @ResponseMessage('Booking details retrieved successfully.')
  async getBookingByReference(
    @Param('reference') reference: string,
    @Query('provider') provider?: string,
  ) {
    // Require provider query param — without it we cannot route correctly
    const providerKey = provider;
    if (!providerKey) {
      throw new BadRequestException(
        'Provider query parameter is required. Use ?provider=hotelbeds or ?provider=ratehawk. Available: ' +
          this.providerRegistry.getRegisteredProviders().join(', '),
      );
    }
    if (isFakeLocatorCode(reference)) {
      throw new BadRequestException(
        'Demo booking references have no supplier order to retrieve.',
      );
    }
    const prov = this.providerRegistry.getProvider(providerKey);
    return prov.retrieveBooking({ reference });
  }

  /**
   * Suggest destinations — queries the local Destinations table.
   * Does NOT call any supplier Content API.
   * Only returns enabled destinations that have content status = partial or ready.
   */
  @Get('destinations')
  @ResponseMessage('Destinations suggested.')
  async suggestDestinations(@Query('q') _query: string) {
    // Supplier static-content destination index is out of scope for this
    // manual-only starter kit.
    return [];
  }

  /**
   * Suggest hotels by destination — queries local static content and canonical hotel tables.
   * Does NOT call any supplier Content API.
   */
  @Get('suggest-hotels')
  @ResponseMessage('Hotels suggested.')
  async suggestHotels(
    @Query('destinationCode') _destinationCode: string,
    @Query('q') _query: string = '',
  ) {
    // Supplier static-content hotel index is out of scope for this
    // manual-only starter kit.
    return [];
  }

  /**
   * Remove supplier facet from response for non-staff users
   * to avoid leaking internal provider naming.
   */
  private stripSupplierFacet(facets: any) {
    if (!facets) return facets;
    const { suppliers, ...rest } = facets;
    return rest;
  }
}
