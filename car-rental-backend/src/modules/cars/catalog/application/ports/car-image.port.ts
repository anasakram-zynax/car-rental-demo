import type { CarImage } from '../../domain/car.entity.js';
import type { CarImageFormat } from '../../domain/car-image-policy.js';

export const CAR_IMAGE_REPOSITORY = Symbol('CAR_IMAGE_REPOSITORY');
export const CAR_IMAGE_STORAGE = Symbol('CAR_IMAGE_STORAGE');

export interface ImageFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export interface ValidatedImageFile extends ImageFile {
  detectedFormat: CarImageFormat;
}

export interface StoredImage {
  url: string;
  publicId: string;
}

export interface CarImageStoragePort {
  upload(file: ValidatedImageFile, slug: string): Promise<StoredImage>;
  delete(publicId: string): Promise<void>;
}

export interface CarImageRepositoryPort {
  append(carId: string, images: StoredImage[]): Promise<CarImage[]>;
  remove(carId: string, imageId: string): Promise<void>;
  setDefault(carId: string, imageId: string): Promise<void>;
}
