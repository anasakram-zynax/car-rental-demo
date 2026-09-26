import { Injectable, Logger } from '@nestjs/common';
import type {
  FlightOfferDetailView,
  FlightLocationView,
  FlightSegmentDetailView,
  FlightJourneyDetailView,
  FlightBaggagePerSegment,
} from './flight-offer-detail-view.types';
import type {
  NormalizedFlightOffer,
  NormalizedFlightSegment,
  SelectedOfferCacheEntry,
  ReferenceListProduct,
  ReferenceListFlight,
} from '../../domain/entities/flight-search-response';
import { parseIsoDuration } from './duration-formatter';
import { PrismaReferenceDataRepository } from '../../infrastructure/reference-data/prisma-reference-data.repository';

@Injectable()
export class FlightOfferDetailViewMapper {
  private readonly logger = new Logger(FlightOfferDetailViewMapper.name);

  constructor(
    private readonly refRepo: PrismaReferenceDataRepository,
  ) {}

  async toDetailView(input: {
    provider: 'duffel' | 'travelport' | 'amadeus' | 'manual';
    normalizedOffer: NormalizedFlightOffer;
    rawOffer?: any;
    selectedOfferContext?: SelectedOfferCacheEntry;
    searchKey?: string;
    catalogUuid?: string;
  }): Promise<FlightOfferDetailView> {
    let view: FlightOfferDetailView;

    if (input.provider === 'duffel') {
      view = this.mapDuffel(input);
    } else if (input.provider === 'amadeus') {
      view = this.mapAmadeus(input);
    } else if (input.provider === 'travelport') {
      view = await this.mapTravelport(input);
    } else if (input.provider === 'manual') {
      view = this.mapManual(input);
    } else {
      throw new Error(`FlightOfferDetailView mapping not implemented for provider: ${input.provider}`);
    }

    view = await this.enrichDetailView(view);
    return view;
  }

  async enrichDetailView(view: FlightOfferDetailView): Promise<FlightOfferDetailView> {
    try {
      return await this.doEnrich(view);
    } catch (err) {
      this.logger.warn(`Detail view enrichment failed: ${err instanceof Error ? err.message : err}`);
      return view;
    }
  }

  private async doEnrich(view: FlightOfferDetailView): Promise<FlightOfferDetailView> {
    const airlineCodes = new Set<string>();
    const airportCodes = new Set<string>();

    const addAirportCode = (location: FlightLocationView) => {
      if (location.code && !location.cityName) {
        airportCodes.add(location.code.toUpperCase());
      }
    };

    if (view.airline.code && !view.airline.name) {
      airlineCodes.add(view.airline.code.toUpperCase());
    }

    addAirportCode(view.route.from);
    addAirportCode(view.route.to);

    for (const journey of view.journeys) {
      for (const seg of journey.segments) {
        if (seg.airlineCode && !seg.airlineName) {
          airlineCodes.add(seg.airlineCode.toUpperCase());
        }
        addAirportCode(seg.departure.location);
        addAirportCode(seg.arrival.location);
        if (seg.layoverAfter) {
          addAirportCode(seg.layoverAfter.location);
        }
      }
    }

    if (airlineCodes.size === 0 && airportCodes.size === 0) return view;

    const [airlines, airports] = await Promise.all([
      airlineCodes.size > 0 ? this.refRepo.findAirlinesByCodes([...airlineCodes]) : [],
      airportCodes.size > 0 ? this.refRepo.findAirportsByCodes([...airportCodes]) : [],
    ]);

    const airlineMap = new Map<string, { name: string; logoSymbolUrl: string | null; logoLockupUrl: string | null }>();
    for (const a of airlines as any[]) airlineMap.set(a.iataCode.toUpperCase(), a);

    const airportMap = new Map<string, { name: string; cityName: string | null }>();
    for (const a of airports as any[]) airportMap.set(a.iataCode.toUpperCase(), a);

    const enrichLocation = (location: FlightLocationView) => {
      if (!location.code) return;
      const ap = airportMap.get(location.code.toUpperCase());
      if (!ap) return;
      location.cityName = ap.cityName ?? undefined;
      location.airportName = ap.name;
      location.label = ap.cityName
        ? `${ap.cityName} (${location.code})`
        : `${ap.name} (${location.code})`;
    };

    if (view.airline.code) {
      const al = airlineMap.get(view.airline.code.toUpperCase());
      if (al) {
        view.airline.name = view.airline.name ?? al.name;
        view.airline.logoUrl = view.airline.logoUrl ?? al.logoSymbolUrl ?? al.logoLockupUrl ?? undefined;
      }
    }

    enrichLocation(view.route.from);
    enrichLocation(view.route.to);

    for (const journey of view.journeys) {
      for (const seg of journey.segments) {
        if (seg.airlineCode) {
          const al = airlineMap.get(seg.airlineCode.toUpperCase());
          if (al) {
            seg.airlineName = seg.airlineName ?? al.name;
            seg.airlineLogoUrl = seg.airlineLogoUrl ?? al.logoSymbolUrl ?? al.logoLockupUrl ?? undefined;
          }
        }
        enrichLocation(seg.departure.location);
        enrichLocation(seg.arrival.location);
        if (seg.layoverAfter) {
          enrichLocation(seg.layoverAfter.location);
        }
      }
    }

    return view;
  }

