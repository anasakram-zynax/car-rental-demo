import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type {
  CarRepositoryPort,
  CreateCarData,
} from '../ports/car-repository.port.js';

@Injectable()
export class CreateCarUseCase {
  constructor(
    @Inject(CAR_REPOSITORY)
    private readonly carRepository: CarRepositoryPort,
  ) {}

  execute(data: CreateCarData) {
    return this.carRepository.create(data);
  }
}
