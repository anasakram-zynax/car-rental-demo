import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../../../shared/database/prisma.service.js';
import { CarSlugAlreadyExistsError } from '../../domain/car-errors.js';
import { PrismaCarRepository } from './prisma-car.repository.js';

const carRecord = {
  id: 'car',
  name: 'Transfer Car',
  slug: 'transfer-car',
  brand: 'Brand',
  model: 'Model',
  year: 2026,
  carTypeId: 'type',
  transmission: 'Automatic',
  fuelType: 'Petrol',
  doors: 4,
  passengers: 5,
  baggage: 2,
  amenities: [],
  city: 'Lahore',
  dailyPrice: 0,
  currency: 'USD',
  isRefundable: true,
  featured: false,
  serviceType: 'TRANSFER',
  withDriver: true,
  availableQuantity: 2,
  status: 'ACTIVE',
  images: [],
  transferPackages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe('PrismaCarRepository', () => {
  it('keeps the existing nested delete-and-recreate update contract', async () => {
    const packages = [
      {
        fromLocation: 'Airport',
        toLocation: 'Gulberg',
        price: 25,
        currency: 'USD',
      },
    ];
    const update = vi.fn(async () => ({
      ...carRecord,
      transferPackages: [{ id: 'package', carId: 'car', ...packages[0] }],
    }));
    const prisma = { car: { update } } as unknown as PrismaService;
    const repository = new PrismaCarRepository(prisma);

    await repository.update('car', { transferPackages: packages });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'car' },
        data: { transferPackages: { deleteMany: {}, create: packages } },
      }),
    );
  });

  it('returns all car types and distinct database-backed suggestions', async () => {
    const findCarTypes = vi.fn().mockResolvedValue([
      { id: 'sedan', label: 'Sedan' },
      { id: 'suv', label: 'SUV' },
    ]);
    const prisma = {
      carType: {
        findMany: findCarTypes,
      },
      car: {
        findMany: vi.fn().mockResolvedValue([
          { transmission: ' Automatic ', fuelType: 'Petrol' },
          { transmission: 'automatic', fuelType: ' petrol ' },
          { transmission: 'Manual', fuelType: 'Hybrid' },
        ]),
      },
    } as unknown as PrismaService;

    const options = await new PrismaCarRepository(prisma).getAdminFormOptions();

    expect(options).toEqual({
      carTypes: [
        { id: 'sedan', label: 'Sedan' },
        { id: 'suv', label: 'SUV' },
      ],
      transmissions: ['Automatic', 'Manual'],
      fuelTypes: ['Hybrid', 'Petrol'],
    });
    expect(findCarTypes).toHaveBeenCalledWith({
      select: { id: true, label: true },
      orderBy: { label: 'asc' },
    });
  });

  it('maps a duplicate slug during create to a domain error', async () => {
    const prisma = {
      car: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) },
    } as unknown as PrismaService;
    const repository = new PrismaCarRepository(prisma);

    await expect(
      repository.create({
        name: 'Car',
        slug: 'existing-car',
        brand: 'Brand',
        model: 'Model',
        year: 2026,
        carTypeId: 'type',
        transmission: 'Automatic',
        fuelType: 'Petrol',
        doors: 4,
        passengers: 5,
        baggage: 2,
        amenities: [],
        city: 'Lahore',
        dailyPrice: 100,
        currency: 'USD',
        isRefundable: true,
        featured: false,
        images: [],
      }),
    ).rejects.toBeInstanceOf(CarSlugAlreadyExistsError);
  });

  it('maps a duplicate slug during update to a domain error', async () => {
    const prisma = {
      car: { update: vi.fn().mockRejectedValue({ code: 'P2002' }) },
    } as unknown as PrismaService;

    await expect(
      new PrismaCarRepository(prisma).update('car', { slug: 'other-car' }),
    ).rejects.toBeInstanceOf(CarSlugAlreadyExistsError);
  });

  it('allows an update that keeps the car own slug', async () => {
    const update = vi.fn().mockResolvedValue(carRecord);
    const prisma = { car: { update } } as unknown as PrismaService;

    const car = await new PrismaCarRepository(prisma).update('car', {
      slug: 'transfer-car',
    });

    expect(car.slug).toBe('transfer-car');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'car' },
        data: { slug: 'transfer-car' },
      }),
    );
  });
});
