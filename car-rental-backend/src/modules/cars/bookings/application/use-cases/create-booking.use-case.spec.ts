import { CreateBookingUseCase } from './create-booking.use-case.js';

import type {
  CarLookupPort,
  CarLookupResult,
} from '../ports/car-lookup.port.js';
import { InMemoryCarBookingRepository } from '../../infrastructure/persistance/in-memory-car-booking.repository.js';
import { vi } from 'vitest';

function bookingInput(pickupAt: string, returnAt: string, sequence = 1) {
  return {
    carId: 'car-1',
    pickupLocation: 'Lahore',
    dropoffLocation: 'Lahore',
    pickupAt: new Date(pickupAt),
    returnAt: new Date(returnAt),
    driverFirstName: 'Test',
    driverLastName: `Customer ${sequence}`,
    driverBirthDate: new Date('2000-01-01'),
    driverLicenseNumber: `TEST-${sequence}`,
    contactEmail: `customer${sequence}@example.com`,
    contactPhone: `+9230012345${sequence.toString().padStart(2, '0')}`,
  };
}

const transferPackage = {
  id: 'package-1',
  fromLocation: 'Islamabad International Airport',
  toLocation: 'Blue Area',
  price: 45,
  currency: 'USD',
};

function transferInput(pickupAt: string, sequence = 1) {
  return {
    carId: 'car-1',
    transferPackageId: transferPackage.id,
    pickupAt: new Date(pickupAt),
    driverFirstName: 'Transfer',
    driverLastName: `Passenger ${sequence}`,
    contactEmail: `transfer${sequence}@example.com`,
    contactPhone: `+9230098765${sequence.toString().padStart(2, '0')}`,
  };
}

class FakeCarLookup implements CarLookupPort {
  car: CarLookupResult | null = {
    id: 'car-1',
    serviceType: 'rental',
    dailyPrice: 50,
    currency: 'USD',
    active: true,
    availableQuantity: 1,
    transferPackages: [],
  };

  async findById(id: string): Promise<CarLookupResult | null> {
    if (!this.car || this.car.id !== id) {
      return null;
    }

    return this.car;
  }
}

