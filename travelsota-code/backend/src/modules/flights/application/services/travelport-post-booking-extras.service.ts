import { Inject, Injectable, Logger } from '@nestjs/common';
import { TravelportBookingCoreService } from './travelport-booking-core.service';
import type { WorkbenchSession } from './travelport-booking-core.service';
import { TravelportSeatMapBuilderService } from './travelport-seat-map-builder.service';
import type { FlightBookingExtraRepoPort } from '../ports/flight-booking-extra-repo.port';
import { FlightBookingExtraRepoPortToken } from '../ports/flight-booking-extra-repo.port';
import type { FlightBookingEntity } from '../../domain/entities/flight-booking.entity';
import type { FlightBookingRepoPort } from '../ports/flight-booking-repo.port';
import { FlightBookingRepoPortToken } from '../ports/flight-booking-repo.port';
import type { FlightBookingExtraEntity, CreateFlightBookingExtraInput } from '../../domain/entities/flight-booking-extra.entity';
import { PrismaService } from '../../../../shared/database/prisma.service';

/**
 * Catalog item returned from the live supplier shop.
 */
export interface ExtrasCatalogItem {
  type: 'seat' | 'baggage' | 'meal' | 'service';
  /** Unique supplier-side identifier for quote/add */
  ancillaryProductId: string;
  label: string;
  description?: string;
  /** Travelport catalog-level identifier (for BuildAncillaryOffers) */
  catalogOfferingsIdentifier?: string;
  /** Travelport offering-level identifier (for BuildAncillaryOffers) */
  catalogOfferingIdentifier?: string;
  /** Per-traveler price (0 for SSR meals) */
  price: { amount: number; currency: string };
  /** Seat-specific */
  seatNumber?: string;
  segmentRef?: string;
  travelerRef?: string;
  /** Baggage-specific */
  baggageType?: string;
  weight?: string;
  pieces?: number;
  /** Meal-specific */
  mealCode?: string;
  dietaryType?: string;
}

/**
 * Quoted price for a selection of extras.
 */
export interface ExtrasQuoteResult {
  items: Array<{
    ancillaryProductId: string;
    type: string;
    label: string;
    quotedPrice: { amount: number; currency: string };
    /** Supplier identifiers refreshed from quote response */
    catalogOfferingsIdentifier?: string;
    catalogOfferingIdentifier?: string;
    supplierOfferIdentifier?: string;
    supplierReservationIdentifier?: string;
  }>;
  total: { amount: number; currency: string };
}

/**
 * Payment result for extras.
 */
export interface ExtrasPaymentResult {
  paymentId: string;
  status: string;
  providerPaymentId?: string;
  providerClientSecret?: string;
  providerCheckoutUrl?: string;
}

/**
 * Result of the extras confirm operation.
 */
export interface ExtrasConfirmResult {
  ok: boolean;
  status: string;
  committedItems: number;
  failedItems: number;
  failures: Array<{ ancillaryProductId: string; error: string }>;
  message?: string;
  locatorCode?: string;
}

/**
 * Current status of all extras for a booking.
 */
export interface ExtrasStatusResult {
  bookingId: string;
  extrasStatus: string;
  items: Array<{
    id: string;
    type: string;
    status: string;
    label?: string;
    amount: number;
    currency: string;
    supplierErrorCode?: string;
    supplierErrorMessage?: string;
    createdAt: string;
  }>;
}

/**
 * Post-Booking Manage Extras service.
 *
 * Handles the full lifecycle of adding extras (seats, baggage, meals, services)
 * to an already-booked Travelport reservation:
 *
 * 1. catalog()  — Build workbench from locator, shop available extras
 * 2. quote()    — Price selected extras
 * 3. pay()      — Create payment for paid extras
 * 4. confirm()  — Add extras to workbench + commit
 * 5. status()   — Get current extras status
 */
@Injectable()
export class TravelportPostBookingExtrasService {
  private readonly logger = new Logger(TravelportPostBookingExtrasService.name);

