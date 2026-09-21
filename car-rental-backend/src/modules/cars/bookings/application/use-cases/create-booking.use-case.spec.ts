import { CreateBookingUseCase } from './create-booking.use-case.js';

import type {
  CarLookupPort,
  CarLookupResult,
} from '../ports/car-lookup.port.js';
import { InMemoryCarBookingRepository } from '../../infrastructure/persistance/in-memory-car-booking.repository.js';

class FakeCarLookup implements CarLookupPort {
  car: CarLookupResult | null = {
    id: 'car-1',
    dailyPrice: 50,
    currency: 'USD',
    active: true,
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

  it('should reject an overlapping booking', async () => {
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
      dailyPrice: 50,
      currency: 'USD',
      active: false,
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