  private async mapTravelport(input: {
    normalizedOffer: NormalizedFlightOffer;
    selectedOfferContext?: SelectedOfferCacheEntry;
    rawOffer?: any;
    searchKey?: string;
    catalogUuid?: string;
  }): Promise<FlightOfferDetailView> {
    const { normalizedOffer, selectedOfferContext, searchKey } = input;
    const cacheEntry = selectedOfferContext;

    const productRefs = normalizedOffer.metadata?.productRefs
      ?? (normalizedOffer.metadata?.productRef ? [normalizedOffer.metadata.productRef] : []);

    const refProducts = cacheEntry?.referenceList?.products ?? {};
    const refFlights = cacheEntry?.referenceList?.flights ?? {};

    const firstProdRef = productRefs[0] ?? normalizedOffer.metadata?.productRef;
    const firstProduct = firstProdRef ? refProducts[firstProdRef] : undefined;

    const firstSeg = normalizedOffer.segments[0];
    const lastSeg = normalizedOffer.segments[normalizedOffer.segments.length - 1];

    const originCode = firstSeg?.departure?.airport ?? '';
    const destCode = lastSeg?.arrival?.airport ?? '';

    const tripType =
      normalizedOffer.display?.journeys && normalizedOffer.display.journeys.length > 1
        ? 'round_trip' : 'one_way';

    const fromLocation: FlightLocationView = {
      code: originCode,
      label: originCode,
    };

    const toLocation: FlightLocationView = {
      code: destCode,
      label: destCode,
    };

    const journeys = this.buildTravelportJourneys(normalizedOffer, refProducts, refFlights);

    const baggageFromDisplay = normalizedOffer.display?.baggage;

    return {
      offerId: normalizedOffer.id,
      provider: 'travelport',
      searchKey,
      catalogUuid: input.catalogUuid,

      route: {
        from: fromLocation,
        to: toLocation,
        tripType,
        totalDurationLabel: normalizedOffer.display?.durationLabel ?? parseIsoDuration(normalizedOffer.totalDuration),
        stopsLabel: normalizedOffer.display?.stopsLabel,
      },

      airline: {
        code: normalizedOffer.display?.airlineCode ?? firstSeg?.carrier,
        name: normalizedOffer.display?.airlineName,
        logoUrl: normalizedOffer.display?.airlineLogoUrl,
        operatingAirlineName: firstSeg?.operatingCarrierName,
      },

      pricing: {
        baseAmount: (normalizedOffer.price?.base ?? 0) > 0 ? normalizedOffer.price!.base : undefined,
        taxAmount: (normalizedOffer.price?.taxes ?? 0) > 0 ? normalizedOffer.price!.taxes : undefined,
        supplierTotal: (normalizedOffer.price?.total ?? 0) > 0 ? normalizedOffer.price!.total : undefined,
        currency: normalizedOffer.price?.currency || 'USD',
      },

      journeys,

      baggage: baggageFromDisplay
        ? {
            summaryLabel: baggageFromDisplay.summaryLabel,
            carryOnLabel: baggageFromDisplay.carryOnLabel,
            checkedLabel: baggageFromDisplay.checkedLabel,
            perSegment: this.buildTravelportBaggagePerSegment(normalizedOffer, cacheEntry),
          }
        : undefined,

      fare: {
        cabin: normalizedOffer.display?.cabinLabel ?? normalizedOffer.cabin,
        fareBrand: normalizedOffer.display?.fareBrand ?? normalizedOffer.brand?.name,
        fareBasisCode: normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
        changePolicy: normalizedOffer.display?.changePolicy,
        refundPolicy: normalizedOffer.display?.refundPolicy,
      },

      passengerRequirements: undefined,

      amenities: undefined,

      adminDebug: {
        provider: 'travelport',
        contentSource: normalizedOffer.contentSource,
        productIds: productRefs.length > 0 ? productRefs : undefined,
        offeringId: normalizedOffer.metadata?.offeringId ?? normalizedOffer.id,
        catalogUuid: input.catalogUuid,
        fareBasisCode: normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
      },
    };
  }

