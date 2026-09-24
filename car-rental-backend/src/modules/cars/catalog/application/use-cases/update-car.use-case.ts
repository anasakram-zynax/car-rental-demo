import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  UpdateCarData,
} from '../ports/car-repository.port.js';
import { CarNotFoundError, InvalidCarDataError } from '../../domain/car-errors.js';

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

    if (data.images !== undefined) {
      throw new InvalidCarDataError('Use the car image upload/delete endpoints to change images.');
    }
    return this.carRepository.update(id, data);
  }
}
