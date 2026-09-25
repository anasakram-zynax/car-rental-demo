import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';

@Injectable()
export class GetCarFormOptionsUseCase {
  constructor(
    @Inject(CAR_REPOSITORY)
    private readonly cars: CarRepositoryPort,
  ) {}

  execute() {
    return this.cars.getAdminFormOptions();
  }
}
