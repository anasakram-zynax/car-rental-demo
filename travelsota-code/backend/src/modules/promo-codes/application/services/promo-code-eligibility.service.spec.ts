import { Test } from '@nestjs/testing';
import { PromoCodeEligibilityService } from './promo-code-eligibility.service';
import { PromoCodeRepositoryToken, type IPromoCodeRepository } from '../../application/ports/promo-code.repository.port';
import { PromoCodeStatus, PromoCustomerType } from '../../domain/enums';
import type { PromoCodeWithCounts } from '../../application/ports/promo-code.repository.port';

describe('PromoCodeEligibilityService', () => {
  let service: PromoCodeEligibilityService;
  let promoCodeRepo: jest.Mocked<IPromoCodeRepository>;

  const basePromo = (overrides: Partial<PromoCodeWithCounts> = {}): PromoCodeWithCounts => ({
    id: 'promo-1',
    code: 'TEST10',
    name: 'Test Promo',
    description: null,
    status: PromoCodeStatus.ACTIVE,
    discountType: 'PERCENTAGE',
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
    customerType: PromoCustomerType.ALL,
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

  const defaultInput = () => ({
    promoCode: basePromo(),
    productType: 'flight',
    currency: 'USD',
    bookingSubtotalMinor: 10000,
  });

  beforeEach(async () => {
    promoCodeRepo = {
      countActiveRedemptions: jest.fn().mockResolvedValue(0),
      countUserRedemptions: jest.fn().mockResolvedValue(0),
      hasUserCompletedBooking: jest.fn().mockResolvedValue(false),
      findById: jest.fn(),
      findByCode: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      softDelete: jest.fn(),
      incrementUsageCount: jest.fn(),
      addUsedBy: jest.fn(),
      removeUsedBy: jest.fn(),
      getStats: jest.fn(),
      getRedemptions: jest.fn(),
      getAuditLogs: jest.fn(),
      createAuditLog: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        PromoCodeEligibilityService,
        { provide: PromoCodeRepositoryToken, useValue: promoCodeRepo },
      ],
    }).compile();

    service = module.get<PromoCodeEligibilityService>(PromoCodeEligibilityService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns eligible for ACTIVE promo with no restrictions', async () => {
    const result = await service.check(defaultInput());
    expect(result).toEqual({ eligible: true });
  });

  it('returns not eligible for non-ACTIVE promo', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ status: PromoCodeStatus.DRAFT }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_INACTIVE');
  });

  it('returns not eligible for PAUSED promo', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ status: PromoCodeStatus.PAUSED }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_INACTIVE');
  });

  it('returns not eligible when endsAt is in the past', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ endsAt: new Date('2020-01-01') }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_EXPIRED');
  });

  it('returns not eligible when startsAt is in the future', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ startsAt: new Date('2099-01-01') }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_EXPIRED');
  });

  it('returns not eligible on currency mismatch', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ currency: 'EUR' }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_CURRENCY_MISMATCH');
  });

  it('returns not eligible on product type mismatch', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ productTypes: ['hotel'] }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PRODUCT_NOT_ELIGIBLE');
  });

  it('returns not eligible when min amount not met', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ minBookingAmountMinor: 20000 }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_MIN_AMOUNT_NOT_MET');
  });

  it('returns not eligible for CUSTOMER-only promo without userType', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ customerType: PromoCustomerType.CUSTOMER }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_INVALID');
  });

  it('returns not eligible for CUSTOMER-only promo with AGENT userType', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ customerType: PromoCustomerType.CUSTOMER }),
      userType: 'AGENT',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_INVALID');
  });

  it('returns eligible for CUSTOMER-only promo with CUSTOMER userType', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ customerType: PromoCustomerType.CUSTOMER }),
      userType: 'CUSTOMER',
    });
    expect(result.eligible).toBe(true);
  });

  it('returns not eligible when usage limit reached', async () => {
    promoCodeRepo.countActiveRedemptions.mockResolvedValue(100);

    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ totalUsageLimit: 100 }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_USAGE_LIMIT_REACHED');
  });

  it('returns not eligible when per-user limit reached', async () => {
    promoCodeRepo.countUserRedemptions.mockResolvedValue(3);

    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ perUserLimit: 3 }),
      userId: 'user-1',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PER_USER_LIMIT_REACHED');
  });

  it('returns not eligible for first-booking-only with existing bookings', async () => {
    promoCodeRepo.hasUserCompletedBooking.mockResolvedValue(true);

    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ firstBookingOnly: true }),
      userId: 'user-1',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_FIRST_BOOKING_ONLY');
  });

  it('returns eligible when route restriction matches', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleRoutes: ['JED-RUH'] }),
      routeCode: 'JED-RUH',
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns not eligible when route restriction does not match', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleRoutes: ['JED-RUH'] }),
      routeCode: 'DXB-CAI',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PRODUCT_NOT_ELIGIBLE');
  });

  it('returns not eligible when route restricted but no route provided', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleRoutes: ['JED-RUH'] }),
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PRODUCT_NOT_ELIGIBLE');
  });

  it('returns eligible when airline restriction matches', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleAirlines: ['SV'] }),
      airlineCode: 'SV',
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns eligible when cabin restriction matches', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleCabins: ['business'] }),
      cabinClass: 'business',
    });
    expect(result).toEqual({ eligible: true });
  });

  it('returns not eligible when cabin restriction does not match', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleCabins: ['business'] }),
      cabinClass: 'economy',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PRODUCT_NOT_ELIGIBLE');
  });

  it('returns not eligible when provider is excluded', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ excludedProviders: ['amadeus'] }),
      providerKey: 'amadeus',
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PROMO_CODE_PRODUCT_NOT_ELIGIBLE');
  });

  it('returns eligible when productTypes includes all', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ productTypes: ['all'] }),
      productType: 'hotel',
    });
    expect(result).toEqual({ eligible: true });
  });

  it('matches currency case-insensitively', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ currency: 'usd' }),
      currency: 'USD',
    });
    expect(result).toEqual({ eligible: true });
  });

  it('matches route when input is uppercased by service', async () => {
    const result = await service.check({
      ...defaultInput(),
      promoCode: basePromo({ eligibleRoutes: ['JED-RUH'] }),
      routeCode: 'jed-ruh',
    });
    expect(result).toEqual({ eligible: true });
  });
});
