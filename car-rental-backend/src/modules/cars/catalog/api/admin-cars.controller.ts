import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateCarUseCase } from '../application/use-cases/create-car.use-case.js';
import { UpdateCarUseCase } from '../application/use-cases/update-car.use-case.js';
import { GetCarUseCase } from '../application/use-cases/get-car.use-case.js';
import { RemoveCarUseCase } from '../application/use-cases/remove-car.use-case.js';
import { CreateCarDto } from './dto/create-car.dto.js';
import { UpdateCarDto } from './dto/update-car.dto.js';

@Controller('admin/cars')
export class AdminCarsController {
  constructor(
    private readonly createCar: CreateCarUseCase,
    private readonly getCar: GetCarUseCase,
    private readonly updateCar: UpdateCarUseCase,
    private readonly removeCar: RemoveCarUseCase,
  ) {}

  @Post()
  create(@Body() dto: CreateCarDto) {
    return this.createCar.execute(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.getCar.execute(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCarDto) {
    return this.updateCar.execute(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.removeCar.execute(id);
  }
}
