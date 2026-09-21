import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  UpdateCarData,
} from '../ports/car-repository.port.js';
import { CarNotFoundError } from '../../domain/car-errors.js';

@Injectable()
export class UpdateCarUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly carRepository: CarRepositoryPort,
  ) {}

  async execute(id: string, data: UpdateCarData) {
    const existingCar = await this.carRepository.findById(id);

    if (!existingCar) {
      throw new CarNotFoundError(id);
    }

    return this.carRepository.update(id, data);
  }
}