describe('CreateBookingUseCase', () => {
  let repository: InMemoryCarBookingRepository;
  let carLookup: FakeCarLookup;
  let useCase: CreateBookingUseCase;

  beforeEach(() => {
    repository = new InMemoryCarBookingRepository();

    carLookup = new FakeCarLookup();

    useCase = new CreateBookingUseCase(repository, carLookup);
  });

  function useTransferCar(availableQuantity = 1) {
    carLookup.car = {
      id: 'car-1',
      serviceType: 'transfer',
      dailyPrice: 999,
      currency: 'USD',
      active: true,
      availableQuantity,
      transferPackages: [transferPackage],
    };
  }

  it('should create a confirmed unpaid booking', async () => {
    const result = await useCase.execute({
      carId: 'car-1',

      pickupLocation: 'Lahore Airport',
      dropoffLocation: 'Lahore Airport',

      pickupAt: new Date('2030-10-10T10:00:00Z'),

      returnAt: new Date('2030-10-13T10:00:00Z'),

      driverFirstName: 'Test',
      driverLastName: 'Driver',

      driverBirthDate: new Date('2000-01-01'),

      driverLicenseNumber: 'TEST-001',

      contactEmail: 'test@example.com',
      contactPhone: '+923001234567',
    });

    expect(result.rentalDays).toBe(3);
    expect(result.dailyPrice).toBe(50);
    expect(result.taxAmount).toBe(15);
    expect(result.totalPrice).toBe(165);

    expect(result.bookingStatus).toBe('confirmed');

    expect(result.paymentStatus).toBe('unpaid');

    expect(repository.bookings).toHaveLength(1);
  });

  it('allows one confirmed booking and rejects the next overlap at quantity 1', async () => {
    await useCase.execute({
      carId: 'car-1',

      pickupLocation: 'Lahore',
      dropoffLocation: 'Lahore',

      pickupAt: new Date('2030-10-10T10:00:00Z'),

      returnAt: new Date('2030-10-15T10:00:00Z'),

      driverFirstName: 'First',
      driverLastName: 'Customer',

      driverBirthDate: new Date('2000-01-01'),

      driverLicenseNumber: 'TEST-001',

      contactEmail: 'first@example.com',
      contactPhone: '+923001111111',
    });

    await expect(
      useCase.execute({
        carId: 'car-1',

        pickupLocation: 'Lahore',
        dropoffLocation: 'Lahore',

        pickupAt: new Date('2030-10-12T10:00:00Z'),

        returnAt: new Date('2030-10-14T10:00:00Z'),

        driverFirstName: 'Second',
        driverLastName: 'Customer',

        driverBirthDate: new Date('2000-01-01'),

        driverLicenseNumber: 'TEST-002',

        contactEmail: 'second@example.com',
        contactPhone: '+923002222222',
      }),
    ).rejects.toThrow('The selected car is not available for these dates.');
  });

  it('allows two overlaps and rejects the third at quantity 2', async () => {
    carLookup.car = { ...carLookup.car!, availableQuantity: 2 };
    const input = bookingInput('2030-11-10T10:00:00Z', '2030-11-12T10:00:00Z');

    await expect(useCase.execute(input)).resolves.toBeDefined();
    await expect(
      useCase.execute({ ...input, contactEmail: 'second@example.com' }),
    ).resolves.toBeDefined();
    await expect(
      useCase.execute({ ...input, contactEmail: 'third@example.com' }),
    ).rejects.toThrow('The selected car is not available for these dates.');

    expect(repository.bookings).toHaveLength(2);
  });

  it('allows three overlaps and rejects the fourth at quantity 3', async () => {
    carLookup.car = { ...carLookup.car!, availableQuantity: 3 };
    const input = bookingInput('2030-12-10T10:00:00Z', '2030-12-12T10:00:00Z');

    for (let sequence = 1; sequence <= 3; sequence += 1) {
      await expect(
        useCase.execute({
          ...input,
          contactEmail: `allowed${sequence}@example.com`,
        }),
      ).resolves.toBeDefined();
    }

    await expect(
      useCase.execute({ ...input, contactEmail: 'fourth@example.com' }),
    ).rejects.toThrow('The selected car is not available for these dates.');
    expect(repository.bookings).toHaveLength(3);
  });

  it('allows a non-overlapping booking', async () => {
    await useCase.execute(
      bookingInput('2031-01-10T10:00:00Z', '2031-01-12T10:00:00Z'),
    );

    await expect(
      useCase.execute(
        bookingInput('2031-01-15T10:00:00Z', '2031-01-17T10:00:00Z', 2),
      ),
    ).resolves.toBeDefined();
  });

  it('does not count a cancelled overlapping booking', async () => {
    const first = await useCase.execute(
      bookingInput('2031-02-10T10:00:00Z', '2031-02-12T10:00:00Z'),
    );
    await repository.cancel(first.reference, 'Test cancellation');

    await expect(
      useCase.execute(
        bookingInput('2031-02-11T10:00:00Z', '2031-02-13T10:00:00Z', 2),
      ),
    ).resolves.toBeDefined();
  });

  it('counts only bookings overlapping the requested interval', async () => {
    carLookup.car = { ...carLookup.car!, availableQuantity: 2 };

    await useCase.execute(
      bookingInput('2031-03-01T10:00:00Z', '2031-03-03T10:00:00Z'),
    );
    await useCase.execute(
      bookingInput('2031-03-10T10:00:00Z', '2031-03-15T10:00:00Z', 2),
    );

    await expect(
      useCase.execute(
        bookingInput('2031-03-12T10:00:00Z', '2031-03-14T10:00:00Z', 3),
      ),
    ).resolves.toBeDefined();
  });

  it('creates a transfer with its package price and computed three-hour window', async () => {
    useTransferCar();
    const pickupAt = new Date('2031-04-10T10:00:00Z');

    const result = await useCase.execute(transferInput(pickupAt.toISOString()));

    expect(result.transferPackageId).toBe(transferPackage.id);
    expect(result.pickupLocation).toBe(transferPackage.fromLocation);
    expect(result.dropoffLocation).toBe(transferPackage.toLocation);
    expect(result.returnAt).toEqual(new Date('2031-04-10T13:00:00Z'));
    expect(result.rentalDays).toBe(0);
    expect(result.dailyPrice).toBe(45);
    expect(result.taxAmount).toBe(0);
    expect(result.totalPrice).toBe(45);
  });

  it('rejects a transfer without a package id', async () => {
    useTransferCar();
    const input = transferInput('2031-05-10T10:00:00Z');

    await expect(
      useCase.execute({ ...input, transferPackageId: undefined }),
    ).rejects.toThrow('transferPackageId is required for a transfer booking.');
  });

  it('rejects a nonexistent transfer package', async () => {
    useTransferCar();

    await expect(
      useCase.execute({
        ...transferInput('2031-05-10T10:00:00Z'),
        transferPackageId: 'missing-package',
      }),
    ).rejects.toThrow(
      'The transfer package was not found for the selected car.',
    );
  });

  it('rejects a package belonging to another car', async () => {
    useTransferCar();

    await expect(
      useCase.execute({
        ...transferInput('2031-05-10T10:00:00Z'),
        transferPackageId: 'other-car-package',
      }),
    ).rejects.toThrow(
      'The transfer package was not found for the selected car.',
    );
  });

  it('rejects a customer-provided transfer return date before availability', async () => {
    useTransferCar();
    const availability = vi.spyOn(repository, 'countOverlappingConfirmed');

    await expect(
      useCase.execute({
        ...transferInput('2031-06-10T10:00:00Z'),
        returnAt: new Date('2031-07-10T10:00:00Z'),
      }),
    ).rejects.toThrow('returnAt must not be provided for a transfer booking.');

    expect(availability).not.toHaveBeenCalled();
  });

  it('rejects a rental without returnAt using the rental-specific error', async () => {
    const input = bookingInput('2031-06-10T10:00:00Z', '2031-06-12T10:00:00Z');

    await expect(
      useCase.execute({ ...input, returnAt: undefined }),
    ).rejects.toThrow('returnAt is required for a rental booking.');
  });

  it('rejects a rental without driverBirthDate', async () => {
    const input = bookingInput('2031-06-10T10:00:00Z', '2031-06-12T10:00:00Z');

    await expect(
      useCase.execute({ ...input, driverBirthDate: undefined }),
    ).rejects.toThrow('driverBirthDate is required for a rental booking.');
  });

  it('rejects a rental without driverLicenseNumber', async () => {
    const input = bookingInput('2031-06-10T10:00:00Z', '2031-06-12T10:00:00Z');

    await expect(
      useCase.execute({ ...input, driverLicenseNumber: undefined }),
    ).rejects.toThrow('driverLicenseNumber is required for a rental booking.');
  });

  it('does not require a driver license for transfers', async () => {
    useTransferCar();
    const result = await useCase.execute(transferInput('2031-07-10T10:00:00Z'));

    expect(result.driverLicenseNumber).toBeNull();
  });

  it('does not require a driver birth date for transfers', async () => {
    useTransferCar();
    const result = await useCase.execute(transferInput('2031-08-10T10:00:00Z'));

    expect(result.driverBirthDate).toBeNull();
  });

  it('rejects the second overlapping transfer at quantity 1', async () => {
    useTransferCar(1);
    await useCase.execute(transferInput('2031-09-10T10:00:00Z'));

    await expect(
      useCase.execute(transferInput('2031-09-10T11:00:00Z', 2)),
    ).rejects.toThrow('The selected car is not available for these dates.');
  });

  it('allows two overlapping transfers and rejects the third at quantity 2', async () => {
    useTransferCar(2);

    await expect(
      useCase.execute(transferInput('2031-10-10T10:00:00Z')),
    ).resolves.toBeDefined();
    await expect(
      useCase.execute(transferInput('2031-10-10T11:00:00Z', 2)),
    ).resolves.toBeDefined();
    await expect(
      useCase.execute(transferInput('2031-10-10T12:00:00Z', 3)),
    ).rejects.toThrow('The selected car is not available for these dates.');
  });

  it('allows a transfer outside the computed three-hour window', async () => {
    useTransferCar();
    await useCase.execute(transferInput('2031-11-10T10:00:00Z'));

    await expect(
      useCase.execute(transferInput('2031-11-10T13:00:00Z', 2)),
    ).resolves.toBeDefined();
  });

  it('does not count a cancelled transfer against availability', async () => {
    useTransferCar();
    const first = await useCase.execute(transferInput('2031-12-10T10:00:00Z'));
    await repository.cancel(first.reference, 'Cancelled transfer');

    await expect(
      useCase.execute(transferInput('2031-12-10T11:00:00Z', 2)),
    ).resolves.toBeDefined();
  });

  it('should allow a booking starting when the previous booking ends', async () => {
    await useCase.execute({
      carId: 'car-1',
      pickupLocation: 'Lahore',
      dropoffLocation: 'Lahore',

      pickupAt: new Date('2030-10-10T10:00:00Z'),

      returnAt: new Date('2030-10-15T10:00:00Z'),

      driverFirstName: 'First',
      driverLastName: 'Customer',

      driverBirthDate: new Date('2000-01-01'),

      driverLicenseNumber: 'TEST-001',

      contactEmail: 'first@example.com',
      contactPhone: '+923001111111',
    });

    const second = await useCase.execute({
      carId: 'car-1',
      pickupLocation: 'Lahore',
      dropoffLocation: 'Lahore',

      pickupAt: new Date('2030-10-15T10:00:00Z'),

      returnAt: new Date('2030-10-17T10:00:00Z'),

      driverFirstName: 'Second',
      driverLastName: 'Customer',

      driverBirthDate: new Date('2000-01-01'),

      driverLicenseNumber: 'TEST-002',

      contactEmail: 'second@example.com',
      contactPhone: '+923002222222',
    });

    expect(second).toBeDefined();

    expect(repository.bookings).toHaveLength(2);
  });

  it('should reject an inactive car', async () => {
    carLookup.car = {
      id: 'car-1',
      serviceType: 'rental',
      dailyPrice: 50,
      currency: 'USD',
      active: false,
      availableQuantity: 1,
      transferPackages: [],
    };

    await expect(
      useCase.execute({
        carId: 'car-1',
        pickupLocation: 'Lahore',
        dropoffLocation: 'Lahore',

        pickupAt: new Date('2030-10-10T10:00:00Z'),

        returnAt: new Date('2030-10-12T10:00:00Z'),

        driverFirstName: 'Test',
        driverLastName: 'Driver',

        driverBirthDate: new Date('2000-01-01'),

        driverLicenseNumber: 'TEST-001',

        contactEmail: 'test@example.com',
        contactPhone: '+923001234567',
      }),
    ).rejects.toThrow('The selected car is not available for these dates.');
  });
});
