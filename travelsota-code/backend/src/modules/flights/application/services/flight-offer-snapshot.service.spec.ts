import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { FlightOfferSnapshotService } from './flight-offer-snapshot.service';
import { FlightOfferSnapshotRepoPortToken } from '../ports/flight-offer-snapshot-repo.port';
import type { SelectedOfferCacheEntry } from '../../domain/entities/flight-search-response';
import { SelectedOfferCacheService } from './selected-offer-cache.service';
import { FlightOfferDetailViewMapper } from './flight-offer-detail-view.mapper';
import { MarkupService } from '../../../markup/markup.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';

function makeCacheEntry(overrides: Partial<SelectedOfferCacheEntry> = {}): SelectedOfferCacheEntry {
  return {
    catalogUuid: 'catalog-123',
    offeringIds: ['offering-1'],
    productRefs: ['p1'],
    productSelections: [{ offeringId: 'offering-1', productIds: ['p1'] }],
    contentSource: 'NDC',
    supplierPrice: { amount: 450, currency: 'USD' },
    referenceList: {
      products: { p1: { id: 'p1', description: 'Test' } },
      flights: {},
    },
    passengerCriteria: [{ number: 1, passengerTypeCode: 'ADT' }],
    searchCriteria: { from: 'LHR', to: 'JFK', departureDate: '2026-07-15', adults: 1 },
    ...overrides,
  };
}

function makeSnapshotEntity(overrides: Partial<any> = {}) {
  return {
    id: 'snapshot-1',
    provider: 'travelport',
    offerId: 'offer-1',
    searchKey: 'search-key-1',
    tripType: 'one_way',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    normalizedOffer: {},
    pricingSnapshot: { amount: 450, currency: 'USD' },
    supplierContext: { catalogUuid: 'catalog-123', productIds: ['p1'], contentSource: 'NDC' },
    ...overrides,
  };
}