  private buildTravelportJourneys(
    normalizedOffer: NormalizedFlightOffer,
    refProducts: Record<string, ReferenceListProduct>,
    refFlights: Record<string, ReferenceListFlight>,
  ): FlightJourneyDetailView[] {
    const journeyMeta = normalizedOffer.display?.journeys;
    const segments = normalizedOffer.segments;

    if (!segments.length) return [];

    if (journeyMeta && journeyMeta.length > 0) {
      let segOffset = 0;
      return journeyMeta.map((jm) => {
        const journeySegs = segments.slice(segOffset, segOffset + jm.segmentCount);
        segOffset += jm.segmentCount;
        return {
          direction: jm.direction,
          label: jm.label,
          durationLabel: undefined,
          segments: journeySegs.map((seg, i) =>
            this.mapTravelportSegmentToDetail(seg, i, refProducts, refFlights)
          ),
        };
      });
    }

    return [{
      direction: 'itinerary',
      label: 'Flight',
      durationLabel: undefined,
      segments: segments.map((seg, i) =>
        this.mapTravelportSegmentToDetail(seg, i, refProducts, refFlights)
      ),
    }];
  }

  private mapTravelportSegmentToDetail(
    seg: NormalizedFlightSegment,
    index: number,
    refProducts: Record<string, ReferenceListProduct>,
    refFlights: Record<string, ReferenceListFlight>,
  ): FlightSegmentDetailView {
    const flightRef = this.resolveFlightForSegment(seg, refProducts, refFlights);

    const dep = seg.departure;
    const arr = seg.arrival;

    const flightNumberDisplay = seg.carrier && seg.flightNumber
      ? `${seg.carrier} ${seg.flightNumber}`
      : seg.flightNumber;

    const aircraftCode = seg.equipment ?? flightRef?.equipment;
    const aircraftName = flightRef?.equipment;

    return {
      segmentIndex: index,
      airlineCode: seg.carrier,
      airlineName: seg.display?.airlineName,
      airlineLogoUrl: seg.display?.airlineLogoUrl,
      flightNumber: flightNumberDisplay,
      operatingAirlineName: seg.operatingCarrierName ?? seg.display?.operatingAirlineName,
      aircraftCode,
      aircraftName,

      departure: {
        location: {
          code: dep?.airport ?? '',
          cityName: seg.display?.origin?.cityName,
          airportName: seg.display?.origin?.airportName,
          terminal: dep?.terminal ?? seg.display?.origin?.terminal,
          label: seg.display?.origin?.label ?? dep?.airport ?? '',
        },
        date: dep?.date ?? '',
        time: dep?.time ? dep.time.slice(0, 5) : '',
      },

      arrival: {
        location: {
          code: arr?.airport ?? '',
          cityName: seg.display?.destination?.cityName,
          airportName: seg.display?.destination?.airportName,
          terminal: arr?.terminal ?? seg.display?.destination?.terminal,
          label: seg.display?.destination?.label ?? arr?.airport ?? '',
        },
        date: arr?.date ?? '',
        time: arr?.time ? arr.time.slice(0, 5) : '',
      },

      durationLabel: seg.display?.durationLabel ?? parseIsoDuration(seg.duration),
      cabin: seg.display?.cabinLabel,
      fareBasisCode: undefined,
      baggageLabel: seg.display?.baggageLabel,
    };
  }

  private resolveFlightForSegment(
    seg: NormalizedFlightSegment,
    refProducts: Record<string, ReferenceListProduct>,
    refFlights: Record<string, ReferenceListFlight>,
  ): ReferenceListFlight | undefined {
    const allFlights = Object.values(refFlights);
    if (seg.carrier && seg.flightNumber) {
      const match = allFlights.find(
        (f) => f.carrier === seg.carrier && f.number === seg.flightNumber,
      );
      if (match) return match;
    }
    if (seg.departure?.airport && seg.arrival?.airport) {
      const match = allFlights.find(
        (f) =>
          f.carrier === seg.carrier &&
          f.departure?.location === seg.departure?.airport &&
          f.arrival?.location === seg.arrival?.airport,
      );
      if (match) return match;
    }
    return undefined;
  }

  private buildTravelportBaggagePerSegment(
    normalizedOffer: NormalizedFlightOffer,
    cacheEntry?: SelectedOfferCacheEntry,
  ): FlightBaggagePerSegment[] | undefined {
    if (!normalizedOffer.baggage) return undefined;
    const segments = normalizedOffer.segments;
    return segments.map((seg, i) => ({
      segmentIndex: i,
      label: seg.display?.baggageLabel ?? '',
      included: true,
      quantity: 0,
    }));
  }

