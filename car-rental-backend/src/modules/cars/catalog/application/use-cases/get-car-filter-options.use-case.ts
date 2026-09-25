import { Inject, Injectable } from '@nestjs/common';
import { ServiceType } from '../../domain/service-type.js';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';

@Injectable()
export class GetCarFilterOptionsUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}

  async execute(serviceType?: ServiceType) {
    const options = await this.carRepository.getFilterOptions(serviceType);

    return {
      ...options,
      maxPrice:
        options.maxPrice > 0 ? Math.ceil(options.maxPrice / 10) * 10 : 0,
    };
  }
}
