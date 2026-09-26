import { Test } from '@nestjs/testing';
import { PromoCodeAdminService } from './promo-code-admin.service';
import {
  PromoCodeRepositoryToken,
  type IPromoCodeRepository,
  type PromoCodeWithCounts,
  type PaginatedPromoCodes,
  type PromoStatsSummary,
} from '../../application/ports/promo-code.repository.port';
import { PromoCodeStatus } from '../../domain/enums';
import { BusinessError } from '../../../../shared/errors/business-error';
import { CurrencyService } from '../../../currency/application/services/currency.service';

describe('PromoCodeAdminService', () => {
  let service: PromoCodeAdminService;
  let promoCodeRepo: jest.Mocked<IPromoCodeRepository>;

  const mockPromo: PromoCodeWithCounts = {
    id: 'promo-1',
    code: 'SUMMER10',
    name: 'Summer Sale',
    description: '10% off',
    status: PromoCodeStatus.ACTIVE,
    discountType: 'PERCENTAGE',
    discountValueMinor: 0,
    discountPercentBps: 1000,
    maxDiscountMinor: null,
    minBookingAmountMinor: null,
    currency: null,
    startsAt: new Date('2025-06-01'),
    endsAt: new Date('2025-08-31'),
    totalUsageLimit: 1000,
    perUserLimit: 1,
    firstBookingOnly: false,
    customerType: 'ALL',
    productTypes: ['flight'],
    eligibleRoutes: [],
    eligibleAirlines: [],
    eligibleCabins: [],
    eligibleHotelIds: [],
    eligibleDestinations: [],
    excludedProviders: [],
    isPublic: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    _count: { redemptions: 10 },
  };

  beforeEach(async () => {
    promoCodeRepo = {
      findById: jest.fn(),
      findByCode: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      softDelete: jest.fn(),
      countActiveRedemptions: jest.fn(),
      countUserRedemptions: jest.fn(),
      hasUserCompletedBooking: jest.fn(),
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
        PromoCodeAdminService,
        { provide: PromoCodeRepositoryToken, useValue: promoCodeRepo },
        {
          provide: CurrencyService,
          useValue: {
            listActive: jest.fn().mockResolvedValue([{ code: 'USD', isDefault: true }]),
            fromSmallestUnit: jest.fn().mockImplementation(async (minor: number, code: string) => minor / (code === 'KWD' ? 1000 : 100)),
            convert: jest.fn().mockImplementation(async (amount: number, _from: string, _to: string) => ({ amount, currency: _to })),
            toSmallestUnit: jest.fn().mockImplementation(async (amount: number, code: string) => Math.round(amount * (code === 'KWD' ? 1000 : 100))),
          },
        },
      ],
    }).compile();

    service = module.get<PromoCodeAdminService>(PromoCodeAdminService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns paginated results with total count', async () => {
      const paginatedResult: PaginatedPromoCodes = {
        data: [mockPromo],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      promoCodeRepo.findMany.mockResolvedValue(paginatedResult);

      const result = await service.list({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(promoCodeRepo.findMany).toHaveBeenCalledWith({ page: 1, limit: 20 });
    });
  });

  describe('getStats', () => {
    it('aggregates stats correctly', async () => {
      const stats: PromoStatsSummary = {
        totalCodes: 50,
        activeCodes: 12,
        totalRedemptions: 340,
        totalDiscountMinor: 50000,
        totalDiscountCurrency: 'USD',
        byCurrency: [{ currency: 'USD', minor: 50000 }],
        uniqueUsers: 200,
      };
      promoCodeRepo.getStats.mockResolvedValue(stats);

      const result = await service.getStats();

      expect(result).toEqual(stats);
      expect(result.totalCodes).toBe(50);
      expect(result.uniqueUsers).toBe(200);
    });

    it('converts mixed-currency groups into the default currency', async () => {
      promoCodeRepo.getStats.mockResolvedValue({
        totalCodes: 2,
        activeCodes: 2,
        totalRedemptions: 2,
        totalDiscountMinor: 60000,
        totalDiscountCurrency: 'MIXED',
        byCurrency: [
          { currency: 'USD', minor: 50000 },
          { currency: 'KWD', minor: 10000 },
        ],
        uniqueUsers: 2,
      });

      const result = await service.getStats();

      // 500.00 USD + 10.000 KWD(identity mock rate) = 51000 USD minor
      expect(result.totalDiscountMinor).toBe(51000);
      expect(result.totalDiscountMinor).toBe(51000);
      expect(result.totalDiscountCurrency).toBe('USD');
    });
  });

  describe('getById', () => {
    it('returns a promo code', async () => {
      promoCodeRepo.findById.mockResolvedValue(mockPromo);

      const result = await service.getById('promo-1');

      expect(result.id).toBe('promo-1');
      expect(result.code).toBe('SUMMER10');
    });

    it('throws PROMO_CODE_NOT_FOUND when not found', async () => {
      promoCodeRepo.findById.mockResolvedValue(null);

      await expect(service.getById('nonexistent')).rejects.toThrow(BusinessError);
    });
  });

  describe('getByCode', () => {
    it('returns a promo code by code', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(mockPromo);

      const result = await service.getByCode('SUMMER10');

      expect(result.code).toBe('SUMMER10');
    });

    it('throws PROMO_CODE_NOT_FOUND when not found', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(null);

      await expect(service.getByCode('NOPE')).rejects.toThrow(BusinessError);
    });
  });

  describe('create', () => {
    it('creates with code uppercased and audit logged', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(null);
      promoCodeRepo.create.mockResolvedValue({ ...mockPromo, code: 'SAVER20' });

      const result = await service.create({
        code: ' saver20 ',
        name: 'Saver Deal',
        discountType: 'FIXED',
        discountValueMinor: 2000,
        createdById: 'admin-1',
      });

      expect(result.code).toBe('SAVER20');
      expect(promoCodeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'SAVER20' }),
      );
      expect(promoCodeRepo.createAuditLog).toHaveBeenCalledWith(
        result.id,
        'admin-1',
        'create',
        null,
        result,
      );
    });

    it('throws when code already exists', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(mockPromo);

      await expect(
        service.create({
          code: 'SUMMER10',
          name: 'Dup',
          discountType: 'FIXED',
          discountValueMinor: 100,
        }),
      ).rejects.toThrow(BusinessError);
    });

    it('throws for PERCENTAGE without discountPercentBps', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'NEW10',
          name: 'No Bps',
          discountType: 'PERCENTAGE',
          discountValueMinor: 0,
        }),
      ).rejects.toThrow(BusinessError);
    });

    it('throws for FIXED with maxDiscountMinor set', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'FIX5',
          name: 'Fixed',
          discountType: 'FIXED',
          discountValueMinor: 500,
          maxDiscountMinor: 100,
        }),
      ).rejects.toThrow(BusinessError);
    });

    it('throws when startsAt >= endsAt', async () => {
      promoCodeRepo.findByCode.mockResolvedValue(null);

      await expect(
        service.create({
          code: 'BAD',
          name: 'Bad dates',
          discountType: 'FIXED',
          discountValueMinor: 100,
          startsAt: new Date('2025-12-31'),
          endsAt: new Date('2025-01-01'),
        }),
      ).rejects.toThrow(BusinessError);
    });
  });

  describe('update', () => {
    it('patches fields and logs audit', async () => {
      promoCodeRepo.findById.mockResolvedValue(mockPromo);
      promoCodeRepo.update.mockResolvedValue({ ...mockPromo, name: 'Updated Name' });

      const result = await service.update('promo-1', {
        name: 'Updated Name',
        updatedById: 'admin-2',
      });

      expect(result.name).toBe('Updated Name');
      expect(promoCodeRepo.update).toHaveBeenCalledWith(
        'promo-1',
        expect.objectContaining({ name: 'Updated Name' }),
      );
      expect(promoCodeRepo.createAuditLog).toHaveBeenCalled();
    });

    it('throws PROMO_CODE_NOT_FOUND when promo does not exist', async () => {
      promoCodeRepo.findById.mockResolvedValue(null);

      await expect(service.update('nonexistent', { name: 'X' })).rejects.toThrow(BusinessError);
    });
  });

  describe('updateStatus', () => {
    it('changes status and logs audit', async () => {
      promoCodeRepo.findById.mockResolvedValue(mockPromo);
      const paused = { ...mockPromo, status: PromoCodeStatus.PAUSED };
      promoCodeRepo.updateStatus.mockResolvedValue(paused);

      const result = await service.updateStatus('promo-1', PromoCodeStatus.PAUSED, 'admin-1');

      expect(result.status).toBe(PromoCodeStatus.PAUSED);
      expect(promoCodeRepo.updateStatus).toHaveBeenCalledWith('promo-1', PromoCodeStatus.PAUSED);
      expect(promoCodeRepo.createAuditLog).toHaveBeenCalledWith(
        'promo-1',
        'admin-1',
        'pause',
        expect.anything(),
        result,
      );
    });

    it('throws for invalid status transition', async () => {
      promoCodeRepo.findById.mockResolvedValue({
        ...mockPromo,
        status: PromoCodeStatus.ARCHIVED,
      });

      await expect(
        service.updateStatus('promo-1', PromoCodeStatus.ACTIVE),
      ).rejects.toThrow(BusinessError);
    });

    it('throws PROMO_CODE_NOT_FOUND when promo does not exist', async () => {
      promoCodeRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('nonexistent', PromoCodeStatus.PAUSED),
      ).rejects.toThrow(BusinessError);
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED via updateStatus', async () => {
      promoCodeRepo.findById.mockResolvedValue(mockPromo);
      const archived = { ...mockPromo, status: PromoCodeStatus.ARCHIVED };
      promoCodeRepo.updateStatus.mockResolvedValue(archived);

      const result = await service.archive('promo-1', 'admin-1');

      expect(result.status).toBe(PromoCodeStatus.ARCHIVED);
      expect(promoCodeRepo.updateStatus).toHaveBeenCalledWith(
        'promo-1',
        PromoCodeStatus.ARCHIVED,
      );
    });
  });
});