describe('FlightOfferSnapshotService', () => {
  let service: FlightOfferSnapshotService;
  let snapshotRepo: { create: jest.Mock; findById: jest.Mock; findBySearchKeyAndOfferId: jest.Mock; deleteExpired: jest.Mock };
  let selectedOfferCache: jest.Mocked<Pick<SelectedOfferCacheService, 'retrieve'>>;
  let detailViewMapper: jest.Mocked<Pick<FlightOfferDetailViewMapper, 'toDetailView'>>;

  beforeEach(async () => {
    snapshotRepo = {
      create: jest.fn().mockResolvedValue(makeSnapshotEntity()),
      findById: jest.fn(),
      findBySearchKeyAndOfferId: jest.fn(),
      deleteExpired: jest.fn(),
    };

    selectedOfferCache = {
      retrieve: jest.fn(),
    };

    detailViewMapper = {
      toDetailView: jest.fn().mockResolvedValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        FlightOfferSnapshotService,
        { provide: FlightOfferSnapshotRepoPortToken, useValue: snapshotRepo },
        { provide: SelectedOfferCacheService, useValue: selectedOfferCache },
        { provide: FlightOfferDetailViewMapper, useValue: detailViewMapper },
        {
          provide: MarkupService,
          useValue: {
            // Echo the base by default (no markup) so existing passthrough
            // assertions stay valid; individual tests can override.
            calculatePrice: jest.fn().mockImplementation(async (base: number) => ({
              basePrice: base,
              finalPrice: base,
              effectiveMarkupPercent: 0,
              appliedRules: [],
            })),
          },
        },
        {
          provide: CurrencyService,
          useValue: {
            // Identity conversion by default — tests assert plumbing, not rates.
            buildPricingBreakdown: jest
              .fn()
              .mockImplementation(
                async ({ supplierAmount, supplierCurrency, displayCurrency }) => ({
                  supplierPrice: { amount: supplierAmount, currency: supplierCurrency },
                  displayPrice: { amount: supplierAmount, currency: displayCurrency },
                  chargePrice: { amount: supplierAmount, currency: supplierCurrency },
                }),
              ),
          },
        },
      ],
    }).compile();

    service = module.get<FlightOfferSnapshotService>(FlightOfferSnapshotService);
  });

  describe('createSnapshot', () => {
    it('persists snapshot with all required Travelport identifiers', async () => {
      const entry = makeCacheEntry();
      selectedOfferCache.retrieve.mockResolvedValue(entry);
      snapshotRepo.create.mockResolvedValue(makeSnapshotEntity());

      const result = await service.createSnapshot({
        provider: 'travelport',
        offerId: 'offer-1',
        searchKey: 'search-key-1',
        displayCurrency: 'USD',
        tripType: 'one_way',
      });

      expect(selectedOfferCache.retrieve).toHaveBeenCalledWith(
        'search-key-1',
        'offer-1',
        'travelport',
      );
      expect(result.snapshotId).toBe('snapshot-1');
      expect(snapshotRepo.create).toHaveBeenCalledTimes(1);

      const savedData = snapshotRepo.create.mock.calls[0][0];
      expect(savedData.provider).toBe('travelport');
      expect(savedData.offerId).toBe('offer-1');
      expect(savedData.searchKey).toBe('search-key-1');
      expect(savedData.supplierContext.catalogUuid).toBe('catalog-123');
      expect(savedData.supplierContext.productIds).toEqual(['p1']);
      expect(savedData.supplierContext.contentSource).toBe('NDC');
    });

    it('throws NotFoundException when search cache is expired', async () => {
      selectedOfferCache.retrieve.mockResolvedValue(null);

      await expect(
        service.createSnapshot({
          provider: 'travelport',
          offerId: 'offer-1',
          searchKey: 'search-key-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when provider context is incomplete', async () => {
      const entry = makeCacheEntry({ catalogUuid: '', productRefs: [] });
      selectedOfferCache.retrieve.mockResolvedValue(entry);

      await expect(
        service.createSnapshot({
          provider: 'travelport',
          offerId: 'offer-1',
          searchKey: 'search-key-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for Duffel provider when slices are missing', async () => {
      const entry = makeCacheEntry({ contentSource: undefined });
      selectedOfferCache.retrieve.mockResolvedValue(entry);

      await expect(
        service.createSnapshot({
          provider: 'duffel',
          offerId: 'offer-1',
          searchKey: 'search-key-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getSnapshotDetail', () => {
    it('throws NotFoundException when snapshot is missing', async () => {
      snapshotRepo.findById.mockResolvedValue(null);

      await expect(service.getSnapshotDetail('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when snapshot is expired', async () => {
      snapshotRepo.findById.mockResolvedValue(
        makeSnapshotEntity({ expiresAt: new Date(Date.now() - 60000).toISOString() }),
      );

      await expect(service.getSnapshotDetail('snapshot-1')).rejects.toThrow(BadRequestException);
    });

    it('returns detail view for valid snapshot', async () => {
      const entity = makeSnapshotEntity({
        normalizedOffer: { baggage: {}, display: {} },
        supplierContext: {
          catalogUuid: 'catalog-123',
          offeringId: 'offering-1',
          productIds: ['p1'],
          productSelections: [],
          referenceList: { products: {}, flights: {} },
          passengerCriteria: [],
          searchCriteria: { from: 'LHR', to: 'JFK', departureDate: '2026-07-15', adults: 1 },
          contentSource: 'NDC',
        },
      });
      snapshotRepo.findById.mockResolvedValue(entity);
      detailViewMapper.toDetailView.mockResolvedValue({ journeys: [], route: {} });

      const result = await service.getSnapshotDetail('snapshot-1');

      expect(result.snapshotId).toBe('snapshot-1');
      expect(result.provider).toBe('travelport');
      expect(result.pricing.amount).toBe(450);
      expect(result.pricing.currency).toBe('USD');
      expect(detailViewMapper.toDetailView).toHaveBeenCalled();
    });
  });

  describe('getSnapshotRaw', () => {
    it('throws NotFoundException when not found', async () => {
      snapshotRepo.findById.mockResolvedValue(null);

      await expect(service.getSnapshotRaw('missing')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when expired', async () => {
      snapshotRepo.findById.mockResolvedValue(
        makeSnapshotEntity({ expiresAt: new Date(Date.now() - 60000).toISOString() }),
      );

      await expect(service.getSnapshotRaw('snapshot-1')).rejects.toThrow(BadRequestException);
    });

    it('returns raw entity for downstream use', async () => {
      const entity = makeSnapshotEntity();
      snapshotRepo.findById.mockResolvedValue(entity);

      const result = await service.getSnapshotRaw('snapshot-1');

      expect(result.id).toBe('snapshot-1');
      const sc = result.supplierContext as Record<string, unknown>;
      expect(sc.catalogUuid).toBe('catalog-123');
    });
  });
});
