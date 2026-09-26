import { Injectable } from '@nestjs/common';
import type { AncillaryCatalogOption } from '../../domain/entities/ancillary-catalog.types';

export interface TravelerIdEntry {
  localRef: string;
  travelportTravelerId?: string;
  travelportTravelerIdentifierValue?: string;
}

@Injectable()
export class TravelportWorkflowResponseParserService {
  extractSearchIdentifiers(
    response: unknown,
    preferred?: { offeringId?: string; productId?: string },
  ) {
    const root = response as {
      CatalogProductOfferingsResponse?: {
        CatalogProductOfferings?: {
          Identifier?: { value?: string };
          CatalogProductOffering?: Array<{
            id?: string;
            ProductBrandOptions?: Array<{
              ProductBrandOffering?: Array<{
                Product?: Array<{ productRef?: string }>;
                BestCombinablePrice?: {
                  CurrencyCode?: { value?: string; decimalPlace?: number };
                  TotalPrice?: number;
                };
              }>;
            }>;
          }>;
        };
      };
    };

    const offeringsRoot =
      root?.CatalogProductOfferingsResponse?.CatalogProductOfferings;
    const catalogOfferings = offeringsRoot?.CatalogProductOffering ?? [];
    const fallback = this.findFirstSearchProduct(catalogOfferings);
    const selected = this.findMatchingSearchProduct(
      catalogOfferings,
      preferred,
    );
    const chosen = selected ?? fallback;
    const pricing = chosen?.brandOffering?.BestCombinablePrice;
    const productIds = chosen?.brandOffering?.Product?.map(
      (product) => product?.productRef,
    ).filter((value): value is string => Boolean(value));

    return {
      catalogUuid: offeringsRoot?.Identifier?.value,
      offeringId: chosen?.offering?.id,
      productId: chosen?.brandOffering?.Product?.[0]?.productRef,
      productIds: productIds?.length ? productIds : undefined,
      productSelections:
        chosen?.offering?.id && productIds?.length
          ? [{ offeringId: chosen.offering.id, productIds }]
          : undefined,
      currencyCode: pricing?.CurrencyCode?.value,
      minorUnit: pricing?.CurrencyCode?.decimalPlace,
      totalPrice:
        typeof pricing?.TotalPrice === 'number'
          ? pricing.TotalPrice
          : undefined,
    };
  }

  private findMatchingSearchProduct(
    offerings: Array<{
      id?: string;
      ProductBrandOptions?: Array<{
        ProductBrandOffering?: Array<{
          Product?: Array<{ productRef?: string }>;
          BestCombinablePrice?: {
            CurrencyCode?: { value?: string; decimalPlace?: number };
            TotalPrice?: number;
          };
        }>;
      }>;
    }>,
    preferred?: { offeringId?: string; productId?: string },
  ) {
    const preferredOfferingId = preferred?.offeringId?.trim();
    const preferredProductId = preferred?.productId?.trim();

    if (!preferredOfferingId && !preferredProductId) return undefined;

    for (const offering of offerings) {
      if (preferredOfferingId && offering.id !== preferredOfferingId) continue;

      const brandOfferings = (offering.ProductBrandOptions ?? []).flatMap(
        (option) => option.ProductBrandOffering ?? [],
      );

      for (const brandOffering of brandOfferings) {
        const productRef = brandOffering.Product?.[0]?.productRef;
        if (!productRef) continue;
        if (preferredProductId && productRef !== preferredProductId) continue;
        return { offering, brandOffering };
      }
    }

    return undefined;
  }

  private findFirstSearchProduct(
    offerings: Array<{
      id?: string;
      ProductBrandOptions?: Array<{
        ProductBrandOffering?: Array<{
          Product?: Array<{ productRef?: string }>;
          BestCombinablePrice?: {
            CurrencyCode?: { value?: string; decimalPlace?: number };
            TotalPrice?: number;
          };
        }>;
      }>;
    }>,
  ) {
    for (const offering of offerings) {
      const brandOfferings = (offering.ProductBrandOptions ?? []).flatMap(
        (option) => option.ProductBrandOffering ?? [],
      );

      for (const brandOffering of brandOfferings) {
        if (brandOffering.Product?.[0]?.productRef) {
          return { offering, brandOffering };
        }
      }
    }
    return undefined;
  }

