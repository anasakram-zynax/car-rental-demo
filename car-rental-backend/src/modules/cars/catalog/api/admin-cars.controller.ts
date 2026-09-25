import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ManageCarImagesUseCase } from '../application/use-cases/manage-car-images.use-case.js';
import type { ImageFile } from '../application/ports/car-image.port.js';
import { MAX_CAR_IMAGE_BYTES, MAX_CAR_IMAGE_FILES } from '../domain/car-image-policy.js';
import { CreateCarUseCase } from '../application/use-cases/create-car.use-case.js';
import { UpdateCarUseCase } from '../application/use-cases/update-car.use-case.js';
import { GetCarUseCase } from '../application/use-cases/get-car.use-case.js';
import { RemoveCarUseCase } from '../application/use-cases/remove-car.use-case.js';
import { CreateCarDto } from './dto/create-car.dto.js';
import { UpdateCarDto } from './dto/update-car.dto.js';
import { SearchCarsDto } from './dto/search-cars.dto.js';
import { ListAdminCarsUseCase } from '../application/use-cases/list-admin-cars.use-case.js';
import { GetCarFormOptionsUseCase } from '../application/use-cases/get-car-form-options.use-case.js';

@Controller('admin/cars')
export class AdminCarsController {
  constructor(
    private readonly createCar: CreateCarUseCase,
    private readonly getCar: GetCarUseCase,
    private readonly updateCar: UpdateCarUseCase,
    private readonly removeCar: RemoveCarUseCase,
    private readonly listCars: ListAdminCarsUseCase,
    private readonly carImages: ManageCarImagesUseCase,
    private readonly getFormOptions: GetCarFormOptionsUseCase,
  ) {}

  @Get()
  list(@Query() query: SearchCarsDto) {
    return this.listCars.execute({ page: query.page, limit: query.limit });
  }

  @Post()
  create(@Body() dto: CreateCarDto) {
    return this.createCar.execute(dto);
  }

  @Get('form-options')
  formOptions() {
    return this.getFormOptions.execute();
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

  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('images', MAX_CAR_IMAGE_FILES, {
    limits: { fileSize: MAX_CAR_IMAGE_BYTES, files: MAX_CAR_IMAGE_FILES, fields: 0 },
  }))
  uploadImages(@Param('id', ParseUUIDPipe) id: string, @UploadedFiles() files: ImageFile[]) {
    return this.carImages.upload(id, files ?? []);
  }

  @Delete(':carId/images/:imageId')
  deleteImage(@Param('carId', ParseUUIDPipe) carId: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.carImages.remove(carId, imageId);
  }

  @Patch(':carId/images/:imageId/default')
  defaultImage(@Param('carId', ParseUUIDPipe) carId: string, @Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.carImages.setDefault(carId, imageId);
  }
}
