import { Inject, Injectable } from '@nestjs/common';
import {
  CarLookupPort,
  CarLookupResult,
} from '../application/ports/car-lookup.port.js';
import { CAR_REPOSITORY } from '../../catalog/infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../../catalog/application/ports/car-repository.port.js';

@Injectable()
export class CatalogCarLookupAdapter implements CarLookupPort {
  constructor(
    @Inject(CAR_REPOSITORY)
    private readonly carRepository: CarRepositoryPort,
  ) {}

  async findById(id: string): Promise<CarLookupResult | null> {
    const car = await this.carRepository.findById(id);

    if (!car) {
      return null;
    }

    return {
      id: car.id,
      dailyPrice: car.dailyPrice,
      currency: car.currency,
      active: car.status === 'active',
    };
  }
}