  extractWorkbenchIdentifiers(
    response: unknown,
    headers: Record<string, string>,
  ) {
    const root = response as {
      ReservationResponse?: {
        Reservation?: { Identifier?: { value?: string } };
        Identifier?: { value?: string };
        SessionIdentifier?: string;
        sessionIdentifier?: string;
      };
      workbenchId?: string;
      id?: string;
      sessionIdentifier?: string;
    };

    const reservation = root?.ReservationResponse?.Reservation;
    const workbenchId =
      reservation?.Identifier?.value ??
      root?.ReservationResponse?.Identifier?.value ??
      root?.workbenchId ??
      root?.id;
    const sessionIdFromBody =
      root?.ReservationResponse?.SessionIdentifier ??
      root?.ReservationResponse?.sessionIdentifier ??
      root?.sessionIdentifier;
    const sessionIdFromHeaders =
      headers['travelportplussessionidentifier'] ??
      headers['travelport-plus-session-identifier'] ??
      headers['travelport-plus-session-id'] ??
      headers['travelportplussessionid'] ??
      headers['tp-session-id'] ??
      headers['x-travelport-sessionid'];
    const sessionIdFromAnyHeader = this.findHeaderValueByKeyFragment(headers, [
      'session',
      'travelport',
    ]);
    const sessionIdFromSearch = this.findFirstStringValueByKeys(response, [
      'SessionIdentifier',
      'sessionIdentifier',
      'travelportPlusSessionIdentifier',
    ]);
    const sessionId =
      sessionIdFromBody ??
      sessionIdFromHeaders ??
      sessionIdFromAnyHeader ??
      sessionIdFromSearch;

    return { workbenchId, sessionId };
  }

  extractOfferIdentifiers(response: unknown) {
    const root = response as {
      OfferListResponse?: {
        OfferID?: Array<{
          id?: string;
          offerRef?: string;
          Identifier?: { value?: string; authority?: string };
        }>;
        Offer?: Array<{
          id?: string;
          offerRef?: string;
          Identifier?: { value?: string; authority?: string };
        }>;
      };
      ReservationResponse?: {
        Reservation?: {
          Offer?: Array<{
            id?: string;
            offerRef?: string;
            Identifier?: { value?: string; authority?: string };
          }>;
        };
      };
    };

    const offerIds = root?.OfferListResponse?.OfferID ?? [];
    const firstOfferId = offerIds[0];
    const listOffer = root?.OfferListResponse?.Offer?.[0];
    const reservationOffer = root?.ReservationResponse?.Reservation?.Offer?.[0];
    const identifier =
      firstOfferId?.Identifier ??
      listOffer?.Identifier ??
      reservationOffer?.Identifier;

    return {
      id: firstOfferId?.id ?? listOffer?.id ?? reservationOffer?.id,
      offerRef:
        firstOfferId?.offerRef ??
        listOffer?.offerRef ??
        reservationOffer?.offerRef ??
        firstOfferId?.id ??
        listOffer?.id ??
        reservationOffer?.id,
      value: identifier?.value,
      authority: identifier?.authority,
    };
  }

  extractTravelerId(response: unknown): string | undefined {
    const root = response as {
      Traveler?: { id?: string; TravelerRef?: string };
      TravelerResponse?: { Traveler?: { id?: string; TravelerRef?: string } };
    };
    return (
      root?.Traveler?.id ?? root?.TravelerResponse?.Traveler?.id ?? undefined
    );
  }

  extractTravelerIdentifierValue(response: unknown): string | undefined {
    const root = response as {
      Traveler?: { Identifier?: { value?: string } };
      TravelerResponse?: { Traveler?: { Identifier?: { value?: string } } };
    };
    return (
      root?.Traveler?.Identifier?.value ??
      root?.TravelerResponse?.Traveler?.Identifier?.value ??
      undefined
    );
  }

