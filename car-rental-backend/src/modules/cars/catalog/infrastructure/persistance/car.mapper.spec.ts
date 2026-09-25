import { describe, expect, it } from 'vitest';
import { CarMapper } from './car.mapper.js';

const record = (publicId: string | null | undefined) => ({
  id: 'car', name: 'Car', slug: 'car', brand: 'Brand', model: 'Model', year: 2026,
  carTypeId: 'type', transmission: 'Automatic', fuelType: 'Petrol', doors: 4,
  passengers: 5, baggage: 2, amenities: [], city: 'Lahore', dailyPrice: 10,
  currency: 'USD', isRefundable: true, featured: false, serviceType: 'RENTAL',
  withDriver: false, availableQuantity: 1, status: 'ACTIVE', transferPackages: [],
  images: [{ id: 'image', url: 'https://example.com/image.jpg', publicId, isDefault: true }],
  createdAt: new Date(), updatedAt: new Date(),
});

describe('CarMapper image publicId', () => {
  it('maps a persisted Cloudinary public ID', () => {
    expect(CarMapper.toDomain(record('car-rental/cars/car/image')).images[0]?.publicId).toBe('car-rental/cars/car/image');
  });

  it('keeps legacy image rows compatible as null', () => {
    expect(CarMapper.toDomain(record(undefined)).images[0]?.publicId).toBeNull();
  });
});
