import { Test } from '@nestjs/testing';
import { PrismaHotelBookingRepository } from './prisma-hotel-booking.repository';
import { PrismaService } from '../../../../shared/database/prisma.service';
import type { CreateHotelBookingInput, HotelBookingEntity } from '../../domain/entities/hotel-booking.entity';

describe('PrismaHotelBookingRepository', () => {
  let repo: PrismaHotelBookingRepository;
  let prisma: { hotelBooking: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock } };

  const mockEntity: HotelBookingEntity = {
    id: 'hb-1',
    provider: 'hotelbeds',
    status: 'pending_payment',
    searchKey: null,
    hotelId: null,
    providerHotelId: null,
    supplierRateId: null,
    supplierReference: null,
    supplierStatus: null,
    supplierBookingId: null,
    supplierOrderId: null,
    supplierItemId: null,
    holder: { name: 'John', surname: 'Doe' },
    guests: null,
    clientReference: 'ref-1',
    paxes: [{ type: 'ADT' }],
    supplierAmount: null,
    supplierCurrency: null,
    customerAmount: null,
    customerCurrency: null,
    markupAmount: null,
    markupSnapshot: null,
    hotelSnapshot: null,
    priceSnapshot: { roomAdults: 2, roomChildren: 0, checkedAt: '2026-06-16T00:00:00.000Z' },
    rateSnapshot: null,
    supplierPayload: null,
    workflowTrace: null,
    rateKey: 'rate-key-1',
    hotelbedsRef: null,
    hotelbedsStatus: null,
    amount: 350.00,
    currency: 'EUR',
    message: null,
    userId: 'user-1',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    updatedAt: new Date('2026-06-16T00:00:00.000Z'),
  };

  beforeEach(async () => {
    prisma = {
      hotelBooking: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        PrismaHotelBookingRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<PrismaHotelBookingRepository>(PrismaHotelBookingRepository);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const createInput: CreateHotelBookingInput = {
      ...mockEntity,
    };

    it('stores both provider-neutral and legacy fields', async () => {
      prisma.hotelBooking.create.mockResolvedValue(mockEntity);

      await repo.create(createInput);

      const callData = prisma.hotelBooking.create.mock.calls[0][0].data;

      // Provider-neutral fields
      expect(callData.provider).toBe('hotelbeds');
      expect(callData.status).toBe('pending_payment');
      expect(callData.supplierRateId).toBeNull();
      expect(callData.supplierReference).toBeNull();
      expect(callData.supplierStatus).toBeNull();

      // Legacy fields written simultaneously
      expect(callData.rateKey).toBe('rate-key-1');
      expect(callData.hotelbedsRef).toBeNull();
      expect(callData.hotelbedsStatus).toBeNull();
      expect(callData.amount).toBe(350.00);
      expect(callData.currency).toBe('EUR');
    });

    it('stores new provider-neutral fields alongside legacy Hotelbeds fields', async () => {
      const inputWithNeutral: CreateHotelBookingInput = {
        ...createInput,
        supplierRateId: 'supplier-rate-1',
        supplierReference: 'SUP-REF-1',
        supplierStatus: 'CONFIRMED',
        supplierAmount: 300.00,
        supplierCurrency: 'USD',
        customerAmount: 450.00,
        customerCurrency: 'USD',
        markupAmount: 150.00,
        searchKey: 'search-key-1',
        hotelId: 'HTL-001',
        providerHotelId: '12345',
      };

      prisma.hotelBooking.create.mockResolvedValue(inputWithNeutral as any);

      await repo.create(inputWithNeutral);

      const data = prisma.hotelBooking.create.mock.calls[0][0].data;

      // Provider-neutral fields
      expect(data.supplierRateId).toBe('supplier-rate-1');
      expect(data.supplierReference).toBe('SUP-REF-1');
      expect(data.supplierStatus).toBe('CONFIRMED');
      expect(data.supplierAmount).toBe(300.00);
      expect(data.supplierCurrency).toBe('USD');
      expect(data.customerAmount).toBe(450.00);
      expect(data.customerCurrency).toBe('USD');
      expect(data.markupAmount).toBe(150.00);
      expect(data.searchKey).toBe('search-key-1');
      expect(data.hotelId).toBe('HTL-001');
      expect(data.providerHotelId).toBe('12345');

      // Legacy fields also stored
      expect(data.rateKey).toBe('rate-key-1');
      expect(data.amount).toBe(350.00);
    });
  });

  describe('update', () => {
    it('updates provider-neutral fields', async () => {
      prisma.hotelBooking.update.mockResolvedValue(mockEntity);

      await repo.update('hb-1', {
        status: 'booked',
        supplierReference: 'HB-123',
        supplierStatus: 'CONFIRMED',
        supplierAmount: 350.00,
      });

      const where = prisma.hotelBooking.update.mock.calls[0][0].where;
      const data = prisma.hotelBooking.update.mock.calls[0][0].data;

      expect(where.id).toBe('hb-1');
      expect(data.supplierReference).toBe('HB-123');
      expect(data.supplierStatus).toBe('CONFIRMED');
      expect(data.supplierAmount).toBe(350.00);
      expect(data.status).toBe('booked');
    });

    it('updates legacy fields alongside new fields', async () => {
      prisma.hotelBooking.update.mockResolvedValue(mockEntity);

      await repo.update('hb-1', {
        status: 'booked',
        hotelbedsRef: 'HB-123',
        hotelbedsStatus: 'CONFIRMED',
        supplierReference: 'HB-123',
        supplierStatus: 'CONFIRMED',
      });

      const data = prisma.hotelBooking.update.mock.calls[0][0].data;

      // Both old and new fields updated
      expect(data.hotelbedsRef).toBe('HB-123');
      expect(data.hotelbedsStatus).toBe('CONFIRMED');
      expect(data.supplierReference).toBe('HB-123');
      expect(data.supplierStatus).toBe('CONFIRMED');
    });
  });

  describe('findById', () => {
    it('returns entity with both old and new fields', async () => {
      const dbRow = {
        ...mockEntity,
        supplierReference: 'SUP-REF',
        hotelbedsRef: 'HB-LEGACY',
        supplierRateId: 'supplier-rate',
        rateKey: 'rate-key',
      };
      prisma.hotelBooking.findUnique.mockResolvedValue(dbRow);

      const result = await repo.findById('hb-1');

      expect(result).not.toBeNull();
      expect(result!.supplierReference).toBe('SUP-REF');
      expect(result!.hotelbedsRef).toBe('HB-LEGACY');
      expect(result!.supplierRateId).toBe('supplier-rate');
      expect(result!.rateKey).toBe('rate-key');
    });

    it('returns null when not found', async () => {
      prisma.hotelBooking.findUnique.mockResolvedValue(null);
      const result = await repo.findById('not-found');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns all entities', async () => {
      prisma.hotelBooking.findMany.mockResolvedValue([mockEntity]);
      const result = await repo.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('hb-1');
    });
  });

  describe('findByUserId', () => {
    it('filters by userId', async () => {
      prisma.hotelBooking.findMany.mockResolvedValue([mockEntity]);
      const result = await repo.findByUserId('user-1');
      expect(result).toHaveLength(1);
      expect(prisma.hotelBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
    });
  });
});