  resolveTravelerRef(travelerRef: string, mapping?: TravelerIdEntry[]): string {
    if (!mapping || mapping.length === 0) return travelerRef;
    const entry = mapping.find((m) => m.localRef === travelerRef);
    return (
      entry?.travelportTravelerIdentifierValue ??
      entry?.travelportTravelerId ??
      travelerRef
    );
  }

  extractIdentifierValue(
    response: unknown,
    path: string[],
  ): string | undefined {
    let current: unknown = response;
    for (const key of path) {
      if (!current || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return typeof current === 'string' ? current : undefined;
  }

  extractFopIdentifier(response: unknown) {
    const root = response as {
      FormOfPaymentResponse?: {
        Identifier?: { authority?: string; value?: string };
        FormOfPayment?: { Identifier?: { authority?: string; value?: string } };
      };
    };

    const topLevel = root?.FormOfPaymentResponse?.Identifier;
    const nested = root?.FormOfPaymentResponse?.FormOfPayment?.Identifier;
    const identifier = topLevel ?? nested;

    return { authority: identifier?.authority, value: identifier?.value };
  }

  extractPriceDetails(response: unknown) {
    const queue: unknown[] = [response];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;

      const possiblePriceObjects = [
        record.BestCombinablePrice,
        record.Price,
        record.Amount,
        record.TotalPrice,
      ];

      for (const priceCandidate of possiblePriceObjects) {
        if (!priceCandidate || typeof priceCandidate !== 'object') continue;

        const price = priceCandidate as Record<string, unknown>;
        const currency = (
          price.CurrencyCode as Record<string, unknown> | undefined
        )?.value;
        const minorUnit = (
          price.CurrencyCode as Record<string, unknown> | undefined
        )?.decimalPlace;
        const totalPrice = price.TotalPrice ?? price.Total ?? price.value;
        const numericTotal =
          typeof totalPrice === 'number'
            ? totalPrice
            : typeof totalPrice === 'string'
              ? Number(totalPrice)
              : undefined;

        if (typeof currency === 'string' && Number.isFinite(numericTotal)) {
          return {
            currencyCode: currency,
            minorUnit:
              typeof minorUnit === 'number' && Number.isFinite(minorUnit)
                ? minorUnit
                : undefined,
            totalPrice: numericTotal,
          };
        }
      }

      const selfCurrency = (
        record.CurrencyCode as Record<string, unknown> | undefined
      )?.value;
      if (typeof selfCurrency === 'string') {
        const selfTotal = record.TotalPrice ?? record.Total ?? record.value;
        const selfNumericTotal =
          typeof selfTotal === 'number'
            ? selfTotal
            : typeof selfTotal === 'string'
              ? Number(selfTotal)
              : undefined;
        if (Number.isFinite(selfNumericTotal)) {
          const selfMinorUnit = (
            record.CurrencyCode as Record<string, unknown> | undefined
          )?.decimalPlace;
          return {
            currencyCode: selfCurrency,
            minorUnit:
              typeof selfMinorUnit === 'number' &&
              Number.isFinite(selfMinorUnit)
                ? selfMinorUnit
                : undefined,
            totalPrice: selfNumericTotal!,
          };
        }
      }

      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') queue.push(value);
      }
    }

    return {
      currencyCode: undefined as string | undefined,
      minorUnit: undefined as number | undefined,
      totalPrice: undefined as number | undefined,
    };
  }

