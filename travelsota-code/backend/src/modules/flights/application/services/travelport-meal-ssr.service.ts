import { Injectable, Logger } from '@nestjs/common';
import { TravelportBookingCoreService } from './travelport-booking-core.service';
import { MEAL_SSR_CODES } from '../../domain/entities/ancillary-catalog.types';
import type { AncillaryCatalogOption } from '../../domain/entities/ancillary-catalog.types';

/**
 * Meal SSR selection passed to the booking workflow.
 */
export interface MealSsrSelection {
  travelerIndex: number;
  travelerRef: string;
  mealCode: string;
  mealName: string;
}

/**
 * Dedicated meal SSR request handler.
 *
 * Meals are SSR-based requests/preferences, not paid ancillaries.
 * Price is always 0 — these are requests sent to the airline, not purchases.
 * Failure to add meals is non-fatal and does not block booking.
 *
 * Matches the V11 spec for SpecialServiceRequest (SSR) payloads:
 * - Each traveler gets a unique SSR entry
 * - SSR codes: VGML, AVML, HNML, KSML, MOML, CHML, BBML
 *
 * Extracted from TravelportAncillaryService for separation of concerns.
 */
@Injectable()
export class TravelportMealSsrService {
  private readonly logger = new Logger(TravelportMealSsrService.name);

  constructor(
    private readonly coreService: TravelportBookingCoreService,
  ) {}

  /**
   * Build SSR meal option catalog items (for display in modals).
   * Each option has price=0 and requiresSupplierConfirmation=true.
   */
  buildMealOptions(): AncillaryCatalogOption[] {
    return MEAL_SSR_CODES.map((ssr) => ({
      id: `specialservices:meal:${ssr.code}`,
      type: 'meal' as const,
      source: 'specialservices' as const,
      label: ssr.name,
      description: ssr.description,
      price: { amount: 0, currency: 'USD' },
      requiresSupplierConfirmation: true,
      quantityMin: 0,
      quantityMax: 1,
      supplier: { ssrCode: ssr.code },
    }));
  }

  /**
   * Build the SSR body for adding a meal preference to the workbench.
   * Each meal is sent as a unique SpecialServiceRequest per traveler.
   *
   * @param workbenchId - The committed reservation workbench ID
   * @param sessionId - Optional session ID for the request
   * @param selections - Array of meal selections (travelerRef + mealCode)
   * @returns The raw Travelport API response, or null on failure
   */
  async addMealsToWorkbench(
    workbenchId: string,
    sessionId: string | undefined,
    selections: MealSsrSelection[],
  ): Promise<boolean> {
    if (selections.length === 0) return true;

    try {
      // Each traveler gets a separate SSR entry
      const ssrEntries = selections.map((sel) => ({
        '@type': 'SpecialServiceRequest',
        id: `ssr_meal_${sel.travelerRef}`,
        SpecialServiceRef: sel.travelerRef,
        SSRCode: sel.mealCode,
        SSRDescription: sel.mealName || sel.mealCode,
      }));

      // Post each SSR entry for the workbench
      // Travelport requires one POST per SSR per traveler
      for (const ssr of ssrEntries) {
        await this.coreService.requestAir(
          'POST',
          `/book/traveler/reservationworkbench/${encodeURIComponent(workbenchId)}/specialservicerequests`,
          { body: ssr, sessionId, softFail: true },
        );
      }

      this.logger.log(`[MealSSR] Added ${selections.length} meal SRs to workbench ${workbenchId.slice(0, 8)}...`);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[MealSSR] Failed to add meals to workbench: ${msg}`);
      // Meals are non-fatal — booking can continue without them
      return false;
    }
  }
}
