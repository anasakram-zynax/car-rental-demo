import { Test } from '@nestjs/testing';
import { TravelportAncillaryService } from './travelport-ancillary.service';
import { CacheService } from '../../../../shared/cache/cache.service';
import { AppConfigService } from '../../../../shared/config/app-config.service';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { ProviderConfigService } from '../../../settings/application/services/provider-config.service';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { TravelportPayloadBuilderService } from './travelport-payload-builder.service';
import { AncillaryCatalogParserService } from './ancillary-catalog-parser.service';
import { TravelportSeatMapBuilderService } from './travelport-seat-map-builder.service';

describe('TravelportAncillaryService', () => {
  let service: TravelportAncillaryService;

  const mockConfigService = {
    travelport: {
      baseUrl: 'https://api.travelport.com',
      acceptVersion: 'v42.0',
      contentVersion: 'v42.0',
      authUrl: 'https://auth.travelport.com/token',
      oauthGrantType: 'password',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      username: 'test-user',
      password: 'test-pass',
      requestTimeoutMs: 30000,
    },
  };

  const mockCacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  const mockHttpClient = {
    request: jest.fn(),
  };

  const mockProviderConfigService = {
    getFlightsProviderRuntime: jest.fn().mockResolvedValue({ config: {} }),
  };

  const mockSelectedOfferCache = {
    retrieve: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
  };

  const mockPayloadBuilder = {
    buildFromProducts: jest.fn(),
    buildProductCriteriaAir: jest.fn(),
  };

  const mockCatalogParser = {
    parseAncillaryShopResponse: jest.fn().mockReturnValue([]),
  };

  const workbenchResponse = {
    ok: true,
    status: 200,
    data: {
      ReservationResponse: {
        Reservation: { Identifier: { value: 'wb-test-1' } },
        SessionIdentifier: 'sess-test-1',
      },
    },
  };

  const emptySuccess = { ok: true, status: 200, data: null };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockCacheService.get.mockResolvedValue({
      access_token: 'test-token',
      expires_in: 3600,
      token_type: 'Bearer',
    });

    const module = await Test.createTestingModule({
      providers: [
        TravelportAncillaryService,
        { provide: AppConfigService, useValue: mockConfigService },
        { provide: HttpClientService, useValue: mockHttpClient },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ProviderConfigService, useValue: mockProviderConfigService },
        { provide: SelectedOfferCacheService, useValue: mockSelectedOfferCache },
        { provide: TravelportPayloadBuilderService, useValue: mockPayloadBuilder },
        { provide: AncillaryCatalogParserService, useValue: mockCatalogParser },
      { provide: TravelportSeatMapBuilderService, useValue: { buildGdsFromProducts: jest.fn(), buildGdsFromOfferList: jest.fn(), buildNdc: jest.fn(), buildFromReservationWorkbench: jest.fn() } },
      ],
    }).compile();

    service = module.get<TravelportAncillaryService>(TravelportAncillaryService);
  });

  describe('ancillaryPrice', () => {
    const validPayload = {
      catalogUuid: 'cat-1',
      offeringId: 'offer-1',
      productIds: ['main-prod-1', 'main-prod-2'],
      travelerCount: 1,
    };

    it('calls requestAir with correct endpoint and body', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce({
          ok: true,
          data: [{ productId: 'P1', price: { total: 25 } }],
          status: 200,
        });

      const payload = {
        ...validPayload,
        seatProductIds: ['seat-prod-1', 'seat-prod-2'],
      };

      const result = await service.ancillaryPrice(payload);

      expect(mockHttpClient.request).toHaveBeenCalledTimes(4);

      // Step 3 (add offer) should use main product IDs
      const step3CallArg = mockHttpClient.request.mock.calls[2];
      const step3Body = JSON.parse(step3CallArg[1].body);
      expect(step3Body['@type']).toBe('OfferQueryBuildFromCatalogProductOfferings');
      expect(
        step3Body.BuildFromCatalogProductOfferingsRequest.CatalogProductOfferingSelection[0]
          .ProductIdentifier,
      ).toHaveLength(2);
      expect(
        step3Body.BuildFromCatalogProductOfferingsRequest.CatalogProductOfferingSelection[0]
          .ProductIdentifier[0].id,
      ).toBe('main-prod-1');

      // Step 4 (ancillary pricing) should use ancillary product IDs
      const lastCallArg = mockHttpClient.request.mock.calls[3];
      const url: string = lastCallArg[0];
      expect(url).toContain('buildancillaryoffersfromcatalogofferings');

      const options = lastCallArg[1];
      const body = JSON.parse(options.body);
      expect(body['@type']).toBe('OfferQueryBuildAncillaryOffersFromCatalogOfferings');
      expect(body.BuildAncillaryOffersFromCatalogOfferingsRequest.CatalogProductOfferingsIdentifier.Identifier.value).toBe('cat-1');
      expect(body.BuildAncillaryOffersFromCatalogOfferingsRequest.CatalogProductOfferingSelection[0].CatalogProductOfferingIdentifier.Identifier.value).toBe('offer-1');
      expect(body.BuildAncillaryOffersFromCatalogOfferingsRequest.CatalogProductOfferingSelection[0].ProductIdentifier).toHaveLength(2);
      expect(body.BuildAncillaryOffersFromCatalogOfferingsRequest.PassengerCriteria[0].number).toBe(1);

      expect(result).toEqual([{ productId: 'P1', price: { total: 25 } }]);
    });

    it('handles baggage product IDs', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce({
          ok: true,
          data: [],
          status: 200,
        });

      const payload = {
        ...validPayload,
        productIds: ['main-1'],
        baggageProductIds: ['bag-prod-1'],
      };

      await service.ancillaryPrice(payload);

      const body = JSON.parse(mockHttpClient.request.mock.calls[3][1].body);
      const productIds = body.BuildAncillaryOffersFromCatalogOfferingsRequest.CatalogProductOfferingSelection[0].ProductIdentifier;
      expect(productIds).toHaveLength(1);
      expect(productIds[0].Identifier.value).toBe('bag-prod-1');
    });

    it('combines seat and baggage product IDs for ancillary pricing', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce({
          ok: true,
          data: [],
          status: 200,
        });

      const payload = {
        catalogUuid: 'cat-1',
        offeringId: 'offer-1',
        productIds: ['main-1'],
        seatProductIds: ['seat-1'],
        baggageProductIds: ['bag-1'],
      };

      await service.ancillaryPrice(payload);

      const body = JSON.parse(mockHttpClient.request.mock.calls[3][1].body);
      const productIds = body.BuildAncillaryOffersFromCatalogOfferingsRequest.CatalogProductOfferingSelection[0].ProductIdentifier;
      expect(productIds).toHaveLength(2);
      const values = productIds.map((p: any) => p.Identifier.value).sort();
      expect(values).toEqual(['bag-1', 'seat-1']);
    });

    it('returns early when no main product IDs', async () => {
      const result = await service.ancillaryPrice({
        catalogUuid: 'cat-1',
        offeringId: 'offer-1',
        seatProductIds: ['s1'],
      });

      expect(result).toEqual({
        ok: false,
        message: 'Could not extract ancillary products from request.',
      });
      expect(mockHttpClient.request).not.toHaveBeenCalled();
    });

    it('returns early when no catalog/offering IDs', async () => {
      const result = await service.ancillaryPrice({});

      expect(result).toEqual({
        ok: false,
        message: 'Could not extract ancillary products from request.',
      });
      expect(mockHttpClient.request).not.toHaveBeenCalled();
    });

    it('returns early when ancillary product IDs are empty', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess);

      const payload = { ...validPayload }; // no seatProductIds or baggageProductIds

      const result = await service.ancillaryPrice(payload);

      expect(result).toEqual({
        ok: false,
        message: 'No ancillary product IDs provided.',
      });
      expect(mockHttpClient.request).toHaveBeenCalledTimes(3);
    });

    it('throws on upstream 5xx error', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          data: 'Internal Server Error',
        });

      await expect(
        service.ancillaryPrice({
          ...validPayload,
          seatProductIds: ['s1'],
        }),
      ).rejects.toThrow();
    });

    it('soft-fails on upstream 4xx error', async () => {
      mockHttpClient.request
        .mockResolvedValueOnce(workbenchResponse)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce(emptySuccess)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          data: 'Bad Request',
        });

      const result = await service.ancillaryPrice({
        ...validPayload,
        seatProductIds: ['s1'],
      });

      expect(result).toEqual({
        ok: false,
        upstreamStatus: 400,
        upstreamResponse: 'Bad Request',
        data: [],
      });
    });

    it('returns soft-fail when workbench creation fails', async () => {
      mockHttpClient.request.mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: 'Server Error',
      });

      const result = await service.ancillaryPrice({
        ...validPayload,
        seatProductIds: ['s1'],
      });

      expect(result).toEqual({
        ok: false,
        message: 'Failed to create workbench session.',
      });
    });
  });

  // ── Phase 9: Result.Error in HTTP 200 handling ──

  describe('Result.Error in HTTP 200 response handling', () => {
    it('returns formatted error when requestAir response has Result.Error in 200', async () => {
      // The main request that returns 200 with Result.Error
      // Token request is skipped because cacheService.get returns cached token
      mockHttpClient.request.mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          CatalogOfferingsAncillaryListResponse: {
            Result: {
              Error: [
                {
                  SourceCode: 'TRAVELPORT_BE',
                  Message: 'No seat availability for this flight.',
                  Category: 'Business',
                },
              ],
            },
          },
        },
      });

      // Mock selected offer cache to return a valid entry for NDC seat availability
      mockSelectedOfferCache.retrieve.mockResolvedValue({
        catalogUuid: 'cat-uuid-1',
        offeringIds: ['offer-1'],
        productRefs: ['prod-1', 'prod-2'],
        productSelections: [{ offeringId: 'offer-1', productIds: ['prod-1', 'prod-2'] }],
        contentSource: 'NDC',
        passengerCriteria: [{ number: 1, passengerTypeCode: 'ADT' }],
        referenceList: { products: {}, flights: {}, brands: {} },
        searchCriteria: { from: 'LHR', to: 'JFK', departureDate: '2026-07-20', adults: 1 },
      });

      // Call a requestAir internally via a method that uses softFail
      // We'll test the extractTravelportResponseErrors logic indirectly
      // by triggering requestAir with a mocked HTTP 200 containing Result.Error

      const result = await service.previewSeatMap('search-key-1', 'offer-1', 1);

      // The previewSeatMap method should detect the Result.Error and return
      // a formatted { ok: false, message, sourceCode } object
      expect(result).toBeDefined();
      expect((result as any).ok).toBe(false);
      expect((result as any).message).toContain('No seat availability');
    });

    it('returns soft-fail object on HTTP 4xx with softFail enabled', async () => {
      mockSelectedOfferCache.retrieve.mockResolvedValue({
        catalogUuid: 'cat-uuid-2',
        offeringIds: ['offer-2'],
        productRefs: ['prod-3'],
        productSelections: [{ offeringId: 'offer-2', productIds: ['prod-3'] }],
        contentSource: 'NDC',
        passengerCriteria: [{ number: 1, passengerTypeCode: 'ADT' }],
        referenceList: { products: {}, flights: {}, brands: {} },
        searchCriteria: { from: 'LHR', to: 'JFK', departureDate: '2026-07-20', adults: 1 },
      });

      // Token request is skipped because cacheService.get returns cached token
      mockHttpClient.request.mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: 'Bad Request',
      });

      const result = await service.previewSeatMap('search-key-2', 'offer-2', 1);

      expect(result).toBeDefined();
      expect((result as any).ok).toBe(false);
    });
  });
});
