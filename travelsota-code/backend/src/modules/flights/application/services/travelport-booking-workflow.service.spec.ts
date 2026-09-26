import { Test } from '@nestjs/testing';
import { TravelportWorkflowRequestBuilderService } from './travelport-workflow-request-builder.service';

describe('TravelportBookingWorkflowService — builder methods', () => {
  let requestBuilder: TravelportWorkflowRequestBuilderService;

  const mockNoDeps = {};

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        TravelportWorkflowRequestBuilderService,
      ],
    }).compile();

    requestBuilder = module.get<TravelportWorkflowRequestBuilderService>(TravelportWorkflowRequestBuilderService);
  });

  // ── Seat Add Builder ──

  describe('buildSeatAddBody', () => {
    it('creates a BuildAncillaryOffersFromCatalogOfferingsAirSeat body', () => {
      const body = requestBuilder.buildSeatAddBody(
        'catalog-uuid-1',
        'offer-id-value-1',
        'travelerRefId_1',
        '12A',
      );

      expect(body['@type']).toBe('OfferQueryBuildAncillaryOffersFromCatalogOfferings');
      expect(body.BuildAncillaryOffersFromCatalogOfferings).toHaveLength(1);

      const seatEntry = body.BuildAncillaryOffersFromCatalogOfferings[0];
      expect(seatEntry['@type']).toBe('BuildAncillaryOffersFromCatalogOfferingsAirSeat');
      expect(seatEntry.CatalogOfferingsIdentifier.Identifier.value).toBe('catalog-uuid-1');
      expect(seatEntry.CatalogOfferingIdentifier.Identifier.value).toBe('offer-id-value-1');
      expect(seatEntry.TravelerIdentifierRef.value).toBe('travelerRefId_1');
      expect(seatEntry.SeatAssignment).toBe('12A');
    });

    it('supports multiple seat assignments with different travelers', () => {
      const body1 = requestBuilder.buildSeatAddBody('cat-1', 'offer-1', 'trav_1', '10A');
      const body2 = requestBuilder.buildSeatAddBody('cat-1', 'offer-1', 'trav_2', '10B');

      expect(body1.BuildAncillaryOffersFromCatalogOfferings[0].TravelerIdentifierRef.value).toBe('trav_1');
      expect(body1.BuildAncillaryOffersFromCatalogOfferings[0].SeatAssignment).toBe('10A');

      expect(body2.BuildAncillaryOffersFromCatalogOfferings[0].TravelerIdentifierRef.value).toBe('trav_2');
      expect(body2.BuildAncillaryOffersFromCatalogOfferings[0].SeatAssignment).toBe('10B');
    });

    it('includes the correct seat identifier type', () => {
      const body = requestBuilder.buildSeatAddBody('cat-1', 'offer-1', 'trav_1', '29B');

      const seat = body.BuildAncillaryOffersFromCatalogOfferings[0];
      expect(seat['@type']).toContain('AirSeat');
      expect(seat.SeatAssignment).toBe('29B');
    });
  });

  // ── Baggage Add Builder ──

  describe('buildBaggageAddBody', () => {
    const defaultBaggageItems = [
      {
        ancillaryProductId: 'bag-prod-1',
        travelerRef: 'travelerRefId_1',
      },
    ];

    it('creates a BuildAncillaryOffersFromCatalogOfferings body', () => {
      const body = requestBuilder.buildBaggageAddBody('cat-1', defaultBaggageItems as any, 1);

      expect(body['@type']).toBe('OfferQueryBuildAncillaryOffersFromCatalogOfferings');
      expect(Array.isArray(body.BuildAncillaryOffersFromCatalogOfferings)).toBe(true);
    });

    it('includes CatalogOfferingsIdentifier with catalog UUID', () => {
      const body = requestBuilder.buildBaggageAddBody('cat-1', defaultBaggageItems as any, 1);

      const item = body.BuildAncillaryOffersFromCatalogOfferings[0];
      expect(item.CatalogOfferingsIdentifier.Identifier.value).toBe('cat-1');
      expect(item.CatalogOfferingsIdentifier.Identifier.authority).toBe('Travelport');
    });

    it('maps each baggage item to a BuildAncillaryOffersFromCatalogOfferings entry', () => {
      const items = [
        { ancillaryProductId: 'bag-1', travelerRef: 'trav_1' },
        { ancillaryProductId: 'bag-2', travelerRef: 'trav_2' },
      ];
      const body = requestBuilder.buildBaggageAddBody('cat-1', items as any, 2);

      const entries = body.BuildAncillaryOffersFromCatalogOfferings;
      expect(entries).toHaveLength(2);
      expect(entries[0].ProductIdentifier.id).toBe('bag-1');
      expect(entries[0].TravelerIdentifierRef.id).toBe('trav_1');
      expect(entries[0].Quantity).toBe(1);
      expect(entries[1].ProductIdentifier.id).toBe('bag-2');
      expect(entries[1].TravelerIdentifierRef.id).toBe('trav_2');
    });

    it('uses catalogOfferingIdentifier when provided', () => {
      const items = [
        {
          ancillaryProductId: 'bag-1',
          catalogOfferingIdentifier: 'offering-abc',
          travelerRef: 'trav_1',
        },
      ];
      const body = requestBuilder.buildBaggageAddBody('cat-1', items as any, 1);

      const entry = body.BuildAncillaryOffersFromCatalogOfferings[0];
      expect(entry.CatalogOfferingIdentifier.id).toBe('offering-abc');
    });

    it('falls back to ancillaryProductId for catalogOfferingIdentifier', () => {
      const items = [
        {
          ancillaryProductId: 'bag-fallback',
          travelerRef: 'trav_1',
        },
      ];
      const body = requestBuilder.buildBaggageAddBody('cat-1', items as any, 1);

      const entry = body.BuildAncillaryOffersFromCatalogOfferings[0];
      expect(entry.CatalogOfferingIdentifier.id).toBe('bag-fallback');
    });

    it('handles empty baggage items list', () => {
      const body = requestBuilder.buildBaggageAddBody('cat-1', [], 1);

      expect(body.BuildAncillaryOffersFromCatalogOfferings).toHaveLength(0);
    });
  });

  // ── Meal SSR Builder ──

  describe('buildMealSsrBody', () => {
    it('creates a SpecialServiceListRequest body', () => {
      const body = requestBuilder.buildMealSsrBody(
        'offer-id-value-1',
        [{ mealCode: 'VGML', travelerRef: 'trav_1' }],
        'reservation-id-1',
      );

      expect(body['@type']).toBe('SpecialServiceListRequest');
    });

    it('includes SpecialServiceID array with one entry per meal', () => {
      const meals = [
        { mealCode: 'VGML', travelerRef: 'trav_1' },
        { mealCode: 'AVML', travelerRef: 'trav_2' },
        { mealCode: 'MOML', travelerRef: 'trav_3' },
      ];
      const body = requestBuilder.buildMealSsrBody('offer-1', meals, 'res-1');

      expect(body.SpecialServiceID).toHaveLength(3);
    });

    it('sets SSRCode on each SpecialService', () => {
      const body = requestBuilder.buildMealSsrBody(
        'offer-1',
        [{ mealCode: 'VGML', travelerRef: 'trav_1' }],
        'res-1',
      );

      const ss = body.SpecialServiceID[0];
      expect(ss['@type']).toBe('SpecialService');
      expect(ss.SSRCode).toBe('VGML');
    });

    it('sets TravelerIdentifier with traveler ref', () => {
      const body = requestBuilder.buildMealSsrBody(
        'offer-1',
        [{ mealCode: 'MOML', travelerRef: 'trav_2' }],
        'res-1',
      );

      const ti = body.SpecialServiceID[0].TravelerIdentifier;
      expect(ti.id).toBe('trav_2');
      expect(ti.TravelerRef).toBe('trav_2');
      expect(ti.Identifier.value).toBe('trav_2');
    });

    it('sets AppliesTo with OfferIdentifier referencing the offer', () => {
      const body = requestBuilder.buildMealSsrBody(
        'offer-value-xyz',
        [{ mealCode: 'HNML', travelerRef: 'trav_1' }],
        'res-1',
      );

      const appliesTo = body.SpecialServiceID[0].AppliesTo;
      expect(appliesTo['@type']).toBe('AppliesToOffer');
      expect(appliesTo.OfferIdentifier).toHaveLength(1);
      expect(appliesTo.OfferIdentifier[0].Identifier.value).toBe('offer-value-xyz');
    });

    it('sets Identifier with reservation ID', () => {
      const body = requestBuilder.buildMealSsrBody(
        'offer-1',
        [{ mealCode: 'VGML', travelerRef: 'trav_1' }],
        'reservation-abc-123',
      );

      const id = body.SpecialServiceID[0].Identifier;
      expect(id.authority).toBe('Travelport');
      expect(id.value).toBe('reservation-abc-123');
    });

    it('uses unique IDs for multiple meal entries', () => {
      const meals = [
        { mealCode: 'VGML', travelerRef: 'trav_1' },
        { mealCode: 'CHML', travelerRef: 'trav_2' },
      ];
      const body = requestBuilder.buildMealSsrBody('offer-1', meals, 'res-1');

      expect(body.SpecialServiceID[0].id).not.toBe(body.SpecialServiceID[1].id);
      expect(body.SpecialServiceID[0].id).toBe('specialService_1');
      expect(body.SpecialServiceID[1].id).toBe('specialService_2');
    });
  });
});
