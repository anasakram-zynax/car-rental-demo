import { Inject, Injectable } from '@nestjs/common';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';
import { CarNotFoundError } from '../../domain/car-errors.js';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';

@Injectable()
export class GetPublicCarUseCase {
  constructor(
    @Inject(CAR_REPOSITORY)
    private readonly carRepository: CarRepositoryPort,
  ) {}

  async execute(id: string) {
    const car = await this.carRepository.findActiveById(id);

    if (!car) {
      throw new CarNotFoundError(id);
    }

    return car;
  }
}
