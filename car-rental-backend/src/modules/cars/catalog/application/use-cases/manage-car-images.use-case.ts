import { Inject, Injectable } from '@nestjs/common';
import { CAR_REPOSITORY } from '../../infrastructure/car-repository.token.js';
import type { CarRepositoryPort } from '../ports/car-repository.port.js';
import { CAR_IMAGE_REPOSITORY, CAR_IMAGE_STORAGE } from '../ports/car-image.port.js';
import type { CarImageRepositoryPort, CarImageStoragePort, ImageFile, StoredImage } from '../ports/car-image.port.js';
import {
  CarImageOwnershipError,
  CarNotFoundError,
  InvalidCarDataError,
  LegacyCarImageDeletionError,
} from '../../domain/car-errors.js';
import { detectCarImageFormat, MAX_CAR_IMAGE_FILES } from '../../domain/car-image-policy.js';

@Injectable()
export class ManageCarImagesUseCase {
  constructor(
    @Inject(CAR_REPOSITORY) private readonly cars: CarRepositoryPort,
    @Inject(CAR_IMAGE_REPOSITORY) private readonly images: CarImageRepositoryPort,
    @Inject(CAR_IMAGE_STORAGE) private readonly storage: CarImageStoragePort,
  ) {}

  private async car(id: string) {
    const car = await this.cars.findById(id);
    if (!car) throw new CarNotFoundError(id);
    return car;
  }

  async upload(carId: string, files: ImageFile[]) {
    const car = await this.car(carId);
    if (!files.length || files.length > MAX_CAR_IMAGE_FILES) {
      throw new InvalidCarDataError('Select between 1 and 10 images per upload.');
    }
    const validatedFiles = files.map((file) => ({
      ...file,
      detectedFormat: detectCarImageFormat(file),
    }));
    const uploaded: StoredImage[] = [];
    try {
      for (const file of validatedFiles) {
        uploaded.push(await this.storage.upload(file, car.slug));
      }
      return await this.images.append(carId, uploaded);
    } catch {
      const cleanup = await Promise.allSettled(uploaded.map((image) => this.storage.delete(image.publicId)));
      if (cleanup.some((result) => result.status === 'rejected')) {
        throw new InvalidCarDataError('Image upload failed and asset cleanup was incomplete. Contact the administrator before retrying.');
      }
      throw new InvalidCarDataError('Images were not saved. Check Cloudinary configuration/connectivity and try again. Newly uploaded assets were cleaned up.');
    }
  }

  async remove(carId: string, imageId: string) {
    const car = await this.car(carId);
    const image = car.images.find((item) => item.id === imageId);
    if (!image) throw new CarImageOwnershipError();
    if (!image.publicId) {
      throw new LegacyCarImageDeletionError();
    }
    await this.storage.delete(image.publicId);
    try {
      await this.images.remove(carId, imageId);
    } catch {
      // Keep the row/public ID so the operation can be retried; storage deletion is idempotent.
      throw new InvalidCarDataError('Cloudinary asset removed, but the image database update failed. Retry this deletion to finish it.');
    }
    return { id: imageId };
  }

  async setDefault(carId: string, imageId: string) {
    const car = await this.car(carId);
    if (!car.images.some((image) => image.id === imageId)) {
      throw new CarImageOwnershipError();
    }
    await this.images.setDefault(carId, imageId);
    return { id: imageId };
  }
}
