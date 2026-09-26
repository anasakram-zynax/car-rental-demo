import { Body, Controller, HttpStatus, Logger, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { RateLimitGuard } from '../../../shared/rate-limit/rate-limit.guard';
import { FlightSearchDto } from './dto/flight-search.dto';
import { FlightSearchAggregatorService } from '../application/services/flight-search-aggregator.service';
import { FlightSearchFilterService } from '../application/services/flight-search-filter.service';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { CurrentUser } from '../../../modules/auth/decorators/current-user.decorator';
import { FlightResponseMapper } from '../application/services/flight-response.mapper';
import { TravelportAncillaryService } from '../application/services/travelport-ancillary.service';
import { BusinessError } from '../../../shared/errors/business-error';
import { paginate, parsePagination } from '../../../shared/helpers/pagination.helper';
import { RateLimitTier } from '../../../shared/rate-limit/rate-limit-tier.decorator';
import { SearchJobService } from '../../search-job/search-job.service';
import { FlightDisplayEnrichmentService } from '../application/services/flight-display-enrichment.service';
import { CacheService } from '../../../shared/cache/cache.service';
import { PrismaService } from '../../../shared/database/prisma.service';

@UserTypes('public')
@Controller('flights')
@RateLimitTier({ tier: 'anonymous' })
export class FlightsController {
  private readonly logger = new Logger(FlightsController.name);

  constructor(
    private readonly aggregator: FlightSearchAggregatorService,
    private readonly filterService: FlightSearchFilterService,
    private readonly mapper: FlightResponseMapper,
    private readonly ancillaryService: TravelportAncillaryService,
    private readonly searchJobService: SearchJobService,
    private readonly enrichmentService: FlightDisplayEnrichmentService,
    private readonly prisma: PrismaService,
  ) { }

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

  @Post('search')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Flight search request completed.')
  async searchFlights(@Body() body: FlightSearchDto, @CurrentUser() user?: any) {
    // Unified pipeline Phase 7: resolve role before searching so agent-priced
    // progressive chunks + final view use the caller's pricing context.
    const pricingCtx = await this.resolveCallerPricingContext(user);
    const combined = await this.aggregator.aggregateSearch(body, undefined, pricingCtx.agentProfileId ?? undefined);
    let offers = Array.isArray(combined?.offers) ? combined.offers : [];

    // Strip supplier filters for non-staff users
    const isStaff = user?.userType === 'STAFF' || user?.userType === 'AGENT';
    if (!isStaff && body.filters?.suppliers) {
      body.filters.suppliers = undefined;
    }

    // Apply post-search filters & sort BEFORE pagination
    const filterResult = this.filterService.applyFilters(offers, body.filters, body.sort);
    const { page, pageSize } = parsePagination(body.page, body.pageSize);
    const { items: pagedOffers, pagination } = paginate(filterResult.filtered, page, pageSize);

    // Phase 14 perf: enrich only paged offers (the ones actually shown), not all 300+
    const enrichedOffers = await this.enrichmentService.enrichOffers(pagedOffers);

    // Pass filtered + sorted + paginated + enriched result to mapper
    const viewResult = await this.mapper.toSearchView(
      {
        offers: enrichedOffers,
        warnings: combined.warnings,
        meta: {
          searchKey: combined.searchKey,
          ...(combined.meta ?? {}),
        },
      },
      pagination,
      body.currency,
      pricingCtx.agentProfileId ?? undefined,
    );

    return {
      ...viewResult,
      // Server-side filter metadata
      originalTotal: filterResult.originalTotal,
      filteredTotal: filterResult.filteredTotal,
      facets: isStaff ? filterResult.facets : this.stripSupplierFacet(filterResult.facets),
      appliedFilters: filterResult.appliedFilters,
    };
  }

  @Post('search/jobs')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Flight search job created.')
  async createSearchJob(@Body() body: FlightSearchDto, @CurrentUser() user?: any) {
    // Unified pipeline Phase 7: thread the caller's pricing context through the
    // background job so agent jobs return agent-priced cards (guests/customers
    // keep customer pricing — identical to the sync path).
    const pricingCtx = await this.resolveCallerPricingContext(user);
    const searchProviders = await this.aggregator.getSearchProviderInfo();
    const job = await this.searchJobService.createJob('flights', searchProviders);

    // Strip supplier filters for non-staff users before running background job
    const isStaff = user?.userType === 'STAFF' || user?.userType === 'AGENT';
    if (!isStaff && body.filters?.suppliers) {
      body.filters.suppliers = undefined;
    }

    // Run the search in the background — don't await
    this.runSearchJob(job.searchId, body, pricingCtx).catch((err) => {
      this.logger.error(`[SearchJob] Background search failed: ${err?.message ?? err}`);
    });

    return job;
  }

  private async runSearchJob(
    searchId: string,
    body: FlightSearchDto,
    pricingCtx?: { userType: string | null; agentProfileId: string | null },
  ) {
    const startTime = Date.now();
    try {
      const combined = await this.aggregator.aggregateSearch(body, searchId, pricingCtx?.agentProfileId ?? undefined);

      // Skip expensive final enrichment/filter/map/store if user already selected an offer
      const job = await this.searchJobService.getJob(searchId);
      if (!job || job.lifecycle === 'cancelled') return;

      let offers = Array.isArray(combined?.offers) ? combined.offers : [];
      // Enrichment already happened per-provider inside the aggregator's
      // progressive pipeline (overlapped with other providers' searches) —
      // re-enriching here would duplicate seconds of work after completion.

      // Apply post-search filters & sort BEFORE pagination
      const filterResult = this.filterService.applyFilters(offers, body.filters, body.sort);

      // Store ALL filtered offers — frontend paginates client-side
      const totalOffers = filterResult.filtered.length;
      const viewResult = await this.mapper.toSearchView(
        {
          offers: filterResult.filtered,
          warnings: combined.warnings,
          meta: {
            searchKey: combined.searchKey,
            ...(combined.meta ?? {}),
          },
        },
        {
          page: 1,
          pageSize: totalOffers,
          total: totalOffers,
          totalPages: 1,
        },
        body.currency,
        pricingCtx?.agentProfileId ?? undefined,
      );

      // Store with filter metadata
      await this.searchJobService.storeResult(searchId, {
        ...viewResult,
        originalTotal: filterResult.originalTotal,
        filteredTotal: filterResult.filteredTotal,
        facets: this.stripSupplierFacet(filterResult.facets),
        appliedFilters: filterResult.appliedFilters,
      });

      // Determine if partial
      const providerResults = combined.providerResults ?? [];
      const failedCount = providerResults.filter((p) => p.status !== 'ok').length;
      const partial = failedCount > 0 && providerResults.length > 1;

      await this.searchJobService.completeJob(searchId, filterResult.originalTotal, partial);
    } catch (err: unknown) {
      this.logger.error(`[SearchJob] ${searchId} failed: ${err instanceof Error ? err.message : err}`);
      await this.searchJobService.failJob(searchId, 'ALL_SUPPLIERS_FAILED');
    }
  }

  @Post('ancillaries/price')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Ancillary price fetched.')
  async ancillaryPrice(@Body() body: unknown) {
    try {
      return await this.ancillaryService.ancillaryPrice(body);
    } catch (error) {
      this.logger.error(`Ancillary price failed: ${error}`);
      throw new BusinessError('FLIGHTS_ANCILLARY_UNAVAILABLE', 'Ancillary price service temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('ancillaries/catalog')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Ancillary catalog fetched.')
  async ancillaryCatalog(@Body() body: { searchKey: string; offerId: string; travelerCount: number; provider?: string }) {
    try {
      return await this.ancillaryService.ancillaryCatalog(body);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Ancillary catalog failed: ${error}`);
      throw new BusinessError('FLIGHTS_ANCILLARY_CATALOG_UNAVAILABLE', 'Ancillary catalog temporarily unavailable.', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('ancillaries/preview/seat-map')
  @UseGuards(RateLimitGuard)
  @ResponseMessage('Seat map preview fetched.')
  async previewSeatMap(@Body() body: { searchKey: string; offerId: string; travelerCount?: number; provider?: string }) {
    try {
      return await this.ancillaryService.previewSeatMap(body.searchKey, body.offerId, body.travelerCount);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Seat map preview failed: ${error}`);
      throw new BusinessError('FLIGHTS_SEAT_MAP_UNAVAILABLE', 'Seat map preview unavailable.', HttpStatus.BAD_GATEWAY);
    }
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
