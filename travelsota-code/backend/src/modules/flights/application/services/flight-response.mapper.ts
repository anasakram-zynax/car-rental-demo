import { Injectable, Logger } from '@nestjs/common';
import type {
  BookingConfirmView,
  BookingDetailView,
  BookingPreviewView,
  FlightSearchView,
  PaginationMeta,
} from '../ports/normalized-flight-response';
import { MarkupService } from '../../../markup/markup.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';
import type { PricingBreakdown } from '../../../../shared/helpers/pricing.types';

@Injectable()
export class FlightResponseMapper {
  private readonly logger = new Logger(FlightResponseMapper.name);

  constructor(
    private readonly markupService: MarkupService,
    private readonly currencyService: CurrencyService,
  ) {}

  /**
   * Fast display path — zero enrichment, zero currency conversion. Decimals
   * come from one cached listActive() call (60s in-memory TTL in
   * CurrencyService, not a per-offer DB round trip) so the fast card never
   * falls back to a hardcoded decimals map.
   */
  async toFastSearchView(raw: any): Promise<FlightSearchView> {
    const offers = Array.isArray(raw?.offers) ? raw.offers : [];
    const catalogUuid = raw?.meta?.catalogUuid ?? '';
    const searchKey = raw?.meta?.searchKey ?? raw?.meta?.transactionId ?? '';

    const activeCurrencies = await this.currencyService.listActive();
    const decimalsByCode = new Map<string, number>(
      activeCurrencies.map((c: any) => [c.code, c.decimals]),
    );
    const getMinorUnit = (code: string) => decimalsByCode.get(code.toUpperCase()) ?? 2;

    const mappedOffers = offers.map((o: any) => {
      const offerKey = o?.metadata?.offeringId ?? o.id ?? '';
      const currency = o?.price?.currency ?? 'USD';
      const total = Number(o?.price?.total ?? 0);

      return {
        provider: o?.provider ?? 'travelport',
        contentSource: typeof o?.contentSource === 'string' ? o.contentSource : undefined,
        offerId: offerKey,
        productId: o?.metadata?.productRef ?? '',
        productIds: Array.isArray(o?.metadata?.productRefs)
          ? o.metadata.productRefs
          : o?.metadata?.productRef
            ? [o.metadata.productRef]
            : undefined,
        productSelections: Array.isArray(o?.metadata?.productSelections)
          ? o.metadata.productSelections
          : undefined,
        offeringIdentifierValue: o?.metadata?.offeringIdentifierValue,
        brandOfferingId: o?.metadata?.brandOfferingId,
        catalogUuid,
        capabilities: o?.capabilities ?? undefined,
        price: {
          currency,
          total,
          minorUnit: getMinorUnit(currency),
        },
        cabin: o?.cabin,
        brandName: o?.brand?.name,
        stops: typeof o?.stops === 'number' ? o.stops : undefined,
        display: o?.display
          ? {
              airlineCode: o.display.airlineCode,
              airlineName: o.display.airlineName,
              airlineLogoUrl: o.display.airlineLogoUrl,
              flightNumber: o.display.flightNumber,
              origin: o.display.origin ?? {
                code: o?.segments?.[0]?.departure?.airport ?? '',
                label: o?.segments?.[0]?.departure?.airport ?? '',
              },
              destination: o.display.destination ?? {
                code:
                  o?.segments?.[o?.segments?.length - 1]?.arrival?.airport ??
                  '',
                label:
                  o?.segments?.[o?.segments?.length - 1]?.arrival?.airport ??
                  '',
              },
              durationLabel: o.display.durationLabel,
              stopsLabel: o.display.stopsLabel,
              fareBrand: o.display.fareBrand,
              cabinLabel: o.display.cabinLabel,
              baggage: o.display.baggage,
              changePolicy: o.display.changePolicy,
              refundPolicy: o.display.refundPolicy,
              journeys: o.display.journeys,
              supplier: o.display.supplier,
            }
          : undefined,
        segments: Array.isArray(o?.segments)
          ? o.segments.map((s: any) => ({
              from: s?.departure?.airport ?? '',
              to: s?.arrival?.airport ?? '',
              departureAt: [s?.departure?.date, s?.departure?.time]
                .filter(Boolean)
                .join('T'),
              arrivalAt: [s?.arrival?.date, s?.arrival?.time]
                .filter(Boolean)
                .join('T'),
              marketingCarrier: s?.carrier,
              flightNumber: s?.flightNumber,
              display: s?.display
                ? {
                    airlineCode: s.display.airlineCode,
                    airlineName: s.display.airlineName,
                    airlineLogoUrl: s.display.airlineLogoUrl,
                    flightNumber: s.display.flightNumber,
                    operatingAirlineName: s.display.operatingAirlineName,
                    origin: s.display.origin ?? {
                      code: s?.departure?.airport ?? '',
                      label: s?.departure?.airport ?? '',
                    },
                    destination: s.display.destination ?? {
                      code: s?.arrival?.airport ?? '',
                      label: s?.arrival?.airport ?? '',
                    },
                    departureTimeLabel: s.display.departureTimeLabel,
                    arrivalTimeLabel: s.display.arrivalTimeLabel,
                    durationLabel: s.display.durationLabel,
                    aircraftName: s.display.aircraftName,
                    cabinLabel: s.display.cabinLabel,
                    baggageLabel: s.display.baggageLabel,
                  }
                : undefined,
            }))
          : [],
        refundable: undefined,
        changeable: undefined,
        baggageText: undefined,
      };
    });

    return {
      searchKey,
      pagination: {
        page: 1,
        pageSize: mappedOffers.length,
        total: mappedOffers.length,
        totalPages: 1,
      },
      offers: mappedOffers,
      warnings: Array.isArray(raw?.warnings) ? raw.warnings : undefined,
    };
  }

