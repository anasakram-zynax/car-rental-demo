import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { CreateCarDto } from './create-car.dto.js';
import { CarStatus } from '../../domain/car-status.js';

export class UpdateCarDto extends PartialType(CreateCarDto) {
  @IsOptional()
  @IsEnum(CarStatus)
  status?: CarStatus;
}
