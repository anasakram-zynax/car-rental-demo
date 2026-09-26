import { Injectable, Logger } from '@nestjs/common';
import type { DisplayOfferFields, DisplaySegmentFields, NormalizedFlightOffer } from '../../domain/entities/flight-search-response';
import { PrismaReferenceDataRepository } from '../../infrastructure/reference-data/prisma-reference-data.repository';

@Injectable()
export class FlightDisplayEnrichmentService {
  private readonly logger = new Logger(FlightDisplayEnrichmentService.name);

  constructor(
    private readonly refRepo: PrismaReferenceDataRepository,
  ) {}

  async enrichOffers(offers: NormalizedFlightOffer[]): Promise<NormalizedFlightOffer[]> {
    if (offers.length === 0) return offers;

    try {
      return await this.doEnrich(offers);
    } catch (err) {
      this.logger.warn(`Flight display enrichment failed; falling back to codes: ${err instanceof Error ? err.message : err}`);
      return offers;
    }
  }

  private async doEnrich(offers: NormalizedFlightOffer[]): Promise<NormalizedFlightOffer[]> {
    const airlineCodes = new Set<string>();
    const airportCodes = new Set<string>();

    for (const offer of offers) {
      const d = offer.display;
      if (d) {
        if (d.airlineCode && !d.airlineName) airlineCodes.add(d.airlineCode.toUpperCase());
        if (d.origin?.code && !d.origin.cityName) airportCodes.add(d.origin.code.toUpperCase());
        if (d.destination?.code && !d.destination.cityName) airportCodes.add(d.destination.code.toUpperCase());
      }
      for (const seg of offer.segments) {
        const sd = seg.display;
        if (sd) {
          if (sd.airlineCode && !sd.airlineName) airlineCodes.add(sd.airlineCode.toUpperCase());
          if (sd.origin?.code && !sd.origin.cityName) airportCodes.add(sd.origin.code.toUpperCase());
          if (sd.destination?.code && !sd.destination.cityName) airportCodes.add(sd.destination.code.toUpperCase());
        }
      }
    }

    if (airlineCodes.size === 0 && airportCodes.size === 0) return offers;

    const [airlines, airports] = await Promise.all([
      airlineCodes.size > 0 ? this.refRepo.findAirlinesByCodes([...airlineCodes]) : [],
      airportCodes.size > 0 ? this.refRepo.findAirportsByCodes([...airportCodes]) : [],
    ]);

    const airlineMap = new Map<string, { name: string; logoSymbolUrl: string | null; logoLockupUrl: string | null }>();
    for (const a of airlines as any[]) airlineMap.set(a.iataCode, a);
    const airportMap = new Map<string, { name: string; cityName: string | null }>();
    for (const a of airports as any[]) airportMap.set(a.iataCode, a);

    for (const offer of offers) {
      if (offer.display) this.enrichOfferDisplay(offer.display, airlineMap, airportMap);
      for (const seg of offer.segments) {
        if (seg.display) this.enrichSegmentDisplay(seg.display, airlineMap, airportMap);
      }
    }

    return offers;
  }

  private enrichOfferDisplay(
    d: DisplayOfferFields,
    airlineMap: Map<string, { name: string; logoSymbolUrl: string | null; logoLockupUrl: string | null }>,
    airportMap: Map<string, { name: string; cityName: string | null }>,
  ): void {
    if (d.airlineCode && !d.airlineName) {
      const al = airlineMap.get(d.airlineCode.toUpperCase());
      if (al) {
        d.airlineName = al.name;
        d.airlineLogoUrl = al.logoSymbolUrl ?? al.logoLockupUrl ?? undefined;
      }
    }
    if (d.origin?.code && !d.origin.cityName) {
      const ap = airportMap.get(d.origin.code.toUpperCase());
      if (ap) {
        d.origin.cityName = ap.cityName ?? undefined;
        d.origin.airportName = ap.name;
        d.origin.label = ap.cityName
          ? `${ap.cityName} (${d.origin.code})`
          : `${ap.name} (${d.origin.code})`;
      }
    }
    if (d.destination?.code && !d.destination.cityName) {
      const ap = airportMap.get(d.destination.code.toUpperCase());
      if (ap) {
        d.destination.cityName = ap.cityName ?? undefined;
        d.destination.airportName = ap.name;
        d.destination.label = ap.cityName
          ? `${ap.cityName} (${d.destination.code})`
          : `${ap.name} (${d.destination.code})`;
      }
    }
  }

  private enrichSegmentDisplay(
    d: DisplaySegmentFields,
    airlineMap: Map<string, { name: string; logoSymbolUrl: string | null; logoLockupUrl: string | null }>,
    airportMap: Map<string, { name: string; cityName: string | null }>,
  ): void {
    if (d.airlineCode && !d.airlineName) {
      const al = airlineMap.get(d.airlineCode.toUpperCase());
      if (al) {
        d.airlineName = al.name;
        d.airlineLogoUrl = al.logoSymbolUrl ?? al.logoLockupUrl ?? undefined;
      }
    }
    if (d.origin?.code && !d.origin.cityName) {
      const ap = airportMap.get(d.origin.code.toUpperCase());
      if (ap) {
        d.origin.cityName = ap.cityName ?? undefined;
        d.origin.airportName = ap.name;
        d.origin.label = ap.cityName
          ? `${ap.cityName} (${d.origin.code})`
          : `${ap.name} (${d.origin.code})`;
      }
    }
    if (d.destination?.code && !d.destination.cityName) {
      const ap = airportMap.get(d.destination.code.toUpperCase());
      if (ap) {
        d.destination.cityName = ap.cityName ?? undefined;
        d.destination.airportName = ap.name;
        d.destination.label = ap.cityName
          ? `${ap.cityName} (${d.destination.code})`
          : `${ap.name} (${d.destination.code})`;
      }
    }
  }
}
