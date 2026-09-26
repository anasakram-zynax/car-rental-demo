import { describe, it, expect } from 'vitest';
import {
  getOfferDisplayPrice,
  FLIGHT_TIME_BUCKETS,
  computeFlightFilterOptions,
  applyFlightFilters,
  type FlightFilterState,
} from '@/lib/filters/flight-filters';
import { defaultFlightFilters } from '@/lib/filters/types';
import type { FlightOfferView } from '@/lib/schema/flight';

describe('flight-filters', () => {
  describe('getOfferDisplayPrice', () => {
    it('prefers pricing.displayPrice.amount over price.total', () => {
      const offer = {
        offerId: 'off-1',
        price: { currency: 'PKR', total: 95000 },
        pricing: {
          supplierPrice: { amount: 95000, currency: 'PKR' },
          displayPrice: { amount: 340, currency: 'USD' },
        },
      } as FlightOfferView;

      expect(getOfferDisplayPrice(offer)).toBe(340);
    });

    it('falls back to price.total when displayPrice is missing', () => {
      const offer = {
        offerId: 'off-2',
        price: { currency: 'USD', total: 450 },
      } as FlightOfferView;

      expect(getOfferDisplayPrice(offer)).toBe(450);
    });
  });

  describe('FLIGHT_TIME_BUCKETS', () => {
    it('has evening bucket from 18:00 to 23:59', () => {
      const eveningBucket = FLIGHT_TIME_BUCKETS.find((b) => b.key === 'evening');
      expect(eveningBucket).toBeDefined();
      expect(eveningBucket?.label).toContain('18:00–23:59');
      expect(eveningBucket?.test(18)).toBe(true);
      expect(eveningBucket?.test(23)).toBe(true);
      expect(eveningBucket?.test(0)).toBe(false);
    });
  });

  describe('computeFlightFilterOptions airline deduplication', () => {
    it('counts unique offers per airline instead of multiplying by segment count', () => {
      const multiSegmentOffer = {
        offerId: 'off-etihad',
        price: { currency: 'USD', total: 500 },
        pricing: {
          supplierPrice: { amount: 500, currency: 'USD' },
          displayPrice: { amount: 500, currency: 'USD' },
        },
        segments: [
          { from: 'KHI', to: 'AUH', departureAt: '2026-06-10T10:00:00', arrivalAt: '2026-06-10T12:00:00', marketingCarrier: 'EY' },
          { from: 'AUH', to: 'LHR', departureAt: '2026-06-10T14:00:00', arrivalAt: '2026-06-10T18:00:00', marketingCarrier: 'EY' },
        ],
      } as FlightOfferView;

      const singleSegmentOffer = {
        offerId: 'off-etihad-2',
        price: { currency: 'USD', total: 600 },
        pricing: {
          supplierPrice: { amount: 600, currency: 'USD' },
          displayPrice: { amount: 600, currency: 'USD' },
        },
        segments: [
          { from: 'LHR', to: 'AUH', departureAt: '2026-06-15T10:00:00', arrivalAt: '2026-06-15T18:00:00', marketingCarrier: 'EY' },
        ],
      } as FlightOfferView;

      const options = computeFlightFilterOptions([multiSegmentOffer, singleSegmentOffer]);
      const eyOption = options.airlines.find((a) => a.key === 'EY');
      expect(eyOption).toBeDefined();
      // Should be 2 offers, NOT 3 segments
      expect(eyOption?.count).toBe(2);
    });
  });

  describe('applyFlightFilters with display price', () => {
    it('filters using displayPrice.amount instead of supplier currency total', () => {
      const cheapInDisplay = {
        offerId: 'off-cheap',
        price: { currency: 'PKR', total: 80000 }, // raw PKR total > 2000
        pricing: {
          supplierPrice: { amount: 80000, currency: 'PKR' },
          displayPrice: { amount: 280, currency: 'USD' }, // display USD 280
        },
        segments: [],
      } as unknown as FlightOfferView;

      const expensiveInDisplay = {
        offerId: 'off-exp',
        price: { currency: 'USD', total: 2500 },
        pricing: {
          supplierPrice: { amount: 2500, currency: 'USD' },
          displayPrice: { amount: 2500, currency: 'USD' },
        },
        segments: [],
      } as unknown as FlightOfferView;

      const filterState: FlightFilterState = {
        ...defaultFlightFilters(),
        priceMin: 200,
        priceMax: 500,
      };

      const result = applyFlightFilters([cheapInDisplay, expensiveInDisplay], filterState);
      expect(result).toHaveLength(1);
      expect(result[0].offerId).toBe('off-cheap');
    });
  });
});