  constructor(
    private readonly coreService: TravelportBookingCoreService,
    private readonly seatMapBuilder: TravelportSeatMapBuilderService,
    @Inject(FlightBookingExtraRepoPortToken)
    private readonly extraRepo: FlightBookingExtraRepoPort,
    @Inject(FlightBookingRepoPortToken)
    private readonly bookingRepo: FlightBookingRepoPort,
    private readonly prisma: PrismaService,
  ) {}

  // ── Step 1: Catalog ──

  /**
   * Fetch live available extras for an already-booked reservation.
   *
   * Flow:
   * 1. Build workbench from PNR locator (buildfromlocator)
   * 2. Shop ancillaries via BuildFromReservationWorkbench
   * 3. Extract available seats, baggage, meal options
   * 4. Persist the workbench session for subsequent quote/add calls
   * 5. Return catalog with availability status
   *
   * @param booking - The booking entity (must have locatorCode)
   * @returns Array of available extras
   */
  async catalog(booking: FlightBookingEntity): Promise<{
    items: ExtrasCatalogItem[];
    workbenchId?: string;
    sessionId?: string;
  }> {
    if (!booking.locatorCode) {
      this.logger.warn(`Booking ${booking.id.slice(0, 8)} has no locator — cannot shop extras`);
      return { items: [] };
    }

    // Step 1: Build workbench from PNR locator
    const workbench = await this.coreService.buildFromLocator(booking.locatorCode);
    if (!workbench?.workbenchId) {
      this.logger.warn(`buildFromLocator failed for ${booking.locatorCode} — no extras available`);
      return { items: [] };
    }

    // Step 2: Shop ancillaries via BuildFromReservationWorkbench
    const ancillaryResult = await this.coreService.requestAir<Record<string, unknown>>(
      'POST',
      '/ancillaryshop/catalogofferingsancillaries',
      {
        body: {
          '@type': 'CatalogOfferingsQueryAncillaries',
          AncillaryOfferings: {
            '@type': 'AncillaryOfferingsBuildFromReservationWorkbench',
            BuildFromReservationWorkbench: {
              ReservationIdentifier: {
                Identifier: {
                  value: workbench.workbenchId,
                },
              },
            },
          },
        },
        sessionId: workbench.sessionId,
        softFail: true,
      },
    );

    const catalogItems = this.parseCatalogFromResponse(ancillaryResult, workbench);

    // Step 3: Also fetch seat availability from the workbench
    const seatResult = await this.coreService.requestAir<Record<string, unknown>>(
      'POST',
      '/search/seat/catalogofferingsancillaries/seatavailabilities',
      {
        body: this.seatMapBuilder.buildFromReservationWorkbench(workbench.workbenchId),
        sessionId: workbench.sessionId,
        softFail: true,
      },
    );
    const seatItems = this.parseSeatsFromResponse(seatResult);

    const allItems = [...catalogItems, ...seatItems];

    // Update last sync timestamp
    await this.prisma.flightBooking.update({
      where: { id: booking.id },
      data: { lastExtrasSyncAt: new Date() },
    });

    return { items: allItems, workbenchId: workbench.workbenchId, sessionId: workbench.sessionId };
  }

  // ── Public Wrappers ──

  /**
   * Build a reservation workbench from an existing PNR locator.
   * Public wrapper around coreService.buildFromLocator for controller use.
   */
  async buildWorkbenchFromLocator(locator: string): Promise<WorkbenchSession | null> {
    return this.coreService.buildFromLocator(locator);
  }

  // ── Step 2: Quote ──