  private mapManual(input: {
    normalizedOffer: NormalizedFlightOffer;
    rawOffer?: any;
    searchKey?: string;
    catalogUuid?: string;
  }): FlightOfferDetailView {
    // Manual (seed/demo) offers: normalizedOffer IS the card's offerData
    // (FlightOfferView shape). Build the detail view directly from it.
    const { normalizedOffer, searchKey } = input;
    const offer = (normalizedOffer as any) as Record<string, any>;
    const segments: Record<string, any>[] = Array.isArray(offer.segments) ? offer.segments : [];
    const firstSeg = segments[0] ?? undefined;
    const lastSeg = segments[segments.length - 1] ?? undefined;

    const makeLoc = (code?: string, name?: string): FlightLocationView => ({
      code: code ?? '',
      label: code ? (name ? `${name} (${code})` : code) : (name ?? ''),
    });

    const fmtTime = (iso?: string) =>
      iso
        ? new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : '';
    const fmtDate = (iso?: string) => (iso ? new Date(iso).toISOString().split('T')[0] : '');

    const direction: 'outbound' | 'return' | 'itinerary' =
      (offer?.returnSegments?.length ?? 0) > 0 ? 'outbound' : 'itinerary';
    const journeyViews: FlightJourneyDetailView[] = [];
    const outbound: FlightSegmentDetailView[] = segments.map((seg, i) => ({
      segmentIndex: i,
      airlineCode: seg.marketingCarrier ?? seg.marketing_carrier ?? offer.display?.airlineCode,
      airlineName: seg.display?.airlineName ?? offer.display?.airlineName,
      airlineLogoUrl: seg.display?.airlineLogoUrl ?? offer.display?.airlineLogoUrl,
      flightNumber: seg.flightNumber ?? seg.flight_number,
      departure: {
        location: makeLoc(seg.from, seg.display?.fromAirportName ?? seg.from),
        date: fmtDate(seg.departureAt ?? seg.departure_at),
        time: fmtTime(seg.departureAt ?? seg.departure_at),
      },
      arrival: {
        location: makeLoc(seg.to, seg.display?.toAirportName ?? seg.to),
        date: fmtDate(seg.arrivalAt ?? seg.arrival_at),
        time: fmtTime(seg.arrivalAt ?? seg.arrival_at),
      },
      durationLabel: seg.display?.duration ?? seg.duration,
      cabin: offer.cabin ?? seg.cabin,
    }));
    journeyViews.push({
      direction,
      label: direction === 'outbound' ? 'Outbound' : 'Flight',
      durationLabel: offer.display?.durationLabel,
      segments: outbound,
    });
    const returnSegs: Record<string, any>[] = Array.isArray(offer.returnSegments) ? offer.returnSegments : [];
    if (returnSegs.length > 0) {
      journeyViews.push({
        direction: 'return',
        label: 'Return',
        durationLabel: offer.display?.returnDurationLabel,
        segments: returnSegs.map((seg, i) => ({
          segmentIndex: i,
          airlineCode: seg.marketingCarrier ?? seg.marketing_carrier ?? offer.display?.airlineCode,
          airlineName: seg.display?.airlineName ?? offer.display?.airlineName,
          airlineLogoUrl: seg.display?.airlineLogoUrl ?? offer.display?.airlineLogoUrl,
          flightNumber: seg.flightNumber ?? seg.flight_number,
          departure: {
            location: makeLoc(seg.from, seg.display?.fromAirportName ?? seg.from),
            date: fmtDate(seg.departureAt ?? seg.departure_at),
            time: fmtTime(seg.departureAt ?? seg.departure_at),
          },
          arrival: {
            location: makeLoc(seg.to, seg.display?.toAirportName ?? seg.to),
            date: fmtDate(seg.arrivalAt ?? seg.arrival_at),
            time: fmtTime(seg.arrivalAt ?? seg.arrival_at),
          },
          durationLabel: seg.display?.duration ?? seg.duration,
          cabin: offer.cabin ?? seg.cabin,
        })),
      });
    }

    const supplierPrice = offer.pricing?.supplierPrice ?? {
      amount: offer.price?.supplierPrice ?? offer.price?.total ?? 0,
      currency: offer.price?.currency ?? 'USD',
    };

    return {
      offerId: String(offer.offerId ?? offer.id ?? normalizedOffer.id),
      provider: 'manual',
      searchKey,
      catalogUuid: input.catalogUuid ?? `manual:${offer.offerId ?? offer.id ?? normalizedOffer.id}`,

      route: {
        from: makeLoc(firstSeg?.from, firstSeg?.display?.fromAirportName),
        to: makeLoc(lastSeg?.to, lastSeg?.display?.toAirportName),
        tripType: returnSegs.length > 0 ? 'round_trip' : 'one_way',
        totalDurationLabel: offer.display?.durationLabel,
        stopsLabel: offer.display?.stopsLabel ?? (offer.stops === 0 ? 'Nonstop' : undefined),
      },

      airline: {
        code: offer.display?.airlineCode,
        name: offer.display?.airlineName ?? offer.airlineName,
        logoUrl: offer.display?.airlineLogoUrl,
        operatingAirlineName: undefined,
        conditionsOfCarriageUrl: undefined,
      },

      pricing: {
        baseAmount: offer.price?.supplierPrice ?? offer.price?.total ?? 0,
        taxAmount: 0,
        supplierTotal: supplierPrice.amount,
        currency: supplierPrice.currency ?? offer.price?.currency ?? 'USD',
      },

      journeys: journeyViews,

      baggage: {
        summaryLabel: offer.baggageText ?? undefined,
      },

      fare: {
        cabin: offer.cabin ?? offer.display?.cabinLabel,
        fareBrand: offer.brandName ?? offer.display?.fareBrand,
        classOfService: offer.classOfService,
        changePolicy: offer.changeable
          ? { label: 'Changeable', allowed: true }
          : { label: 'Non-changeable', allowed: false },
        refundPolicy: offer.refundable
          ? { label: 'Refundable', allowed: true }
          : { label: 'Non-refundable', allowed: false },
      },

      amenities: undefined,

      adminDebug: {
        provider: 'manual',
        contentSource: 'MANUAL',
        offeringId: String(offer.offerId ?? offer.id ?? normalizedOffer.id),
      },
    } as FlightOfferDetailView;
  }

