import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';
import { CarNotFoundError } from '../../domain/car-errors.js';

@Injectable()
export class GetCarUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}

  async execute(id: string) {
    const car = await this.carRepository.findById(id);

    if (!car) {
      throw new CarNotFoundError(id);
    }

    return car;
  }
}