  /**
   * Price selected extras through Travelport's
   * /ancillaryprice/offers/buildancillaryoffersfromcatalogofferings endpoint.
   *
   * @param booking - The booking entity
   * @param workbench - Active workbench session (from catalog call)
   * @param selections - The items to price
   * @returns Quoted prices with refreshed supplier identifiers
   */
  async quote(
    booking: FlightBookingEntity,
    workbench: WorkbenchSession,
    selections: ExtrasCatalogItem[],
  ): Promise<ExtrasQuoteResult | null> {
    if (!workbench.workbenchId) return null;

    const paidItems = selections.filter((s) => s.type !== 'meal' || (s.price?.amount ?? 0) > 0);
    if (paidItems.length === 0) {
      // Meals are SSR-only, no pricing needed — return zero-price quote
      return {
        items: selections.map((s) => ({
          ancillaryProductId: s.ancillaryProductId,
          type: s.type,
          label: s.label,
          quotedPrice: s.price ?? { amount: 0, currency: 'USD' },
        })),
        total: { amount: 0, currency: 'USD' },
      };
    }

    try {
      const quoteResponse = await this.coreService.requestAir<Record<string, unknown>>(
        'POST',
        '/ancillaryprice/offers/buildancillaryoffersfromcatalogofferings',
        {
          body: {
            '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
            BuildAncillaryOffersFromCatalogOfferings: paidItems.map((item) => ({
              '@type': 'BuildAncillaryOffersFromCatalogOfferings',
              CatalogOfferingsIdentifier: {
                Identifier: {
                  authority: 'Travelport',
                  value: item.catalogOfferingsIdentifier ?? item.ancillaryProductId,
                },
              },
              CatalogOfferingIdentifier: {
                id: item.catalogOfferingIdentifier ?? item.ancillaryProductId,
              },
              ProductIdentifier: { id: item.ancillaryProductId },
              TravelerIdentifierRef: { id: item.travelerRef ?? '' },
              Quantity: 1,
            })),
          },
          sessionId: workbench.sessionId,
        },
      );

      return this.parseQuoteFromResponse(quoteResponse, selections);
    } catch (err: unknown) {
      this.logger.error(
        `Extras quote failed for booking ${booking.id.slice(0, 8)}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  // ── Step 3: Create Payment ──

  /**
   * Create a payment for selected paid extras.
   *
   * If all selections have zero amount (SSR meals only), skips payment
   * and returns a synthetic payment ID.
   *
   * @param booking - The booking entity
   * @param gateway - Payment gateway ('stripe' | 'paypal')
   * @param totalAmount - Total amount to charge
   * @param currency - Currency code
   * @param successUrl - Optional redirect on success
   * @param cancelUrl - Optional redirect on cancel
   * @returns Payment result with provider details
   */
  async pay(
    booking: FlightBookingEntity,
    gateway: string,
    totalAmount: number,
    currency: string,
    successUrl?: string,
    cancelUrl?: string,
  ): Promise<ExtrasPaymentResult> {
    // SSR-only extras (meals) — no payment needed
    if (totalAmount <= 0) {
      return {
        paymentId: `extras_no_payment_${booking.id.slice(0, 8)}`,
        status: 'not_required',
      };
    }

    // Create a payment record for the extras
    const idempotencyKey = `extras_${booking.id}_${Date.now()}`;
    const payment = await this.prisma.payment.create({
      data: {
        reference: `extras_${booking.id}_${Date.now()}`,
        bookingId: booking.id,
        bookingType: 'flight',
        gateway,
        amount: totalAmount,
        currency,
        status: 'PENDING',
        idempotencyKey,
        successUrl: successUrl ?? null,
        cancelUrl: cancelUrl ?? null,
      },
    });

    this.logger.log(
      `Extras payment created: ${payment.id} for booking ${booking.id.slice(0, 8)} (${currency} ${totalAmount})`,
    );

    return {
      paymentId: payment.id,
      status: payment.status,
      providerPaymentId: payment.providerPaymentId ?? undefined,
      providerClientSecret: payment.providerClientSecret ?? undefined,
      providerCheckoutUrl: payment.providerCheckoutUrl ?? undefined,
    };
  }

  // ── Step 4: Confirm (Add to Supplier + Commit) ──

  /**
   * Confirm selected extras with the supplier.
   *
   * Flow per V11 spec (Section 11.3):
   * 1. Build workbench from locator (buildfromlocator)
   * 2. Add each paid ancillary to the workbench via buildancillaryoffersfromcatalogofferings
   * 3. Add each meal SSR via specialservices/list
   * 4. Commit the workbench
   * 5. If any step fails after payment → mark extras as failed + trigger admin review
   *
   * @param booking - The booking entity
   * @param items - The extras to add (with refreshed supplier identifiers from quote step)
   * @param workbench - The active workbench session
   * @returns Confirm result with per-item status
   */
  async confirm(
    booking: FlightBookingEntity,
    items: ExtrasCatalogItem[],
    workbench: WorkbenchSession,
  ): Promise<ExtrasConfirmResult> {
    if (!workbench.workbenchId) {
      return { ok: false, status: 'no_workbench', committedItems: 0, failedItems: 0, failures: [], message: 'No active workbench session.' };
    }

    // Idempotency guard: skip if extras are already confirmed
    if (booking.extrasStatus === 'confirmed') {
      return { ok: true, status: 'already_confirmed', committedItems: 0, failedItems: 0, failures: [], message: 'Extras already confirmed.' };
    }

    // Fetch persisted extra entities so we can update by UUID, not by supplier ID
    const persistedExtras = await this.extraRepo.findByBookingId(booking.id);
    const extraByProductId = new Map<string, string>();
    for (const extra of persistedExtras) {
      if (extra.supplierProductIdentifier) {
        extraByProductId.set(extra.supplierProductIdentifier, extra.id);
      }
    }

    const failures: ExtrasConfirmResult['failures'] = [];
    let committedCount = 0;

    // Helper to update extra record by looking up entity ID from supplier product ID
    const updateExtraStatus = async (productId: string, patch: { status: 'adding_to_supplier' | 'failed' | 'confirmed'; supplierErrorCode?: string; supplierErrorMessage?: string }) => {
      const entityId = extraByProductId.get(productId);
      if (!entityId) return;
      await this.extraRepo.update(entityId, patch).catch(() => {});
    };

    // Step 1: Add seat extras
    const seatItems = items.filter((i) => i.type === 'seat');
    for (const seat of seatItems) {
      try {
        const seatAddBody = {
          '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
          BuildAncillaryOffersFromCatalogOfferings: [
            {
              '@type': 'BuildAncillaryOffersFromCatalogOfferings',
              CatalogOfferingsIdentifier: {
                Identifier: {
                  authority: 'Travelport',
                  value: seat.catalogOfferingsIdentifier ?? seat.ancillaryProductId,
                },
              },
              CatalogOfferingIdentifier: {
                id: seat.catalogOfferingIdentifier ?? seat.ancillaryProductId,
              },
              ProductIdentifier: { id: seat.ancillaryProductId },
              TravelerIdentifierRef: { id: seat.travelerRef ?? '' },
              SeatAssignment: seat.seatNumber,
              Quantity: 1,
            },
          ],
        };

        await this.coreService.requestAir(
          'POST',
          `/book/airoffer/reservationworkbench/${workbench.workbenchId}/offers/buildancillaryoffersfromcatalogofferings`,
          {
            body: seatAddBody,
            sessionId: workbench.sessionId,
          },
        );
        committedCount++;
        await updateExtraStatus(seat.ancillaryProductId, { status: 'adding_to_supplier' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to add seat ${seat.seatNumber}: ${msg}`);
        failures.push({ ancillaryProductId: seat.ancillaryProductId, error: msg });
        await updateExtraStatus(seat.ancillaryProductId, {
          status: 'failed',
          supplierErrorCode: 'ADD_FAILED',
          supplierErrorMessage: msg,
        });
      }
    }

