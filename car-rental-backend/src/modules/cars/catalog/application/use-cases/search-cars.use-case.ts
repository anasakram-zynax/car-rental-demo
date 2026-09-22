import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  SearchCarsFilters,
} from '../ports/car-repository.port.js';

@Injectable()
export class SearchCarsUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}
  execute(filters: SearchCarsFilters) {
    return this.carRepository.search(filters);
  }
}