  findFirstStringValueByKeys(
    payload: unknown,
    keys: string[],
  ): string | undefined {
    const queue: unknown[] = [payload];
    const lookup = new Set(keys.map((key) => key.toLowerCase()));

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      for (const [key, value] of Object.entries(
        current as Record<string, unknown>,
      )) {
        if (lookup.has(key.toLowerCase()) && typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed.length > 0) return trimmed;
        }
        if (value && typeof value === 'object') queue.push(value);
      }
    }
    return undefined;
  }

  findHeaderValueByKeyFragment(
    headers: Record<string, string>,
    fragments: string[],
  ): string | undefined {
    const normalizedFragments = fragments.map((f) => f.toLowerCase());
    for (const [key, value] of Object.entries(headers)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedFragments.every((f) => normalizedKey.includes(f)) &&
        value?.trim()
      ) {
        return value.trim();
      }
    }
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase().includes('session') && value?.trim())
        return value.trim();
    }
    return undefined;
  }

  extractLocatorCode(response: unknown): string | undefined {
    const root = response as {
      ReservationResponse?: {
        Reservation?: {
          Receipt?: Array<{
            Confirmation?: { Locator?: { value?: string; source?: string } };
          }>;
        };
      };
    };

    const receipts = root?.ReservationResponse?.Reservation?.Receipt ?? [];
    for (const receipt of receipts) {
      const locator = receipt.Confirmation?.Locator;
      if (locator?.value && locator.source === '1G') return locator.value;
    }
    return receipts[0]?.Confirmation?.Locator?.value;
  }

  /**
   * Extract the supplier ticketing deadline from a commit response.
   *
   * Real GDS hold-commit shape (verified live 2026-09-21, PNR HN61C7):
   * `Reservation.Offer[].TermsAndConditionsFull[]` entries carry
   * `ExpiryDate` + `PaymentTimeLimit` as SIBLINGS on the same entry
   * (not nested under a TermsAndConditionsFull wrapper at Reservation
   * level, which is where price responses put them). Both locations are
   * read. Only well-known PNR-deadline paths are read — fare-terms
   * ExpiryDate and passport/credit-card expiries are deliberately NOT
   * matched. The value must be a valid ISO date in the future; anything
   * else returns undefined so callers fall back to the local window.
   */
  extractTicketingDeadline(response: unknown): {
    deadline: string;
    source: 'supplier_terms' | 'supplier_payment_limit' | 'supplier_ticketing_date';
  } | undefined {
    const root = response as {
      ReservationResponse?: {
        Reservation?: {
          TermsAndConditionsFull?: Array<{ ExpiryDate?: unknown }>;
          PaymentTimeLimit?: unknown;
          TicketingDate?: unknown;
          TicketDate?: unknown;
          AirReservation?: { LatestTicketingTime?: unknown };
          Offer?: Array<{
            TermsAndConditionsFull?: Array<{
              ExpiryDate?: unknown;
              PaymentTimeLimit?: unknown;
            }>;
          }>;
        };
      };
    };
    const reservation = root?.ReservationResponse?.Reservation;
    if (!reservation || typeof reservation !== 'object') return undefined;

    const asFutureIso = (value: unknown): string | undefined => {
      if (typeof value !== 'string' || !value) return undefined;
      const ms = Date.parse(value);
      if (Number.isNaN(ms) || ms <= Date.now()) return undefined;
      return new Date(ms).toISOString();
    };

    // Live commit shape: deadline fields sit on Offer-level terms entries.
    const terms: Array<{ ExpiryDate?: unknown; PaymentTimeLimit?: unknown }> =
      [];
    if (Array.isArray(reservation.TermsAndConditionsFull)) {
      terms.push(...reservation.TermsAndConditionsFull);
    }
    if (Array.isArray(reservation.Offer)) {
      for (const offer of reservation.Offer) {
        if (offer && Array.isArray(offer.TermsAndConditionsFull)) {
          terms.push(...offer.TermsAndConditionsFull);
        }
      }
    }
    for (const entry of terms) {
      if (!entry || typeof entry !== 'object') continue;
      const parsed = asFutureIso(entry.ExpiryDate);
      if (parsed) return { deadline: parsed, source: 'supplier_terms' };
      const limit = asFutureIso(
        (entry as { PaymentTimeLimit?: unknown }).PaymentTimeLimit,
      );
      if (limit) return { deadline: limit, source: 'supplier_payment_limit' };
    }

    const paymentLimit = asFutureIso(reservation.PaymentTimeLimit);
    if (paymentLimit)
      return { deadline: paymentLimit, source: 'supplier_payment_limit' };

    const ticketingDate = asFutureIso(
      (reservation as { TicketingDate?: unknown }).TicketingDate ??
        (reservation as { TicketDate?: unknown }).TicketDate,
    );
    if (ticketingDate)
      return { deadline: ticketingDate, source: 'supplier_ticketing_date' };

    const latestTicketing = asFutureIso(
      (
        reservation as {
          AirReservation?: { LatestTicketingTime?: unknown };
        }
      ).AirReservation?.LatestTicketingTime,
    );
    if (latestTicketing)
      return { deadline: latestTicketing, source: 'supplier_ticketing_date' };

    return undefined;
  }

  /**
   * Extract `PaymentTimeLimit` (ticket-by date) from a price response.
   * Present at both search and price time next to ValidatingAirline. Used
   * as the supplier-deadline fallback when the commit response carries no
   * ticketing deadline. Returns the raw string; callers validate it.
   */
  extractPaymentTimeLimit(response: unknown): string | undefined {
    const queue: unknown[] = [response];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      const record = current as Record<string, unknown>;
      const candidate = record.PaymentTimeLimit;
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') queue.push(value);
      }
    }
    return undefined;
  }

  extractTicketNumbersFromReservation(response: unknown): string[] {
    const root = response as {
      ReservationResponse?: {
        Reservation?: {
          Ticket?: Array<{
            Number?: string;
            id?: string;
            TicketNumber?: string;
          }>;
        };
      };
    };

    const tickets = root?.ReservationResponse?.Reservation?.Ticket ?? [];
    const numbers: string[] = [];
    for (const ticket of tickets) {
      const num = ticket.TicketNumber ?? ticket.Number ?? ticket.id;
      if (num) numbers.push(String(num));
    }
    return numbers;
  }

  extractTicketNumbers(response: unknown): string[] {
    const root = response as {
      ReceiptListResponse?: {
        ReceiptID?: Array<{ Document?: Array<{ Number?: string }> }>;
      };
      TicketListResponse?: {
        TicketID?: Array<{ Identifier?: { value?: string }; Number?: string }>;
      };
    };

    const numbers: string[] = [];
    // getbylocator shape (verified live): TicketListResponse.TicketID[].Identifier.value
    const ticketIds = root?.TicketListResponse?.TicketID ?? [];
    for (const t of ticketIds) {
      const num = t?.Identifier?.value ?? t?.Number;
      if (num) numbers.push(String(num));
    }
    if (numbers.length > 0) return numbers;

    const receiptIds = root?.ReceiptListResponse?.ReceiptID ?? [];
    for (const receipt of receiptIds) {
      const documents = Array.isArray(receipt.Document) ? receipt.Document : [];
      for (const doc of documents) {
        if (doc?.Number) numbers.push(String(doc.Number));
      }
    }
    return numbers;
  }

  extractResultErrors(payload: unknown): unknown[] {
    const errors: unknown[] = [];
    const queue: unknown[] = [payload];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const record = current as Record<string, unknown>;
      const result = record.Result as Record<string, unknown> | undefined;
      if (result && typeof result === 'object') {
        const resultErrors = result.Error;
        if (Array.isArray(resultErrors)) errors.push(...resultErrors);
        else if (resultErrors) errors.push(resultErrors);
      }

      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') queue.push(value);
      }
    }
    return errors;
  }

  remapSeatsFromFreshOptions<
    T extends {
      seatNumber: string;
      segmentRef?: string;
      catalogOfferingsIdentifier?: string;
      catalogOfferingIdentifierValue?: string;
    },
  >(selectedSeats: T[], freshOptions: AncillaryCatalogOption[]): {
    remapped: T[];
    unmatched: string[];
  } {
    if (freshOptions.length === 0) return { remapped: selectedSeats, unmatched: [] };

    const remapped: T[] = [];
    const unmatched: string[] = [];

    for (const seat of selectedSeats) {
      // Match by seat number first, prefer segmentRef match as tiebreaker.
      // Catalog-phase and booking-phase re-shop use different segment identifiers
      // (catalogOfferingsIdIdentifier vs catalogOfferingIdentifierValue), so
      // strict segment matching causes all seats to miss. Fall back to
      // seat-number-only matching.
      const candidates = freshOptions.filter(
        (opt) => opt.supplier.seatAssignment === seat.seatNumber,
      );

      // Prefer exact segment-ref match when available
      const match =
        candidates.find((opt) => opt.segmentRef === seat.segmentRef) ??
        candidates[0];

      if (match?.supplier) {
        remapped.push({
          ...seat,
          catalogOfferingsIdentifier:
            match.supplier.catalogOfferingsIdentifier ??
            seat.catalogOfferingsIdentifier,
          catalogOfferingIdentifierValue:
            match.supplier.catalogOfferingIdentifierValue ??
            seat.catalogOfferingIdentifierValue,
        });
      } else {
        unmatched.push(seat.seatNumber);
      }
    }

    return { remapped, unmatched };
  }

  remapAncillariesFromFreshOptions<
    T extends {
      ancillaryProductId: string;
      catalogOfferingsIdentifier?: string;
      catalogOfferingIdentifier?: string;
    },
  >(selected: T[], freshOptions: AncillaryCatalogOption[]): {
    remapped: T[];
    unmatched: string[];
  } {
    if (freshOptions.length === 0) return { remapped: selected, unmatched: [] };

    const remapped: T[] = [];
    const unmatched: string[] = [];

    for (const item of selected) {
      const match = freshOptions.find(
        (opt) => opt.supplier.productIdentifier === item.ancillaryProductId,
      );
      if (match?.supplier) {
        remapped.push({
          ...item,
          catalogOfferingsIdentifier:
            match.supplier.catalogOfferingsIdentifier ??
            item.catalogOfferingsIdentifier,
          catalogOfferingIdentifier:
            match.supplier.catalogOfferingIdentifier ??
            item.catalogOfferingIdentifier,
        });
      } else {
        unmatched.push(item.ancillaryProductId);
      }
    }

    return { remapped, unmatched };
  }

  extractPricedOfferIdentifier(
    response: unknown,
  ): { id?: string; value?: string; authority?: string } | undefined {
    const root = response as {
      OfferListResponse?: {
        OfferID?: Array<{
          id?: string;
          offerRef?: string;
          Identifier?: { value?: string; authority?: string };
        }>;
      };
    };

    const offerIds = root?.OfferListResponse?.OfferID ?? [];
    const firstOfferId = offerIds[0];
    if (!firstOfferId) return undefined;

    // Prefer Identifier.value (authoritative), fall back to OfferID.id
    const value = firstOfferId.Identifier?.value ?? firstOfferId.id;
    const authority = firstOfferId.Identifier?.authority;

    return {
      id: firstOfferId.id,
      value,
      authority,
    };
  }

  verifyAncillariesInResponse(
    response: unknown,
    requested: {
      seatsRequested: number;
      mealsRequested: number;
      ancillaryOffersRequested: number;
    },
  ) {
    const root = response as Record<string, unknown>;
    const reservationResp = root.ReservationResponse as
      | Record<string, unknown>
      | undefined;
    const reservation = reservationResp?.Reservation as
      | Record<string, unknown>
      | undefined;
    if (!reservation) return null;

    const seats = (reservation.SeatAssignment as unknown[]) ?? [];
    const meals = (reservation.SpecialService as unknown[]) ?? [];
    const ancillaryOffers = (reservation.AncillaryOffer as unknown[]) ?? [];

    return {
      seatsFound: seats.length,
      mealsFound: meals.length,
      ancillaryOffersFound: ancillaryOffers.length,
      seatsRequested: requested.seatsRequested,
      mealsRequested: requested.mealsRequested,
      ancillaryOffersRequested: requested.ancillaryOffersRequested,
    };
  }
}
