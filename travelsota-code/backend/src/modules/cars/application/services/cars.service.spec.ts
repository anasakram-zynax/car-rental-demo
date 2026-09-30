import type { CarFleetRepositoryPort } from '../ports/car-fleet-repository.port';
import type { CarLocationRepositoryPort } from '../ports/car-location-repository.port';
import type { CarTransferPackageRepositoryPort } from '../ports/car-transfer-package-repository.port';
import type { CarBookingRepositoryPort } from '../ports/car-booking-repository.port';
import type { CarFleetEntity } from '../../domain/entities/car-fleet.entity';
import type { CarLocationEntity } from '../../domain/entities/car-location.entity';
import { CarsService, type CreateCarFleetCommand } from './cars.service';

const now = new Date('2026-01-01T00:00:00.000Z');
const location: CarLocationEntity = {
  id: 'location-1',
  identity: 'airport:dxb:united arab emirates',
  label: 'Dubai International Airport (DXB)',
  name: 'Dubai International Airport',
  city: 'Dubai',
  region: null,
  country: 'United Arab Emirates',
  type: 'airport',
  code: 'DXB',
  createdAt: now,
  updatedAt: now,
};
const fleet: CarFleetEntity = {
  id: 'fleet-1',
  displayName: 'Toyota Corolla or similar',
  normalizedDisplayName: 'toyota corolla or similar',
  brand: 'Toyota',
  model: 'Corolla',
  category: 'economy',
  description: null,
  amenities: [],
  passengerCapacity: 5,
  luggageCapacity: 2,
  transmission: 'automatic',
  quantity: 1,
  rentalEnabled: true,
  transferEnabled: true,
  rentalPrice: 35,
  currency: 'USD',
  locationId: location.id,
  location,
  images: null,
  isActive: true,
  displayOrder: 0,
  createdAt: now,
  updatedAt: now,
};
const command: CreateCarFleetCommand = {
  displayName: fleet.displayName,
  brand: 'Toyota',
  model: 'Corolla',
  category: 'Economy',
  passengerCapacity: 5,
  luggageCapacity: 2,
  transmission: 'Automatic',
  quantity: 1,
  rentalEnabled: true,
  transferEnabled: true,
  rentalPrice: 35,
  currency: 'usd',
  location: {
    label: location.label,
    name: location.name,
    city: location.city,
    country: location.country,
    type: 'airport',
    code: 'dxb',
  },
};