    // Step 2: Add baggage/service extras
    const paidItems = items.filter((i) => i.type === 'baggage' || i.type === 'service');
    for (const item of paidItems) {
      try {
        const addBody = {
          '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
          BuildAncillaryOffersFromCatalogOfferings: [
            {
              '@type': 'BuildAncillaryOffersFromCatalogOfferings',
              CatalogOfferingsIdentifier: {
                Identifier: {
                  authority: 'Travelport',
                  value: item.catalogOfferingsIdentifier ?? item.ancillaryProductId,
                },
              },
              CatalogOfferingIdentifier: {
                id: item.catalogOfferingIdentifier ?? item.ancillaryProductId,
              },
              ProductIdentifier: { id: item.ancillaryProductId },
              TravelerIdentifierRef: { id: item.travelerRef ?? '' },
              Quantity: 1,
            },
          ],
        };

        await this.coreService.requestAir(
          'POST',
          `/book/airoffer/reservationworkbench/${workbench.workbenchId}/offers/buildancillaryoffersfromcatalogofferings`,
          {
            body: addBody,
            sessionId: workbench.sessionId,
          },
        );
        committedCount++;
        await updateExtraStatus(item.ancillaryProductId, { status: 'adding_to_supplier' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to add ${item.type} ${item.label}: ${msg}`);
        failures.push({ ancillaryProductId: item.ancillaryProductId, error: msg });
        await updateExtraStatus(item.ancillaryProductId, {
          status: 'failed',
          supplierErrorCode: 'ADD_FAILED',
          supplierErrorMessage: msg,
        });
      }
    }

    // Step 3: Add meal SSR requests (non-fatal if they fail)
    const mealItems = items.filter((i) => i.type === 'meal');
    for (const meal of mealItems) {
      try {
        const ssrBody = {
          '@type': 'SpecialServiceListRequest',
          SpecialServiceID: [
            {
              '@type': 'SpecialService',
              id: `ssr_${meal.mealCode}`,
              SSRCode: meal.mealCode,
              TravelerIdentifier: {
                id: meal.travelerRef ?? '',
                TravelerRef: meal.travelerRef ?? '',
              },
            },
          ],
        };

        await this.coreService.requestAir(
          'POST',
          `/book/specialservices/reservationworkbench/${workbench.workbenchId}/specialservices/list`,
          {
            body: ssrBody,
            sessionId: workbench.sessionId,
            softFail: true,
          },
        );
        committedCount++;
      } catch {
        // Meal SSR failures are non-fatal
        this.logger.warn(`Meal SSR ${meal.mealCode} failed — continuing`);
      }
    }

    // Step 4: Commit the workbench (if any items were successfully added)
    if (committedCount > 0) {
      try {
        const commitResult = await this.coreService.commitWorkbench(
          workbench.workbenchId,
          workbench.sessionId,
        );

        // Update extras status to confirmed
        const confirmedCount = committedCount - failures.length;
        if (confirmedCount > 0) {
          await this.prisma.flightBooking.update({
            where: { id: booking.id },
            data: {
              extrasStatus: failures.length > 0 ? 'partial' : 'confirmed',
              lastExtrasSyncAt: new Date(),
            },
          });

          // Mark successful extras as confirmed (use entity UUID, not supplier product ID)
          for (const item of items) {
            const isFailed = failures.some((f) => f.ancillaryProductId === item.ancillaryProductId);
            if (!isFailed) {
              const entityId = extraByProductId.get(item.ancillaryProductId);
              if (entityId) {
                await this.extraRepo.update(entityId, { status: 'confirmed' }).catch(() => {});
              }
            }
          }
        }

        const newLocator = this.extractLocatorFromCommit(commitResult);
        return {
          ok: failures.length === 0,
          status: failures.length > 0 ? 'partial' : 'confirmed',
          committedItems: committedCount,
          failedItems: failures.length,
          failures,
          locatorCode: newLocator,
          message: failures.length > 0
            ? `${confirmedCount} extras added, ${failures.length} failed`
            : 'All extras added successfully',
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Extras commit failed: ${msg}`);

        // Commit failed — mark as supplier error
        await this.prisma.flightBooking.update({
          where: { id: booking.id },
          data: { extrasStatus: 'pending', lastExtrasSyncAt: new Date() },
        });

        // Handle failed extras for admin review
        await this.markFailedExtras(booking.id, msg);

        return {
          ok: false,
          status: 'commit_failed',
          committedItems: committedCount,
          failedItems: items.length,
          failures: [...failures, { ancillaryProductId: 'commit', error: msg }],
          message: `Extras commit failed: ${msg}`,
        };
      }
    }

    // No items committed
    if (failures.length > 0) {
      await this.prisma.flightBooking.update({
        where: { id: booking.id },
        data: { extrasStatus: 'failed', lastExtrasSyncAt: new Date() },
      });

      // Handle failed extras for admin review
      await this.markFailedExtras(booking.id, 'All extras failed to add');
    }

    return {
      ok: false,
      status: 'failed',
      committedItems: 0,
      failedItems: failures.length,
      failures,
      message: 'No extras could be added to the supplier',
    };
  }