  private mapDuffel(input: {
    normalizedOffer: NormalizedFlightOffer;
    rawOffer?: any;
    searchKey?: string;
    catalogUuid?: string;
  }): FlightOfferDetailView {
    const { normalizedOffer, rawOffer, searchKey } = input;
    const offer = rawOffer as Record<string, any> | undefined;
    const slices: Record<string, any>[] = offer?.slices ?? [];
    const firstSlice = slices[0] as Record<string, any> | undefined;
    const lastSlice = slices.length > 0 ? slices[slices.length - 1] as Record<string, any> : firstSlice;

    const tripType = slices.length > 1 ? 'round_trip' : 'one_way';

    const originPlace = firstSlice?.origin as Record<string, any> | undefined;
    const destPlace = lastSlice?.destination as Record<string, any> | undefined;

    const fromLocation = this.makeLocation(originPlace);
    const toLocation = this.makeLocation(destPlace);

    const owner = offer?.owner as Record<string, any> | undefined;

    const firstSegmentRaw = firstSlice?.segments?.[0] as Record<string, any> | undefined;

    const carrierCode = owner?.iata_code
      ?? normalizedOffer.display?.airlineCode
      ?? firstSegmentRaw?.marketing_carrier?.iata_code;

    const carrierName = owner?.name
      ?? normalizedOffer.display?.airlineName
      ?? firstSegmentRaw?.marketing_carrier?.name;

    const journeys = this.buildDuffelJourneys(slices, owner, carrierCode);
    const allSegments = journeys.flatMap((j) => j.segments);

    return {
      offerId: normalizedOffer.id,
      provider: 'duffel',
      searchKey,
      catalogUuid: input.catalogUuid ?? `duffel:${normalizedOffer.id}`,

      route: {
        from: fromLocation,
        to: toLocation,
        tripType,
        totalDurationLabel: normalizedOffer.display?.durationLabel,
        stopsLabel: normalizedOffer.display?.stopsLabel,
      },

      airline: {
        code: carrierCode,
        name: carrierName,
        logoUrl: owner?.logo_symbol_url ?? normalizedOffer.display?.airlineLogoUrl,
        operatingAirlineName: firstSegmentRaw?.operating_carrier?.name,
        conditionsOfCarriageUrl: owner?.conditions_of_carriage_url,
      },

      pricing: {
        baseAmount: offer?.base_amount
          ? Number(offer.base_amount)
          : (normalizedOffer.price?.base ?? normalizedOffer.pricing?.supplierPrice?.amount ?? 0),
        taxAmount: offer?.tax_amount
          ? Number(offer.tax_amount)
          : (normalizedOffer.price?.taxes ?? 0),
        supplierTotal: offer?.total_amount
          ? Number(offer.total_amount)
          : (normalizedOffer.price?.total ?? normalizedOffer.pricing?.supplierPrice?.amount ?? (normalizedOffer as any).totalPrice ?? 0),
        currency: offer?.total_currency
          ?? normalizedOffer.price?.currency
          ?? normalizedOffer.pricing?.supplierPrice?.currency
          ?? (normalizedOffer as any).currency
          ?? 'USD',
        offerExpiresAt: offer?.expires_at,
        paymentRequiredBy: this.extractDuffelPaymentDeadline(offer),
        priceGuaranteeExpiresAt: this.extractDuffelPriceGuarantee(offer),
      },

      journeys,

      baggage: this.buildDuffelBaggage(allSegments, journeys),

      fare: {
        cabin: normalizedOffer.cabin ?? normalizedOffer.display?.cabinLabel,
        cabinMarketingName: firstSegmentRaw?.passengers?.[0]?.cabin_class_marketing_name,
        fareBrand: normalizedOffer.display?.fareBrand,
        fareBasisCode: firstSegmentRaw?.passengers?.[0]?.fare_basis_code ?? normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
        changePolicy: normalizedOffer.display?.changePolicy,
        refundPolicy: normalizedOffer.display?.refundPolicy,
      },

      passengerRequirements: {
        identityDocumentsRequired: (offer as any)?.passenger_identity_documents_required ?? undefined,
        supportedIdentityDocumentTypes: (offer as any)?.supported_passenger_identity_document_types,
        supportedLoyaltyProgrammes: (offer as any)?.supported_loyalty_programmes,
      },

      amenities: undefined,

      adminDebug: {
        provider: 'duffel',
        contentSource: 'NDC',
        offeringId: normalizedOffer.id,
        fareBasisCode: firstSegmentRaw?.passengers?.[0]?.fare_basis_code ?? normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
      },
    };
  }

