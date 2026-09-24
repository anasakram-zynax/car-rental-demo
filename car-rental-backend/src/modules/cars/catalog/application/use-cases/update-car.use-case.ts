import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  UpdateCarData,
} from '../ports/car-repository.port.js';
import { CarNotFoundError, InvalidCarDataError } from '../../domain/car-errors.js';
import { ServiceType } from '../../domain/service-type.js';

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

    const nextServiceType = data.serviceType ?? existingCar.serviceType;
    const nextTransferPackages =
      data.transferPackages ?? existingCar.transferPackages;

    if (
      nextServiceType === ServiceType.TRANSFER &&
      nextTransferPackages.length === 0
    ) {
      throw new InvalidCarDataError(
        'Transfer cars require at least one transfer package.',
      );
    }

    return this.carRepository.update(id, data);
  }
}
