import { Injectable, Logger } from '@nestjs/common';
import { TravelportBookingWorkflowService } from './travelport-booking-workflow.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';

export interface OrchestratorBookingInput {
  /** Cache key to retrieve the selected-offer cache entry */
  searchKey?: string;
  /** Offer ID for the cached entry */
  offerId?: string;
  /** If the orchestrator already has a cache entry, pass it directly */
  cacheEntry?: unknown;
  /** Raw workflow input forwarded to the strategy */
  workflowInput: Record<string, unknown>;
  /** When true, skip the initial search step (offers are already priced) */
  skipSearch: boolean;
}

export interface OrchestratorBookingResult {
  ok: boolean;
  identifiers?: {
    locatorCode?: string;
    workbenchId?: string;
    reservationId?: string;
    ticketNumbers?: string[];
  };
  steps?: Array<{ name: string; status: string; duration?: number; errors?: unknown }>;
  failedStep?: string;
  message?: string;
}

/**
 * Booking orchestrator that routes to the appropriate Travelport strategy
 * based on the contentSource (GDS vs NDC) from the selected-offer cache.
 *
 * Phase 2 foundation: Currently routes all requests to the existing
 * TravelportBookingWorkflowService (single strategy). When strategy services
 * are created in Phase 2b, this will route accordingly.
 *
 * ponytail: Single strategy now, split when GDS/NDC diverge enough to
 * justify separate service files.
 */
@Injectable()
export class TravelportBookingOrchestratorService {
  private readonly logger = new Logger(TravelportBookingOrchestratorService.name);

  constructor(
    private readonly bookingWorkflowService: TravelportBookingWorkflowService,
    private readonly selectedOfferCache: SelectedOfferCacheService,
  ) {}

  /**
   * Execute the booking workflow with strategy routing.
   *
   * 1. Resolve contentSource from the selected-offer cache entry
   * 2. Route to GDS or NDC strategy
   * 3. Return normalized result
   */
  async execute(input: OrchestratorBookingInput): Promise<OrchestratorBookingResult> {
    // Resolve contentSource from cache entry if available
    let contentSource: string | undefined;

    if (input.cacheEntry) {
      const entry = input.cacheEntry as Record<string, unknown>;
      contentSource = (entry.contentSource as string) ?? undefined;
    } else if (input.searchKey && input.offerId) {
      const cachedEntry = await this.selectedOfferCache.retrieve(input.searchKey, input.offerId);
      if (cachedEntry) {
        contentSource = cachedEntry.contentSource;
      }
    }

    if (contentSource && contentSource !== 'GDS' && contentSource !== 'NDC') {
      this.logger.warn(`[Orchestrator] Unknown contentSource: ${contentSource}. Defaulting to GDS.`);
      contentSource = 'GDS';
    }

    this.logger.log(`[Orchestrator] Routing booking with contentSource=${contentSource ?? 'unknown'}`);

    // Phase 2b: Route to GDS or NDC strategy service
    // For now, forward to the existing single workflow service
    try {
      const result = await this.bookingWorkflowService.runWorkflow(
        input.workflowInput as any,
        input.skipSearch,
      );

      if ((result as any)?.ok !== true) {
        const failedStep = (result as any)?.failedStep ?? 'unknown';
        const message = (result as any)?.message ?? `Workflow failed at step: ${failedStep}`;
        return { ok: false, failedStep, message, steps: (result as any)?.steps };
      }

      const identifiers = (result as any)?.identifiers ?? {};
      return {
        ok: true,
        identifiers: {
          locatorCode: identifiers.locatorCode,
          workbenchId: identifiers.workbenchId,
          reservationId: identifiers.reservationId ?? identifiers.workbenchId,
        },
        steps: (result as any)?.steps,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[Orchestrator] Booking failed: ${message}`);
      return { ok: false, failedStep: 'orchestrator', message };
    }
  }
}