  private mapAmadeus(input: {
    normalizedOffer: NormalizedFlightOffer;
    searchKey?: string;
    catalogUuid?: string;
  }): FlightOfferDetailView {
    const { normalizedOffer, searchKey } = input;
    const display = normalizedOffer.display;
    const segments = normalizedOffer.segments;

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    const originCode = firstSeg?.departure?.airport ?? '';
    const destCode = lastSeg?.arrival?.airport ?? '';

    const journeyMeta = display?.journeys;
    const tripType = journeyMeta && journeyMeta.length > 1 ? 'round_trip' : 'one_way';

    const fromLocation: FlightLocationView = {
      code: originCode,
      label: originCode,
    };

    const toLocation: FlightLocationView = {
      code: destCode,
      label: destCode,
    };

    const allJourneys = this.buildAmadeusJourneys(normalizedOffer);

    const baggageFromDisplay = display?.baggage;

    return {
      offerId: normalizedOffer.id,
      provider: 'amadeus',
      searchKey,
      catalogUuid: input.catalogUuid ?? `amadeus:${normalizedOffer.id}`,

      route: {
        from: fromLocation,
        to: toLocation,
        tripType,
        totalDurationLabel: display?.durationLabel,
        stopsLabel: display?.stopsLabel,
      },

      airline: {
        code: display?.airlineCode ?? firstSeg?.carrier,
        name: display?.airlineName,
        logoUrl: display?.airlineLogoUrl,
        operatingAirlineName: firstSeg?.display?.operatingAirlineName,
      },

      pricing: {
        baseAmount: normalizedOffer.price?.base ?? 0,
        taxAmount: normalizedOffer.price?.taxes ?? 0,
        supplierTotal: normalizedOffer.price?.total ?? 0,
        currency: normalizedOffer.price?.currency ?? 'USD',
      },

      journeys: allJourneys,

      baggage: baggageFromDisplay
        ? {
            summaryLabel: baggageFromDisplay.summaryLabel,
            carryOnLabel: baggageFromDisplay.carryOnLabel,
            checkedLabel: baggageFromDisplay.checkedLabel,
            perSegment: segments.map((seg, i) => ({
              segmentIndex: i,
              label: seg.display?.baggageLabel ?? '',
              included: true,
              quantity: 0,
            })),
          }
        : undefined,

      fare: {
        cabin: display?.cabinLabel ?? normalizedOffer.cabin,
        fareBrand: display?.fareBrand ?? normalizedOffer.brand?.name,
        fareBasisCode: normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
        changePolicy: display?.changePolicy,
        refundPolicy: display?.refundPolicy,
      },

      passengerRequirements: undefined,

      amenities: undefined,

      adminDebug: {
        provider: 'amadeus',
        contentSource: normalizedOffer.contentSource ?? 'GDS',
        offeringId: normalizedOffer.id,
        fareBasisCode: normalizedOffer.fareBasisCode,
        classOfService: normalizedOffer.classOfService,
      },
    };
  }

  private buildAmadeusJourneys(
    normalizedOffer: NormalizedFlightOffer,
  ): FlightJourneyDetailView[] {
    const segments = normalizedOffer.segments;
    const journeyMeta = normalizedOffer.display?.journeys;

    if (!segments.length) return [];

    if (journeyMeta && journeyMeta.length > 0) {
      let segOffset = 0;
      return journeyMeta.map((jm) => {
        const journeySegs = segments.slice(segOffset, segOffset + jm.segmentCount);
        segOffset += jm.segmentCount;
        return {
          direction: jm.direction,
          label: jm.label,
          durationLabel: undefined,
          segments: journeySegs.map((seg, i) => this.mapAmadeusSegmentToDetail(seg, segOffset - journeySegs.length + i)),
        };
      });
    }

    return [{
      direction: 'itinerary',
      label: 'Flight',
      durationLabel: undefined,
      segments: segments.map((seg, i) => this.mapAmadeusSegmentToDetail(seg, i)),
    }];
  }

