import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  PaginationFilters,
} from '../ports/car-repository.port.js';

@Injectable()
export class ListAdminCarsUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}

  execute(filters: PaginationFilters) {
    return this.carRepository.listAll(filters);
  }
}