  async toSearchView(
    raw: any,
    pagination?: PaginationMeta,
    displayCurrency?: string,
    agentProfileId?: string,
  ): Promise<FlightSearchView> {
    const offers = Array.isArray(raw?.offers) ? raw.offers : [];
    const catalogUuid = raw?.meta?.catalogUuid ?? '';
    const searchKey = raw?.meta?.searchKey ?? raw?.meta?.transactionId ?? '';

    const mappedOffers = await Promise.all(
      offers.map(async (o: any) => {
        const offerId = o?.metadata?.offeringId ?? o.id ?? '';
        const offeringIdentifierValue = o?.metadata?.offeringIdentifierValue;
        if (process.env.ENABLE_PROVIDER_DEBUG_LOGS === 'true') {
          this.logger.log(
            `Mapping offer | offerId=${offerId} provider=${o?.provider ?? '?'} catalogUuid=${catalogUuid || '(none)'} productRef=${o?.metadata?.productRef ?? '(none)'}`,
          );
        }

        const baseTotal = Number(o?.price?.total ?? 0);
        const currency = o?.price?.currency ?? 'USD';
        const firstSegment = Array.isArray(o?.segments)
          ? o.segments[0]
          : undefined;

        let finalTotal = baseTotal;
        let supplierPrice: number | undefined;
        let markupPercent: number | undefined;
        if (baseTotal > 0) {
          try {
            // Unified pipeline Phase 7: agent callers price with agent rules +
            // flightMarkup profile fallback (calculatePrice is role-aware).
            const result = await this.markupService.calculatePrice(
              baseTotal,
              'flights',
              agentProfileId,
              o?.provider, // supplierId → supplier-scoped rules match per offer
              firstSegment?.departure?.airport,
              firstSegment?.arrival?.airport,
              currency, // baseTotal is in the supplier's raw currency at this point
            );
            finalTotal = result.finalPrice;
            supplierPrice = result.basePrice;
            markupPercent = result.effectiveMarkupPercent;
          } catch {
            // If markup fails, show raw price
          }
        }

        // Build canonical pricing block (Phase 1-3)
        let pricingBlock:
          | import('../ports/normalized-flight-response').FlightOfferView['pricing']
          | undefined;
        if (displayCurrency && baseTotal > 0) {
          try {
            const breakdown: PricingBreakdown =
              await this.currencyService.buildPricingBreakdown({
                supplierAmount: finalTotal,
                supplierCurrency: currency,
                displayCurrency,
              });
            // Convert the RAW supplier base too so cards can render a
            // breakdown where supplier/markup/total share ONE currency.
            let baseInDisplay: number | null = null;
            try {
              const baseBd: PricingBreakdown =
                await this.currencyService.buildPricingBreakdown({
                  supplierAmount: baseTotal,
                  supplierCurrency: currency,
                  displayCurrency,
                });
              baseInDisplay = baseBd.displayPrice?.amount ?? null;
            } catch {
              baseInDisplay = null;
            }
            pricingBlock = {
              supplierPrice: breakdown.supplierPrice,
              displayPrice: breakdown.displayPrice,
              chargePrice: breakdown.chargePrice,
              ...(breakdown.exchangeRateSnapshot
                ? { exchangeRateSnapshot: breakdown.exchangeRateSnapshot }
                : {}),
              supplierBaseInDisplay: baseInDisplay ?? undefined,
              markupInDisplay:
                baseInDisplay != null && breakdown.displayPrice?.amount != null
                  ? Math.max(0, breakdown.displayPrice.amount - baseInDisplay)
                  : undefined,
            };
          } catch (err) {
            this.logger.warn(
              `Failed to build pricing breakdown for offer ${offerId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        // Combined itineraries (multi-city "+" / round-trip pairing) sum raw
        // leg totals under the first leg's currency. When legs price in
        // different currencies that sum is mixed-currency — flag it so ops can
        // see it instead of silently converting a garbage total.
        const legPrices:
          | Array<{ amount: number; currency: string }>
          | undefined = o?.metadata?.legPrices;
        if (Array.isArray(legPrices) && legPrices.length > 1) {
          const legCurrencies = new Set(
            legPrices.map((l) => l.currency).filter(Boolean),
          );
          if (legCurrencies.size > 1) {
            this.logger.warn(
              `Mixed-currency combined offer ${offerId}: legs=[${legPrices
                .map((l) => `${l.amount} ${l.currency}`)
                .join(' + ')}] summed as ${currency}`,
            );
          }
        }

        // Rate-comments amounts (refundPolicy/changePolicy penaltyAmount) were
        // never wired into currency conversion anywhere in the pipeline — only
        // the main fare price went through buildPricingBreakdown above. That
        // left cancellation/change fees permanently in the supplier's raw
        // currency (e.g. INR from a Travelport PCC) regardless of the user's
        // selected display currency, showing on the offer snapshot page,
        // result cards, and success page. Convert them the same way, here at
        // the source, so every downstream surface inherits the fix.
        const refundPolicyInDisplay = await this.convertPolicyCurrency(
          o?.display?.refundPolicy,
          'refund',
          displayCurrency,
        );
        const changePolicyInDisplay = await this.convertPolicyCurrency(
          o?.display?.changePolicy,
          'change',
          displayCurrency,
        );

        return {
          provider: o?.provider ?? 'travelport',
          contentSource: typeof o?.contentSource === 'string' ? o.contentSource : undefined,
          offerId,
          productId: o?.metadata?.productRef ?? '',
          productIds: Array.isArray(o?.metadata?.productRefs)
            ? o.metadata.productRefs
            : o?.metadata?.productRef
              ? [o.metadata.productRef]
              : undefined,
          productSelections: Array.isArray(o?.metadata?.productSelections)
            ? o.metadata.productSelections
            : undefined,
          offeringIdentifierValue,
          brandOfferingId: o?.metadata?.brandOfferingId,
          catalogUuid,
          capabilities: o?.capabilities ?? undefined,
          price: {
            currency,
            total: finalTotal,
            minorUnit: await this.currencyService.getDecimals(currency),
            supplierPrice,
            markupPercent,
          },
          pricing: pricingBlock,
          cabin: o?.cabin,
          brandName: o?.brand?.name,
          stops: typeof o?.stops === 'number' ? o.stops : undefined,
          display: o?.display
            ? {
                airlineCode: o.display.airlineCode,
                airlineName: o.display.airlineName,
                airlineLogoUrl: o.display.airlineLogoUrl,
                flightNumber: o.display.flightNumber,
                origin: o.display.origin ?? { code: '', label: '' },
                destination: o.display.destination ?? { code: '', label: '' },
                durationLabel: o.display.durationLabel,
                stopsLabel: o.display.stopsLabel,
                fareBrand: o.display.fareBrand,
                cabinLabel: o.display.cabinLabel,
                baggage: o.display.baggage,
                changePolicy: changePolicyInDisplay,
                refundPolicy: refundPolicyInDisplay,
                journeys: o.display.journeys,
                supplier: o.display.supplier,
              }
            : undefined,
          segments: Array.isArray(o?.segments)
            ? o.segments.map((s: any) => ({
                from: s?.departure?.airport ?? '',
                to: s?.arrival?.airport ?? '',
                departureAt: [s?.departure?.date, s?.departure?.time]
                  .filter(Boolean)
                  .join('T'),
                arrivalAt: [s?.arrival?.date, s?.arrival?.time]
                  .filter(Boolean)
                  .join('T'),
                marketingCarrier: s?.carrier,
                flightNumber: s?.flightNumber,
                display: s?.display
                  ? {
                      airlineCode: s.display.airlineCode,
                      airlineName: s.display.airlineName,
                      airlineLogoUrl: s.display.airlineLogoUrl,
                      flightNumber: s.display.flightNumber,
                      operatingAirlineName: s.display.operatingAirlineName,
                      origin: s.display.origin ?? { code: '', label: '' },
                      destination: s.display.destination ?? {
                        code: '',
                        label: '',
                      },
                      departureTimeLabel: s.display.departureTimeLabel,
                      arrivalTimeLabel: s.display.arrivalTimeLabel,
                      durationLabel: s.display.durationLabel,
                      aircraftName: s.display.aircraftName,
                      cabinLabel: s.display.cabinLabel,
                      baggageLabel: s.display.baggageLabel,
                    }
                  : undefined,
              }))
            : [],
          refundable: undefined,
          changeable: undefined,
          baggageText: undefined,
        };
      }),
    );

    return {
      searchKey,
      pagination: pagination ?? {
        page: 1,
        pageSize: mappedOffers.length,
        total: mappedOffers.length,
        totalPages: 1,
      },
      offers: mappedOffers,
      warnings: Array.isArray(raw?.warnings) ? raw.warnings : undefined,
      meta: raw?.meta
        ? {
            catalogUuid: raw.meta.catalogUuid,
            providerContexts: raw.meta.providerContexts,
            referenceList: raw.meta.referenceList,
            providerResults: raw.meta.providerResults,
            providerMeta: raw.meta.providerMeta,
          }
        : undefined,
    };
  }

  /**
   * Convert a refund/change policy's penalty amount into the user's display
   * currency, mirroring the main fare price's conversion above. Travelport's
   * Penalty[] amounts come through in whatever currency the fare was priced
   * in (often the PCC's local currency, e.g. INR) — left unconverted, the
   * fee shown in Rate Comments never matched the currency the rest of the
   * page (and the currency selector) uses.
   *
   * Also regenerates `label` when it embeds the old amount/currency (the
   * normalizer's "Cancellation from X Y" / "Changes from X Y" format) so the
   * descriptive text and the numeric fee line stay consistent — a converted
   * number next to a stale-currency label would just be a different flavor
   * of the same bug.
   */
  private async convertPolicyCurrency(
    policy:
      | { label?: string; allowed?: boolean; penaltyAmount?: number; penaltyCurrency?: string; free?: boolean }
      | undefined,
    kind: 'refund' | 'change',
    displayCurrency?: string,
  ): Promise<typeof policy> {
    if (!policy || !displayCurrency) return policy;
    if (policy.penaltyAmount == null || !policy.penaltyCurrency) return policy;
    if (policy.penaltyCurrency === displayCurrency) return policy;

    try {
      const breakdown: PricingBreakdown =
        await this.currencyService.buildPricingBreakdown({
          supplierAmount: policy.penaltyAmount,
          supplierCurrency: policy.penaltyCurrency,
          displayCurrency,
        });
      const converted = breakdown.displayPrice?.amount;
      if (converted == null) return policy;

      const regeneratedLabel =
        policy.allowed && converted > 0
          ? kind === 'change'
            ? `Changes from ${converted} ${displayCurrency}`
            : `Cancellation from ${converted} ${displayCurrency}`
          : policy.label;

      return {
        ...policy,
        penaltyAmount: converted,
        penaltyCurrency: displayCurrency,
        label: regeneratedLabel,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to convert ${kind} policy penalty to ${displayCurrency}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return policy;
    }
  }

  toPreviewView(input: any): BookingPreviewView {
    return {
      bookingId: input.bookingId,
      amount: input.amount,
      currency: input.currency,
      displayAmount: input.displayAmount ?? input.amount,
      displayCurrency: input.displayCurrency ?? input.currency,
      displayExchangeRate: input.displayExchangeRate ?? null,
      status: input.status,
      next: 'payment',
    };
  }

  toConfirmView(input: any): BookingConfirmView {
    return {
      bookingId: input.bookingId,
      status: input.status,
      locatorCode: input.locatorCode,
      workbenchId: input.workbenchId,
      reservationId: input.reservationId,
    };
  }

  toBookingDetailView(input: any): BookingDetailView {
    return {
      id: input.id,
      provider: input.provider,
      status: input.status,
      paymentStatus: input.paymentStatus ?? null,
      amount: input.amount,
      currency: input.currency,
      locatorCode: input.locatorCode,
      workbenchId: input.workbenchId,
      reservationId: input.reservationId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      message: input.message,
      offerSnapshot: input.offerSnapshot ?? null,
      travelerSnapshot: input.travelerSnapshot ?? null,
      workflowSummary: input.workflowSummary ?? null,
    };
  }
}
