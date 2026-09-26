import { Test } from '@nestjs/testing';
import { PromoCodePricingService } from './promo-code-pricing.service';
import type { PromoCodeWithCounts } from '../../application/ports/promo-code.repository.port';
import { PromoDiscountType } from '../../domain/enums';

describe('PromoCodePricingService', () => {
  let service: PromoCodePricingService;

  const basePromo = (overrides: Partial<PromoCodeWithCounts> = {}): PromoCodeWithCounts => ({
    id: 'promo-1',
    code: 'TEST10',
    name: 'Test Promo',
    description: null,
    status: 'ACTIVE',
    discountType: PromoDiscountType.PERCENTAGE,
    discountValueMinor: 0,
    discountPercentBps: 1000,
    maxDiscountMinor: null,
    minBookingAmountMinor: null,
    currency: null,
    startsAt: null,
    endsAt: null,
    totalUsageLimit: null,
    perUserLimit: null,
    firstBookingOnly: false,
    customerType: 'ALL',
    productTypes: ['all'],
    eligibleRoutes: [],
    eligibleAirlines: [],
    eligibleCabins: [],
    eligibleHotelIds: [],
    eligibleDestinations: [],
    excludedProviders: [],
    isPublic: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    _count: { redemptions: 0 },
    ...overrides,
  });

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [PromoCodePricingService],
    }).compile();

    service = module.get<PromoCodePricingService>(PromoCodePricingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('applies PERCENTAGE discount correctly', () => {
    const result = service.calculate({
      promoCode: basePromo({ discountPercentBps: 1000 }),
      bookingSubtotalMinor: 10000,
      currency: 'USD',
    });

    expect(result.discountMinor).toBe(1000);
    expect(result.finalAmountMinor).toBe(9000);
    expect(result.currency).toBe('USD');
  });

  it('caps PERCENTAGE discount at maxDiscountMinor', () => {
    const result = service.calculate({
      promoCode: basePromo({
        discountPercentBps: 5000,
        maxDiscountMinor: 2000,
      }),
      bookingSubtotalMinor: 10000,
      currency: 'USD',
    });

    expect(result.discountMinor).toBe(2000);
    expect(result.finalAmountMinor).toBe(8000);
  });

  it('applies FIXED discount correctly', () => {
    const result = service.calculate({
      promoCode: basePromo({
        discountType: PromoDiscountType.FIXED,
        discountValueMinor: 500,
        discountPercentBps: null,
      }),
      bookingSubtotalMinor: 10000,
      currency: 'USD',
    });

    expect(result.discountMinor).toBe(500);
    expect(result.finalAmountMinor).toBe(9500);
  });

  it('never lets discount exceed subtotal (floor at 0)', () => {
    const result = service.calculate({
      promoCode: basePromo({
        discountType: PromoDiscountType.FIXED,
        discountValueMinor: 99999,
        discountPercentBps: null,
      }),
      bookingSubtotalMinor: 10000,
      currency: 'USD',
    });

    expect(result.discountMinor).toBe(10000);
    expect(result.finalAmountMinor).toBe(0);
  });

  it('passes currency through unchanged', () => {
    const result = service.calculate({
      promoCode: basePromo(),
      bookingSubtotalMinor: 5000,
      currency: 'EUR',
    });

    expect(result.currency).toBe('EUR');
  });

  it('returns zero discount when discountPercentBps is null for PERCENTAGE type', () => {
    const result = service.calculate({
      promoCode: basePromo({ discountPercentBps: null }),
      bookingSubtotalMinor: 10000,
      currency: 'USD',
    });

    expect(result.discountMinor).toBe(0);
    expect(result.finalAmountMinor).toBe(10000);
  });
});