describe('CarsService', () => {
  let fleets: jest.Mocked<CarFleetRepositoryPort>;
  let locations: jest.Mocked<CarLocationRepositoryPort>;
  let packages: jest.Mocked<CarTransferPackageRepositoryPort>;
  let bookings: jest.Mocked<CarBookingRepositoryPort>;
  let service: CarsService;

  beforeEach(() => {
    fleets = {
      create: jest.fn().mockResolvedValue(fleet),
      update: jest.fn().mockResolvedValue(fleet),
      findById: jest.fn().mockResolvedValue(fleet),
      findDuplicate: jest.fn().mockResolvedValue(null),
      list: jest
        .fn()
        .mockResolvedValue({ items: [fleet], total: 1, page: 1, pageSize: 20 }),
      deactivate: jest.fn().mockResolvedValue({ ...fleet, isActive: false }),
    };
    locations = {
      findById: jest.fn(),
      findByIdentity: jest.fn(),
      create: jest.fn(),
      findOrCreate: jest.fn().mockResolvedValue(location),
      searchRentalLocations: jest.fn().mockResolvedValue([location]),
      searchTransferPickupLocations: jest.fn().mockResolvedValue([location]),
    };
    packages = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      search: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'package-1',
            fleetId: fleet.id,
            pickupLocationId: location.id,
            dropoffLocationId: 'location-2',
            price: 42,
            currency: 'USD',
            isActive: true,
            fleet,
            pickupLocation: location,
            dropoffLocation: {
              ...location,
              id: 'location-2',
              label: 'Downtown Dubai',
            },
            createdAt: now,
            updatedAt: now,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
      findDropoffLocations: jest.fn().mockResolvedValue([]),
    };
    bookings = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByPublicRef: jest.fn(),
      findByUserId: jest.fn(),
      findOverlappingRentals: jest.fn(),
      sumOverlappingRentalQuantity: jest.fn().mockResolvedValue(0),
      allocateRental: jest.fn(),
      expirePendingPaymentRentals: jest.fn(),
      atomicCancel: jest.fn(),
      atomicClaimStatus: jest.fn(),
    };
    service = new CarsService(fleets, locations, packages, bookings);
  });

  it.each(['Automatic', 'AUTOMATIC', ' automatic '])(
    'normalizes transmission before validation (%s)',
    async (transmission) => {
      await service.create({ ...command, transmission });
      expect(fleets.create).toHaveBeenCalledWith(
        expect.objectContaining({ transmission: 'automatic' }),
      );
    },
  );

  it('rejects an unsupported transmission after normalization', async () => {
    await expect(
      service.create({ ...command, transmission: 'CVT' }),
    ).rejects.toThrow('automatic or manual');
    expect(fleets.create).not.toHaveBeenCalled();
  });

  it('stores readable prices and a structured location', async () => {
    const result = await service.create(command);
    expect(locations.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'DXB', type: 'airport' }),
    );
    expect(fleets.create).toHaveBeenCalledWith(
      expect.objectContaining({
        rentalPrice: 35,
        locationId: location.id,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ rentalPrice: 35, location }),
    );
    expect(result).not.toHaveProperty('transferPrice');
  });

  it('trims, removes empty values, and deduplicates amenities', async () => {
    await service.create({
      ...command,
      amenities: [' Bluetooth ', '', 'bluetooth', 'USB Charging'],
    });
    expect(fleets.create).toHaveBeenCalledWith(
      expect.objectContaining({ amenities: ['Bluetooth', 'USB Charging'] }),
    );
  });

  it('creates a transfer-enabled fleet without a fleet transfer price', async () => {
    await expect(service.create(command)).resolves.toEqual(fleet);
    expect(fleets.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ transferPrice: expect.anything() }),
    );
  });

  it('still requires rentalPrice when rental service is enabled', async () => {
    await expect(
      service.create({ ...command, rentalPrice: undefined }),
    ).rejects.toThrow('Rental price is required');
  });

  it('rejects normalized duplicate names at the same location with 409', async () => {
    fleets.findDuplicate.mockResolvedValue(fleet);
    await expect(
      service.create({
        ...command,
        displayName: '  TOYOTA   Corolla or Similar ',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(fleets.findDuplicate).toHaveBeenCalledWith(
      'toyota corolla or similar',
      location.id,
      undefined,
    );
  });

  it('allows the same name at a different location and excludes self on update', async () => {
    locations.findOrCreate.mockResolvedValueOnce({
      ...location,
      id: 'location-2',
    });
    await service.create(command);
    expect(fleets.findDuplicate).toHaveBeenCalledWith(
      'toyota corolla or similar',
      'location-2',
      undefined,
    );
    await service.update(fleet.id, {
      displayName: ' Toyota Corolla or similar ',
    });
    expect(fleets.findDuplicate).toHaveBeenLastCalledWith(
      'toyota corolla or similar',
      location.id,
      fleet.id,
    );
  });

  it('passes readable-price and passenger-capacity rental filters inclusively', async () => {
    const result = await service.search({
      serviceType: 'RENTAL',
      locationId: location.id,
      pickupAt: '2026-10-01T10:00:00.000Z',
      returnAt: '2026-10-02T10:00:00.000Z',
      passengerCapacity: 5,
      luggageCapacity: 3,
      transmission: 'AUTOMATIC',
      minPrice: 35,
      maxPrice: 35,
      sort: 'price_desc',
    });
    expect(fleets.list).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: location.id,
        passengerCapacity: 5,
        luggageCapacity: 3,
        transmission: 'automatic',
        minPrice: 35,
        maxPrice: 35,
        sort: 'price_desc',
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ price: 35, location, amenities: [] }),
    );
  });

  it('excludes rentals without enough authoritative unit availability', async () => {
    bookings.sumOverlappingRentalQuantity.mockResolvedValue(1);
    const result = await service.search({
      serviceType: 'rental',
      locationId: location.id,
      pickupAt: '2026-10-01T10:00:00Z',
      dropoffAt: '2026-10-02T10:00:00Z',
      quantity: 1,
    });
    expect(result.items).toEqual([]);
    expect(bookings.sumOverlappingRentalQuantity).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['pending_payment', 'booking_in_progress', 'booked'],
      }),
    );
  });

  it('searches only repository-qualified transfer routes at package price', async () => {
    const result = await service.search({
      serviceType: 'transfer',
      pickupLocationId: location.id,
      dropoffLocationId: 'location-2',
      pickupAt: '2026-10-01T10:00:00.000Z',
      passengerCapacity: 5,
      minPrice: 42,
      maxPrice: 42,
    });
    expect(packages.search).toHaveBeenCalledWith(
      expect.objectContaining({
        pickupLocationId: location.id,
        dropoffLocationId: 'location-2',
        passengerCapacity: 5,
        minPrice: 42,
        maxPrice: 42,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({ packageId: 'package-1', price: 42 }),
    );
    expect(result.items[0].fleet).not.toHaveProperty('transferPrice');
  });

  it('supports different transfer package prices for the same fleet', async () => {
    const route = {
      id: 'package-1',
      fleetId: fleet.id,
      pickupLocationId: location.id,
      dropoffLocationId: 'dha',
      price: 25,
      currency: 'USD',
      isActive: true,
      fleet,
      pickupLocation: location,
      dropoffLocation: { ...location, id: 'dha', label: 'DHA Lahore' },
      createdAt: now,
      updatedAt: now,
    };
    packages.search.mockResolvedValueOnce({
      items: [
        route,
        {
          ...route,
          id: 'package-2',
          dropoffLocationId: 'gulberg',
          dropoffLocation: {
            ...location,
            id: 'gulberg',
            label: 'Gulberg Lahore',
          },
          price: 20,
        },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    });

    const result = await service.search({
      serviceType: 'transfer',
      pickupLocationId: location.id,
      dropoffLocationId: 'gulberg',
      pickupAt: '2026-10-01T10:00:00.000Z',
    });

    expect(result.items.map((item) => item.price)).toEqual([25, 20]);
  });

  it('uses service-specific autocomplete and returns empty invalid routes', async () => {
    await service.suggestLocations('rental', 'dub');
    await service.suggestLocations('TRANSFER', 'dub');
    await expect(service.findTransferDropoffs(location.id)).resolves.toEqual(
      [],
    );
    expect(locations.searchRentalLocations).toHaveBeenCalledWith('dub', 10);
    expect(locations.searchTransferPickupLocations).toHaveBeenCalledWith(
      'dub',
      10,
    );
    expect(packages.findDropoffLocations).toHaveBeenCalledWith(
      location.id,
      undefined,
    );
  });

  it('resolves a location by its authoritative id', async () => {
    locations.findById.mockResolvedValue(location);

    await expect(service.getLocationById(location.id)).resolves.toEqual(
      location,
    );
    expect(locations.findById).toHaveBeenCalledWith(location.id);
  });

  it('rejects an unknown location id', async () => {
    locations.findById.mockResolvedValue(null);

    await expect(service.getLocationById('missing')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CAR_LOCATION_NOT_FOUND' }),
    });
  });

  it('returns authoritative availability using summed booking quantities', async () => {
    fleets.findById.mockResolvedValue({ ...fleet, quantity: 5 });
    bookings.sumOverlappingRentalQuantity.mockResolvedValue(3);
    await expect(
      service.getRentalAvailability(
        fleet.id,
        '2026-10-01T10:00:00Z',
        '2026-10-02T10:00:00Z',
        2,
      ),
    ).resolves.toEqual({
      totalQuantity: 5,
      reservedQuantity: 3,
      availableQuantity: 2,
      requestedQuantity: 2,
      isAvailable: true,
    });
  });

  it.each([
    [{ ...fleet, isActive: false }, 'inactive'],
    [{ ...fleet, rentalEnabled: false }, 'disabled'],
  ])(
    'rejects unavailable fleet configuration',
    async (configuredFleet, message) => {
      fleets.findById.mockResolvedValue(configuredFleet);
      await expect(
        service.getRentalAvailability(
          fleet.id,
          '2026-10-01T10:00:00Z',
          '2026-10-02T10:00:00Z',
          1,
        ),
      ).rejects.toThrow(message);
    },
  );

  it('rejects invalid rental quantity and date order', async () => {
    await expect(
      service.getRentalAvailability(fleet.id, '2026-10-01', '2026-10-02', 0),
    ).rejects.toThrow('positive integer');
    await expect(
      service.getRentalAvailability(fleet.id, '2026-10-02', '2026-10-01', 1),
    ).rejects.toThrow('before drop-off');
  });

  it('creates a booked rental through the atomic allocation boundary', async () => {
    bookings.allocateRental.mockImplementation(async ({ booking }) => ({
      outcome: 'created',
      booking: { ...booking, id: 'booking-1', createdAt: now, updatedAt: now },
      reservedQuantity: booking.quantity,
    }));
    const result = await service.reserveRental({
      publicRef: 'CAR-1',
      fleetId: fleet.id,
      pickupLocation: 'DXB',
      dropoffLocation: 'DXB',
      pickupAt: '2026-10-01T10:00:00Z',
      dropoffAt: '2026-10-02T10:00:00Z',
      quantity: 1,
    });
    expect(result.status).toBe('booked');
    expect(bookings.allocateRental).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: ['pending_payment', 'booking_in_progress', 'booked'],
      }),
    );
    expect(fleets.update).not.toHaveBeenCalled();
  });

  it('rejects insufficient atomic allocation', async () => {
    bookings.allocateRental.mockResolvedValue({
      outcome: 'insufficient',
      totalQuantity: 1,
      reservedQuantity: 1,
    });
    await expect(
      service.reserveRental({
        publicRef: 'CAR-2',
        fleetId: fleet.id,
        pickupLocation: 'DXB',
        dropoffLocation: 'DXB',
        pickupAt: '2026-10-01T10:00:00Z',
        dropoffAt: '2026-10-02T10:00:00Z',
        quantity: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