  private mapAmadeusSegmentToDetail(
    seg: NormalizedFlightSegment,
    index: number,
  ): FlightSegmentDetailView {
    const dep = seg.departure;
    const arr = seg.arrival;

    const flightNumberDisplay = seg.carrier && seg.flightNumber
      ? `${seg.carrier} ${seg.flightNumber}`
      : seg.flightNumber;

    return {
      segmentIndex: index,
      airlineCode: seg.carrier,
      airlineName: seg.display?.airlineName,
      airlineLogoUrl: seg.display?.airlineLogoUrl,
      flightNumber: flightNumberDisplay,
      operatingAirlineName: seg.display?.operatingAirlineName,
      aircraftCode: seg.equipment,
      aircraftName: seg.display?.aircraftName,

      departure: {
        location: {
          code: dep?.airport ?? '',
          cityName: seg.display?.origin?.cityName,
          airportName: seg.display?.origin?.airportName,
          terminal: dep?.terminal ?? seg.display?.origin?.terminal,
          label: seg.display?.origin?.label ?? dep?.airport ?? '',
        },
        date: dep?.date ?? '',
        time: dep?.time ? dep.time.slice(0, 5) : '',
      },

      arrival: {
        location: {
          code: arr?.airport ?? '',
          cityName: seg.display?.destination?.cityName,
          airportName: seg.display?.destination?.airportName,
          terminal: arr?.terminal ?? seg.display?.destination?.terminal,
          label: seg.display?.destination?.label ?? arr?.airport ?? '',
        },
        date: arr?.date ?? '',
        time: arr?.time ? arr.time.slice(0, 5) : '',
      },

      durationLabel: seg.display?.durationLabel ?? parseIsoDuration(seg.duration),
      cabin: seg.display?.cabinLabel,
      fareBasisCode: undefined,
      baggageLabel: seg.display?.baggageLabel,
    };
  }

