import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';

function normalize(value: string | undefined) {
  return value?.trim().replace(/\s+/g, ' ') || undefined;
}

@Injectable()
export class SearchTransferLocationsUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}

  pickups(search: string | undefined, limit: number) {
    return this.carRepository.findTransferPickupLocations(
      normalize(search),
      limit,
    );
  }

  dropoffs(pickupLocation: string, search: string | undefined, limit: number) {
    return this.carRepository.findTransferDropoffLocations(
      normalize(pickupLocation)!,
      normalize(search),
      limit,
    );
  }
}
