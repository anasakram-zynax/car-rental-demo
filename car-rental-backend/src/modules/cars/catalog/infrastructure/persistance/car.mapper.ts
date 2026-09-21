import { CarStatus } from '../../domain/car-status.js';
import { Car, CarImage } from '../../domain/car.entity.js';

export class CarMapper {
  static toDomain(data: any): Car {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      brand: data.brand,
      model: data.model,
      year: data.year,

      carTypeId: data.carTypeId,

      transmission: data.transmission,
      fuelType: data.fuelType,

      doors: data.doors,
      passengers: data.passengers,
      baggage: data.baggage,

      amenities: data.amenities,

      city: data.city,

      dailyPrice: Number(data.dailyPrice),
      currency: data.currency,

      isRefundable: data.isRefundable,
      featured: data.featured,

      status: data.status === 'ACTIVE' ? CarStatus.ACTIVE : CarStatus.INACTIVE,

      images: (data.images ?? []).map((image: any): CarImage => ({
        id: image.id,
        url: image.url,
        isDefault: image.isDefault,
      })),

      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