  private buildDuffelJourneys(
    slices: Record<string, any>[],
    owner: Record<string, any> | undefined,
    carrierCode?: string,
  ): FlightJourneyDetailView[] {
    if (!slices.length) {
      return [];
    }
    let segmentOffset = 0;
    return slices.map((slice, sliceIndex) => {
      const direction: 'outbound' | 'return' | 'itinerary' =
        slices.length <= 1 ? 'itinerary' : sliceIndex === 0 ? 'outbound' : 'return';
      const label =
        slices.length <= 1 ? 'Flight' : sliceIndex === 0 ? 'Outbound' : 'Return';

      const rawSegments: Record<string, any>[] = slice.segments ?? [];
      const segments: FlightSegmentDetailView[] = [];
      for (let i = 0; i < rawSegments.length; i++) {
        const globalIndex = segmentOffset + i;
        const seg = rawSegments[i];

        const origin = seg.origin as Record<string, any> | undefined;
        const destination = seg.destination as Record<string, any> | undefined;

        const depDate = seg.departing_at ? new Date(seg.departing_at).toISOString().split('T')[0] : '';
        const depTime = seg.departing_at
          ? new Date(seg.departing_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : '';
        const arrDate = seg.arriving_at ? new Date(seg.arriving_at).toISOString().split('T')[0] : '';
        const arrTime = seg.arriving_at
          ? new Date(seg.arriving_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : '';

        const passenger = seg.passengers?.[0] as Record<string, any> | undefined;
        const baggageParts = this.extractDuffelBaggageParts(seg);

        const segmentView: FlightSegmentDetailView = {
          segmentIndex: globalIndex + i,
          airlineCode: seg.marketing_carrier?.iata_code ?? carrierCode,
          airlineName: seg.marketing_carrier?.name,
          airlineLogoUrl: seg.marketing_carrier?.logo_symbol_url ?? owner?.logo_symbol_url,
          flightNumber: seg.marketing_carrier_flight_number,
          operatingAirlineName: seg.operating_carrier?.name,
          aircraftCode: seg.aircraft?.iata_code,
          aircraftName: seg.aircraft?.name,

          departure: {
            location: this.makeLocation(origin),
            date: depDate,
            time: depTime,
          },

          arrival: {
            location: this.makeLocation(destination),
            date: arrDate,
            time: arrTime,
          },

          durationLabel: parseIsoDuration(seg.duration) || undefined,
          cabin: passenger?.cabin_class,
          cabinMarketingName: passenger?.cabin_class_marketing_name,
          fareBasisCode: passenger?.fare_basis_code,
          baggageLabel: baggageParts.join('; ') || undefined,

          layoverAfter: this.buildLayover(rawSegments, i, origin, destination),
        };

        segments.push(segmentView);
      }

      const journeyDuration = slice.duration
        ? parseIsoDuration(slice.duration)
        : undefined;

      segmentOffset += rawSegments.length;

      return {
        direction,
        label,
        durationLabel: journeyDuration,
        segments,
      };
    });
  }

  private buildDuffelBaggage(
    allSegments: FlightSegmentDetailView[],
    journeys: FlightJourneyDetailView[],
  ): FlightOfferDetailView['baggage'] {
    let carryOnTotal = 0;
    let checkedTotal = 0;
    let carryOnWeight: number | undefined;
    let checkedWeight: number | undefined;

    const perSegment: FlightBaggagePerSegment[] = [];

    for (const rawOfferSegments of journeys.map((j) => j.segments)) {
      for (const seg of rawOfferSegments) {
        if (seg.baggageLabel) {
          let included = true;
          let qty = 0;
          let weightText: string | undefined;
          const labelParts = seg.baggageLabel.split('; ');

          for (const part of labelParts) {
            if (part.toLowerCase().startsWith('checked')) {
              included = true;
              qty++;
              const weightMatch = part.match(/(\d+)\s*kg/i);
              if (weightMatch) weightText = `${weightMatch[1]}kg`;
            } else if (part.toLowerCase().startsWith('carry-on')) {
              carryOnTotal++;
              const weightMatch = part.match(/(\d+)\s*kg/i);
              if (weightMatch) carryOnWeight = Math.max(carryOnWeight ?? 0, Number(weightMatch[1]));
            }
          }

          if (qty > 0) {
            checkedTotal += qty;
            checkedWeight = weightText ? Math.max(checkedWeight ?? 0, Number(weightText.replace('kg', ''))) : checkedWeight;
          }

          perSegment.push({
            segmentIndex: seg.segmentIndex,
            label: seg.baggageLabel,
            included: included,
            quantity: qty,
            weightText,
          });
        }
      }
    }

    const carryOnLabel = carryOnTotal > 0
      ? carryOnWeight
        ? `Carry-on: ${carryOnTotal} piece up to ${carryOnWeight}kg`
        : `Carry-on: ${carryOnTotal} piece`
      : undefined;

    const checkedLabel = checkedTotal > 0
      ? checkedWeight
        ? `Checked: ${checkedTotal} piece${checkedTotal > 1 ? 's' : ''} up to ${checkedWeight}kg each`
        : `Checked: ${checkedTotal} piece${checkedTotal > 1 ? 's' : ''}`
      : undefined;

    const summaryParts: string[] = [];
    if (carryOnTotal > 0) summaryParts.push('Carry-on');
    if (checkedTotal > 0) summaryParts.push('Checked bag');
    const summaryLabel = summaryParts.length > 0 ? summaryParts.join(' + ') : undefined;

    if (!carryOnLabel && !checkedLabel) return undefined;

    return {
      summaryLabel,
      carryOnLabel,
      checkedLabel,
      perSegment: perSegment.length > 0 ? perSegment : undefined,
    };
  }

  private extractDuffelBaggageParts(seg: Record<string, any>): string[] {
    const parts: string[] = [];
    const passengers: Record<string, any>[] = seg.passengers ?? [];
    for (const p of passengers) {
      const baggages: Record<string, any>[] = p.baggages ?? [];
      for (const b of baggages) {
        if (b.type === 'checked') {
          parts.push(`Checked: ${b.quantity}pc${b.weight_kg ? ` ${b.weight_kg}kg` : ''}`);
        } else if (b.type === 'carry_on') {
          parts.push(`Carry-on: ${b.quantity}pc${b.weight_kg ? ` ${b.weight_kg}kg` : ''}`);
        }
      }
    }
    return parts;
  }

  private buildLayover(
    segments: Record<string, any>[],
    currentIndex: number,
    origin?: Record<string, any>,
    _destination?: Record<string, any>,
  ): { location: FlightLocationView; durationLabel: string; overnight?: boolean } | undefined {
    if (currentIndex >= segments.length - 1) return undefined;

    const nextSeg = segments[currentIndex + 1];
    if (!nextSeg) return undefined;

    const currentArrival = segments[currentIndex]?.arriving_at;
    const nextDeparture = nextSeg.departing_at;
    if (!currentArrival || !nextDeparture) return undefined;

    const layoverMs = new Date(nextDeparture).getTime() - new Date(currentArrival).getTime();
    if (layoverMs <= 0) return undefined;

    const layoverMinutes = Math.floor(layoverMs / 60000);
    const hours = Math.floor(layoverMinutes / 60);
    const minutes = layoverMinutes % 60;
    const durationLabel = hours > 0
      ? `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim()
      : `${minutes}m`;

    const overnight = new Date(currentArrival).getDate() !== new Date(nextDeparture).getDate();

    const layoverLocation = this.makeLocation(nextSeg.origin as Record<string, any> | undefined);

    return { location: layoverLocation, durationLabel, overnight };
  }

  private extractDuffelPaymentDeadline(offer?: Record<string, any>): string | undefined {
    if (!offer) return undefined;
    const pr = offer.payment_requirements as Record<string, any> | undefined;
    return pr?.required_by ?? pr?.payment_required_by ?? undefined;
  }

  private extractDuffelPriceGuarantee(offer?: Record<string, any>): string | undefined {
    if (!offer) return undefined;
    const pr = offer.payment_requirements as Record<string, any> | undefined;
    return pr?.price_guarantee_expires_at ?? undefined;
  }

  private makeLocation(place?: Record<string, any>): FlightLocationView {
    if (!place) {
      return { code: '', label: '' };
    }
    const code = place.iata_code ?? '';
    const cityName = place.city_name ?? place.city;
    const airportName = place.name;
    const terminal = place.terminal;
    const timezone = place.time_zone;

    const label = cityName
      ? `${cityName} (${code})`
      : airportName
        ? `${airportName} (${code})`
        : code;

    return { code, cityName, airportName, terminal, timezone, label };
  }
}