  // ── Step 5: Status ──

  async getStatus(bookingId: string): Promise<ExtrasStatusResult> {
    const booking = await this.bookingRepo.findById(bookingId);

    const extras = await this.extraRepo.findByBookingId(bookingId);

    return {
      bookingId,
      extrasStatus: booking?.extrasStatus ?? 'none',
      items: extras.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        label: e.label,
        amount: e.amount,
        currency: e.currency,
        supplierErrorCode: e.supplierErrorCode,
        supplierErrorMessage: e.supplierErrorMessage,
        createdAt: e.createdAt,
      })),
    };
  }

  // ── Handle Failed Extras After Supplier Error ──

  /**
   * Handle extras that failed after supplier add attempt.
   * Marks records as failed for admin review.
   * TODO (Phase 4): Integrate with payment gateway refund flow.
   */
  private async markFailedExtras(bookingId: string, failureMessage: string): Promise<void> {
    try {
      const payments = await this.prisma.payment.findMany({
        where: { bookingId, status: 'PAID' },
      });

      for (const payment of payments) {
        this.logger.log(
          `[AutoRefund] Extras payment ${payment.id} for ${bookingId.slice(0, 8)} marked for admin review: ${failureMessage}`,
        );

        // Update the extras items associated with this payment
        const extras = await this.extraRepo.findByBookingId(bookingId);
        for (const extra of extras) {
          if (extra.status === 'adding_to_supplier' || extra.status === 'payment_paid') {
            await this.extraRepo.update(extra.id, {
              status: 'failed',
              supplierErrorCode: 'COMMIT_FAILED',
              supplierErrorMessage: failureMessage,
            }).catch(() => {});
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[AutoRefund] Failed to process failed extras for ${bookingId}: ${msg}`);
    }
  }

  // ── Helpers ──

  /**
   * Extract the new locator code from a commit response, if present.
   */
  private extractLocatorFromCommit(response: Record<string, unknown> | null): string | undefined {
    if (!response) return undefined;
    const receipts = this.resolveDeep(response, ['ReservationResponse', 'Reservation', 'Receipt']) as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(receipts)) {
      for (const receipt of receipts) {
        const locator = this.resolveDeep(receipt, ['Confirmation', 'Locator', 'value']);
        if (typeof locator === 'string') return locator;
      }
    }
    return undefined;
  }

  // ── Persistence Helpers ──

  /**
   * Persist selected extras as FlightBookingExtra records.
   * Creates one record per selection item.
   */
  async persistSelections(
    bookingId: string,
    contentSource: string,
    items: ExtrasCatalogItem[],
  ): Promise<FlightBookingExtraEntity[]> {
    const created: FlightBookingExtraEntity[] = [];
    for (const item of items) {
      const input: CreateFlightBookingExtraInput = {
        bookingId,
        provider: 'travelport',
        contentSource,
        type: item.type,
        status: 'selected',
        label: item.label,
        description: item.description,
        travelerIndex: item.travelerRef ? parseInt(item.travelerRef.replace(/\D/g, ''), 10) || undefined : undefined,
        travelerRef: item.travelerRef,
        segmentRef: item.segmentRef,
        productRef: item.ancillaryProductId,
        supplierProductIdentifier: item.ancillaryProductId,
        supplierCatalogOfferingsIdentifier: item.catalogOfferingsIdentifier,
        supplierCatalogOfferingIdentifier: item.catalogOfferingIdentifier,
        amount: item.price?.amount ?? 0,
        currency: item.price?.currency ?? 'USD',
      };
      const entity = await this.extraRepo.create(input);
      created.push(entity);
    }

    // Update booking extras status
    await this.prisma.flightBooking.update({
      where: { id: bookingId },
      data: {
        extrasStatus: 'pending',
        extrasTotalAmount: created.reduce((sum, e) => sum + e.amount, 0),
        extrasCurrency: created[0]?.currency ?? 'USD',
        lastExtrasSyncAt: new Date(),
      },
    });

    return created;
  }

  // ── Private Response Parsers ──

  private parseCatalogFromResponse(
    response: Record<string, unknown> | { ok: false; upstreamStatus?: number },
    _workbench: WorkbenchSession,
  ): ExtrasCatalogItem[] {
    const items: ExtrasCatalogItem[] = [];

    // If soft-fail returned an error, return empty
    if (!response || (response as { ok?: boolean }).ok === false) {
      this.logger.warn('Ancillary shop returned empty or error — no extras available');
      return items;
    }

    // Parse ancillary catalog from response
    const root = response as Record<string, unknown>;
    const ancillaryList = this.resolveDeep(root, [
      'CatalogOfferingsAncillaryListResponse',
      'CatalogOfferingsIdentifier',
    ]);
    const catalogOfferingsIdentifier = typeof ancillaryList === 'object'
      ? (ancillaryList as Record<string, unknown>)?.value as string | undefined
      : undefined;

    const offerings = this.resolveDeep(root, [
      'CatalogOfferingsAncillaryListResponse',
      'CatalogOffering',
    ]);

    if (Array.isArray(offerings)) {
      for (const offering of offerings) {
        const offerObj = offering as Record<string, unknown>;
        const catalogOfferingId = this.readDeep(offerObj, ['Identifier', 'value']);
        const products = offerObj.Product;
        if (Array.isArray(products)) {
          for (const product of products) {
            const prodObj = product as Record<string, unknown>;
            const productId = this.readDeep(prodObj, ['Identifier', 'value']) ?? prodObj.id;
            if (!productId) continue;

            const type = this.classifyAncillaryType(prodObj);
            const priceVal = this.extractPrice(prodObj);

            items.push({
              type: type as ExtrasCatalogItem['type'],
              ancillaryProductId: String(productId),
              label: String(prodObj.name ?? prodObj.description ?? type),
              description: prodObj.description as string | undefined,
              catalogOfferingsIdentifier,
              catalogOfferingIdentifier: catalogOfferingId as string | undefined,
              price: priceVal ?? { amount: 0, currency: 'USD' },
            });
          }
        }
      }
    }

    return items;
  }

  private parseSeatsFromResponse(
    response: Record<string, unknown> | { ok: false; upstreamStatus?: number },
  ): ExtrasCatalogItem[] {
    const items: ExtrasCatalogItem[] = [];

    if (!response || (response as { ok?: boolean }).ok === false) return items;

    const root = response as Record<string, unknown>;
    const catalogOfferingsId = this.readDeep(root, [
      'CatalogOfferingsAncillaryListResponse',
      'CatalogOfferingsIdentifier',
      'Identifier',
      'value',
    ]);

    const offerings = this.resolveDeep(root, [
      'CatalogOfferingsAncillaryListResponse',
      'CatalogOffering',
    ]);

    if (Array.isArray(offerings)) {
      for (const offering of offerings) {
        const offerObj = offering as Record<string, unknown>;
        const catalogOfferingId = this.readDeep(offerObj, ['Identifier', 'value']);
        const products = offerObj.Product;
        if (Array.isArray(products)) {
          for (const product of products) {
            const prodObj = product as Record<string, unknown>;
            const productId = this.readDeep(prodObj, ['Identifier', 'value']) ?? prodObj.id;
            if (!productId) continue;

            const seatNumber = this.readDeep(prodObj, ['SeatAssignment', 'value'])
              ?? this.readDeep(prodObj, ['SeatAssignment'])
              ?? prodObj.seatNumber;
            const priceVal = this.extractPrice(prodObj);

            if (seatNumber) {
              items.push({
                type: 'seat',
                ancillaryProductId: String(productId),
                label: `Seat ${seatNumber}`,
                catalogOfferingsIdentifier: catalogOfferingsId as string | undefined,
                catalogOfferingIdentifier: catalogOfferingId as string | undefined,
                seatNumber: String(seatNumber),
                price: priceVal ?? { amount: 0, currency: 'USD' },
              });
            }
          }
        }
      }
    }

    return items;
  }

  private parseQuoteFromResponse(
    response: Record<string, unknown> | null,
    selections: ExtrasCatalogItem[],
  ): ExtrasQuoteResult | null {
    if (!response) return null;

    const root = response as Record<string, unknown>;
    const quotedOffers = this.resolveDeep(root, ['OfferListResponse', 'OfferID']) as
      | Array<Record<string, unknown>>
      | undefined;

    const items: ExtrasQuoteResult['items'] = [];
    let totalAmount = 0;
    let currency = 'USD';

    if (Array.isArray(quotedOffers)) {
      for (const quoted of quotedOffers) {
        const productId = quoted.id as string | undefined;
        const priceVal = this.extractPrice(quoted);
        const matchingSelection = productId
          ? selections.find((s) => s.ancillaryProductId === productId)
          : undefined;

        if (matchingSelection && priceVal) {
          items.push({
            ancillaryProductId: productId ?? matchingSelection.ancillaryProductId,
            type: matchingSelection.type,
            label: matchingSelection.label,
            quotedPrice: priceVal,
            catalogOfferingsIdentifier: matchingSelection.catalogOfferingsIdentifier,
            catalogOfferingIdentifier: matchingSelection.catalogOfferingIdentifier,
            supplierOfferIdentifier: this.readDeep(quoted, ['Identifier', 'value']) as string | undefined,
          });
          totalAmount += priceVal.amount;
          currency = priceVal.currency;
        }
      }
    }

    // If no quoted items but we have selections, return zero-price (SSR only)
    if (items.length === 0 && selections.length > 0) {
      for (const sel of selections) {
        items.push({
          ancillaryProductId: sel.ancillaryProductId,
          type: sel.type,
          label: sel.label,
          quotedPrice: { amount: 0, currency: 'USD' },
        });
      }
    }

    return { items, total: { amount: totalAmount, currency } };
  }

  private classifyAncillaryType(product: Record<string, unknown>): string {
    const name = String(product.name ?? product.description ?? '').toLowerCase();
    const prodId = String(product.id ?? '').toLowerCase();
    const combined = `${name} ${prodId}`;

    if (combined.includes('seat')) return 'seat';
    if (combined.includes('baggage') || combined.includes('checked') || combined.includes('carry_on')) return 'baggage';
    if (combined.includes('meal') || combined.includes('vgml') || combined.includes('meal')) return 'meal';
    return 'service';
  }

  private extractPrice(obj: Record<string, unknown>): { amount: number; currency: string } | undefined {
    const price =
      (obj.Price as Record<string, unknown>) ??
      (obj.BestCombinablePrice as Record<string, unknown>) ??
      (obj.TotalPrice as Record<string, unknown>);

    if (!price || typeof price !== 'object') return undefined;

    const priceObj = price as Record<string, unknown>;
    const currencyCode =
      (priceObj.CurrencyCode as Record<string, unknown>)?.value as string | undefined ??
      (priceObj.CurrencyCode as string) ??
      (priceObj.code as string);
    const amount =
      (priceObj.TotalPrice as number) ??
      (priceObj.total as number) ??
      (priceObj.value as number) ??
      (priceObj.amount as number);

    if (typeof amount === 'number' && Number.isFinite(amount) && currencyCode) {
      return { amount, currency: currencyCode };
    }
    return undefined;
  }

  private resolveDeep(obj: Record<string, unknown>, path: string[]): unknown {
    let current: unknown = obj;
    for (const key of path) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  private readDeep(obj: Record<string, unknown>, path: string[]): unknown {
    return this.resolveDeep(obj, path);
  }
}
