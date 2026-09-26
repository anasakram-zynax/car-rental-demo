import { Injectable } from '@nestjs/common';
import type { TravelportRuntimeConfig } from '../../../../shared/config/app-config.types';
import type { FlightSearchDto } from '../../api/dto/flight-search.dto';
import type { TravelportBookingWorkflowDto } from '../../api/dto/travelport-booking.dto';

export interface WorkflowProductSelection {
  offeringId: string;
  productIds: string[];
}

@Injectable()
export class TravelportWorkflowRequestBuilderService {
  buildHeaders(
    config: TravelportRuntimeConfig,
    accessToken: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept-Encoding': 'gzip, deflate',
      'Cache-Control': 'no-cache',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Accept-Version': config.acceptVersion,
      'Content-Version': config.contentVersion,
    };

    if (config.accessGroup) {
      headers['XAUTH_TRAVELPORT_ACCESSGROUP'] = config.accessGroup;
    }

    if (config.pcc) {
      const gds = config.gds ?? '1G';
      headers['TVP-PCC-Core'] =
        `${config.pcc.toUpperCase()}_${gds.toUpperCase()}`;
    }

    return headers;
  }

  buildHeadersWithoutContentType(
    headers: Record<string, string>,
  ): Record<string, string> {
    const nextHeaders = { ...headers };
    delete nextHeaders['Content-Type'];
    return nextHeaders;
  }

  buildSessionHeaders(
    baseHeaders: Record<string, string>,
    sessionId?: string,
  ): Record<string, string> {
    const headers = { ...baseHeaders };
    if (sessionId?.trim()) {
      headers.travelportPlusSessionIdentifier = sessionId.trim();
    } else {
      delete headers.travelportPlusSessionIdentifier;
    }
    return headers;
  }

  buildSearchBody(
    input: FlightSearchDto,
    config: TravelportRuntimeConfig,
  ): Record<string, unknown> {
    const resolvedContentSourceList =
      input.contentSourceList ?? config.defaultContentSourceList;
    const searchCriteriaFlight = this.buildSearchCriteriaFlight(input);
    const searchModifiersAir = this.buildSearchModifiersAir(input);
    const request: Record<string, unknown> = {
      '@type': 'CatalogProductOfferingsRequestAir',
      maxNumberOfUpsellsToReturn: 1,
      offersPerPage: input.offersPerPage ?? 10,
      contentSourceList: resolvedContentSourceList,
      PassengerCriteria: [
        {
          '@type': 'PassengerCriteria',
          number: input.adults ?? 1,
          passengerTypeCode: 'ADT',
        },
      ],
      SearchCriteriaFlight: searchCriteriaFlight,
    };

    if (searchModifiersAir) {
      request.SearchModifiersAir = searchModifiersAir;
    }

    return {
      '@type': 'CatalogProductOfferingsQueryRequest',
      CatalogProductOfferingsRequest: request,
    };
  }

  buildSearchCriteriaFlight(input: FlightSearchDto): unknown[] {
    const criteria = [
      {
        '@type': 'SearchCriteriaFlight',
        departureDate: input.departureDate,
        From: { value: input.from },
        To: { value: input.to },
      },
    ];

    if (input.tripType === 'round_trip' && input.returnDate) {
      criteria.push({
        '@type': 'SearchCriteriaFlight',
        departureDate: input.returnDate,
        From: { value: input.to },
        To: { value: input.from },
      });
    }

    return criteria;
  }

  buildSearchModifiersAir(
    input: FlightSearchDto,
  ): Record<string, unknown> | undefined {
    const modifiers: Record<string, unknown> = {
      '@type': 'SearchModifiersAir',
    };

    if (input.cabinClass) {
      modifiers.CabinPreference = [
        {
          '@type': 'CabinPreference',
          preferenceType: 'Preferred',
          cabins: [input.cabinClass],
        },
      ];
    }

    // For round trips, request JOURNEY representation so Travelport returns
    // outbound + return legs grouped together (not as separate one-way offers).
    if (input.tripType === 'round_trip') {
      modifiers.SearchRepresentation = 'JOURNEY';
    }

    return Object.keys(modifiers).length > 1 ? modifiers : undefined;
  }

  resolveSelectedOfferIds(input: TravelportBookingWorkflowDto) {
    const catalogUuid = input.catalogUuid?.trim();
    const offeringId = input.offeringId?.trim();
    const productId = input.productId?.trim();
    const productIds = Array.isArray(input.productIds)
      ? input.productIds.map((value) => value?.trim()).filter(Boolean)
      : undefined;
    const productSelections = this.normalizeProductSelections(
      input.productSelections,
    );

    if (
      !catalogUuid ||
      (!productSelections.length &&
        !offeringId &&
        !productId &&
        !productIds?.length)
    ) {
      return undefined;
    }

    return {
      catalogUuid,
      offeringId:
        offeringId ??
        productSelections.map((selection) => selection.offeringId).join('+'),
      productId:
        productId ?? productIds?.[0] ?? productSelections[0]?.productIds[0],
      productIds: productSelections.length
        ? productSelections.flatMap((selection) => selection.productIds)
        : productIds?.length
          ? productIds
          : productId
            ? [productId]
            : undefined,
      productSelections: productSelections.length
        ? productSelections
        : offeringId
          ? [
              {
                offeringId,
                productIds: productIds?.length
                  ? productIds
                  : productId
                    ? [productId]
                    : [],
              },
            ]
          : undefined,
    };
  }

  normalizeProductSelections(
    selections?: Array<{ offeringId?: string; productIds?: string[] }>,
  ): WorkflowProductSelection[] {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .map((selection) => ({
        offeringId: selection.offeringId?.trim() ?? '',
        productIds: this.normalizeIds(selection.productIds),
      }))
      .filter(
        (selection): selection is WorkflowProductSelection =>
          Boolean(selection.offeringId) && selection.productIds.length > 0,
      );
  }

  buildTravelerBody(
    travelerInput: NonNullable<
      TravelportBookingWorkflowDto['travelers']
    >[number],
    index: number,
  ): Record<string, unknown> {
    const travelerId = `travelerRefId_${index + 1}`;
    const phoneId = `telephone_${index + 1}`;
    const emailId = `email_${index + 1}`;
    const traveler = {
      givenName: travelerInput?.givenName ?? `Traveler ${index + 1}`,
      surname: travelerInput?.surname ?? 'Guest',
      // Travelport accepts Male/Female only — 'unspecified'/anything else
      // is rejected at ticketing (1G/4933). Normalize defensively.
      gender: /^female?$/i.test(travelerInput?.gender ?? '')
        ? 'Female'
        : 'Male',
      birthDate: travelerInput?.birthDate ?? '1990-05-15',
      passengerTypeCode: travelerInput?.passengerTypeCode ?? 'ADT',
      phoneCountryCode: travelerInput?.phoneCountryCode ?? '92',
      phoneNumber: travelerInput?.phoneNumber ?? '3001234567',
      email: travelerInput?.email ?? `traveler${index + 1}@example.com`,
      documentNumber: travelerInput?.documentNumber,
      documentType: travelerInput?.documentType,
      issueCountry: travelerInput?.issueCountry,
      issueDate: travelerInput?.issueDate,
      expiryDate: travelerInput?.expiryDate,
      nationality: travelerInput?.nationality,
      birthPlace: travelerInput?.birthPlace,
    };

    const body: Record<string, unknown> = {
      '@type': 'Traveler',
      gender: traveler.gender,
      birthDate: traveler.birthDate,
      id: travelerId,
      TravelerRef: travelerId,
      passengerTypeCode: traveler.passengerTypeCode,
      PersonName: {
        '@type': 'PersonNameDetail',
        Given: traveler.givenName,
        Surname: traveler.surname,
      },
      Telephone: [
        {
          '@type': 'Telephone',
          countryAccessCode: traveler.phoneCountryCode,
          phoneNumber: traveler.phoneNumber,
          id: phoneId,
          role: 'Mobile',
        },
      ],
      Email: [{ id: emailId, value: traveler.email }],
    };

    // A partial TravelDocument is worse than none: Travelport rejects
    // holds/tickets with "TRAVEL DOCUMENT REQUIRES CURRENT PASSPORT OR
    // NAME, DATE OF BIRTH, AND GENDER" (1G/4933) when a document block
    // arrives without number + expiry. Holds ticket fine with no document
    // at all (verified live), so only send a complete one.
    const hasDocument =
      !!traveler.documentNumber && !!traveler.expiryDate;

    if (hasDocument) {
      body.TravelDocument = [
        {
          '@type': 'TravelDocument',
          ...(traveler.documentNumber
            ? { docNumber: traveler.documentNumber }
            : {}),
          ...(traveler.documentType ? { docType: traveler.documentType } : {}),
          ...(traveler.issueCountry
            ? { issueCountry: traveler.issueCountry }
            : {}),
          ...(traveler.issueDate ? { issueDate: traveler.issueDate } : {}),
          ...(traveler.expiryDate ? { expireDate: traveler.expiryDate } : {}),
          ...(traveler.nationality
            ? { nationality: traveler.nationality }
            : {}),
          ...(traveler.birthPlace ? { birthPlace: traveler.birthPlace } : {}),
        },
      ];
    }

    return body;
  }

  normalizeTravelers(
    input: TravelportBookingWorkflowDto,
  ): NonNullable<TravelportBookingWorkflowDto['travelers']> {
    if (Array.isArray(input.travelers) && input.travelers.length > 0) {
      return input.travelers;
    }

    if (input.traveler) {
      return [input.traveler];
    }

    return [
      {
        givenName: 'Postman',
        surname: 'Tester',
        gender: 'Male',
        birthDate: '1990-05-15',
        passengerTypeCode: 'ADT',
        phoneCountryCode: '92',
        phoneNumber: '3001234567',
        email: 'test@example.com',
      },
    ];
  }

  buildOfferBody(
    catalogUuid: string,
    productSelections: WorkflowProductSelection[],
  ): Record<string, unknown> {
    return {
      '@type': 'OfferQueryBuildFromCatalogProductOfferings',
      BuildFromCatalogProductOfferingsRequest: {
        '@type': 'BuildFromCatalogProductOfferingsRequestAir',
        CatalogProductOfferingsIdentifier: {
          Identifier: { value: catalogUuid, authority: 'Travelport' },
        },
        validateInventoryInd: true,
        CatalogProductOfferingSelection: productSelections.map((selection) => {
          // offeringId is stored as "o1:p0" (catalogOfferingId:productRef) but
          // Travelport expects just the catalog offering id (e.g. "o1") in the
          // CatalogProductOfferingIdentifier field.
          const catalogOfferingId = selection.offeringId.includes(':')
            ? selection.offeringId.split(':')[0]
            : selection.offeringId;
          return {
            '@type': 'CatalogProductOfferingSelection',
            CatalogProductOfferingIdentifier: {
              Identifier: { value: catalogOfferingId, authority: 'Travelport' },
            },
            ProductIdentifier: selection.productIds.map((value) => ({
              Identifier: { value, authority: 'Travelport' },
            })),
          };
        }),
      },
    };
  }

  buildSeatAddBody(
    catalogUuid: string,
    offerIdentifierValue: string,
    travelerRef: string,
    seatNumber: string,
    seatCatalogOfferingsIdentifier?: string,
    seatCatalogOfferingIdentifierValue?: string,
    seatProductIdentifier?: string,
  ): Record<string, unknown> {
    return {
      '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
      BuildAncillaryOffersFromCatalogOfferings: [
        {
          '@type': 'BuildAncillaryOffersFromCatalogOfferingsAirSeat',
          CatalogOfferingsIdentifier: { Identifier: { value: seatCatalogOfferingsIdentifier ?? catalogUuid } },
          CatalogOfferingIdentifier: { Identifier: { value: seatCatalogOfferingIdentifierValue ?? offerIdentifierValue } },
          ...(seatProductIdentifier ? { ProductIdentifier: { id: 'product_1', productRef: 'product_1', Identifier: { value: seatProductIdentifier, authority: 'TVPT' } } } : {}),
          TravelerIdentifierRef: { value: travelerRef },
          SeatAssignment: seatNumber,
        },
      ],
    };
  }

  buildBaggageAddBody(
    catalogUuid: string,
    baggageItems: Array<{
      ancillaryProductId: string;
      catalogOfferingsIdentifier?: string;
      catalogOfferingIdentifier?: string;
      travelerRef: string;
      price?: { amount: number; currency: string };
    }>,
    _travelerCount: number,
  ): Record<string, unknown> {
    const items = baggageItems.map((item) => {
      const ci = item.catalogOfferingsIdentifier ?? catalogUuid;
      const coi = item.catalogOfferingIdentifier ?? item.ancillaryProductId;
      if (!item.ancillaryProductId) {
        throw new Error('Baggage item missing ancillaryProductId');
      }
      return {
        '@type': 'BuildAncillaryOffersFromCatalogOfferings',
        CatalogOfferingsIdentifier: {
          Identifier: { authority: 'Travelport', value: ci },
        },
        CatalogOfferingIdentifier: { id: coi },
        ProductIdentifier: { id: item.ancillaryProductId },
        TravelerIdentifierRef: { id: item.travelerRef },
        Quantity: 1,
      };
    });

    return {
      '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
      BuildAncillaryOffersFromCatalogOfferings: items,
    };
  }

  buildMealSsrBody(
    offerIdentifierValue: string,
    mealItems: Array<{ mealCode: string; travelerRef: string }>,
    reservationId: string,
  ): Record<string, unknown> {
    return {
      '@type': 'SpecialServiceListRequest',
      SpecialServiceID: mealItems.map((meal, idx) => ({
        '@type': 'SpecialService',
        id: `specialService_${idx + 1}`,
        Identifier: { authority: 'Travelport', value: reservationId },
        AppliesTo: {
          '@type': 'AppliesToOffer',
          OfferIdentifier: [
            {
              id: `offer_${idx + 1}`,
              offerRef: `offer_${idx + 1}`,
              Identifier: {
                authority: 'Travelport',
                value: offerIdentifierValue,
              },
            },
          ],
        },
        TravelerIdentifier: {
          id: meal.travelerRef,
          TravelerRef: meal.travelerRef,
          Identifier: { authority: 'Travelport', value: meal.travelerRef },
        },
        SSRCode: meal.mealCode,
      })),
    };
  }

  buildServicesAddBody(
    catalogUuid: string,
    serviceItems: Array<{
      ancillaryProductId: string;
      catalogOfferingsIdentifier?: string;
      catalogOfferingIdentifier?: string;
      travelerRef: string;
      quantity: number;
      price?: { amount: number; currency: string };
    }>,
    _travelerCount: number,
  ): Record<string, unknown> {
    const items = serviceItems.map((item) => {
      const ci = item.catalogOfferingsIdentifier ?? catalogUuid;
      const coi = item.catalogOfferingIdentifier ?? item.ancillaryProductId;
      if (!item.ancillaryProductId) {
        throw new Error('Service item missing ancillaryProductId');
      }
      return {
        '@type': 'BuildAncillaryOffersFromCatalogOfferings',
        CatalogOfferingsIdentifier: {
          Identifier: { authority: 'Travelport', value: ci },
        },
        CatalogOfferingIdentifier: { id: coi },
        ProductIdentifier: { id: item.ancillaryProductId },
        TravelerIdentifierRef: { id: item.travelerRef },
        Quantity: item.quantity > 0 ? item.quantity : 1,
      };
    });

    return {
      '@type': 'OfferQueryBuildAncillaryOffersFromCatalogOfferings',
      BuildAncillaryOffersFromCatalogOfferings: items,
    };
  }

  buildCashFopBody(fopRef: string): Record<string, unknown> {
    return {
      '@type': 'FormOfPaymentCash',
      id: fopRef,
      FormOfPaymentRef: fopRef,
      Identifier: { authority: 'Travelport', value: fopRef },
    };
  }

  buildPaymentBody(
    offerRef: string,
    offerIdentifierValue: string,
    fopRef: string,
    fopIdentifierAuthority: string,
    fopIdentifierValue: string,
    currencyCode: string,
    minorUnit: number,
    amountValue: number,
  ): Record<string, unknown> {
    const normalizedAmount =
      typeof amountValue === 'number' && Number.isFinite(amountValue)
        ? amountValue
        : 1;

    return {
      '@type': 'Payment',
      id: `payment_${Date.now()}`,
      Identifier: {
        authority: 'Travelport',
        value: `payment_identifier_${Date.now()}`,
      },
      Amount: {
        code: currencyCode,
        minorUnit,
        currencySource: 'Charged',
        value: normalizedAmount,
      },
      OfferIdentifier: [
        {
          id: offerRef,
          offerRef: offerRef,
          Identifier: { authority: 'Travelport', value: offerIdentifierValue },
        },
      ],
      FormOfPaymentIdentifier: {
        id: fopRef,
        FormOfPaymentRef: fopRef,
        Identifier: {
          authority: fopIdentifierAuthority,
          value: fopIdentifierValue,
        },
      },
    };
  }

  normalizeIds(values?: string[]): string[] {
    return Array.isArray(values)
      ? values
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value))
      : [];
  }
}
