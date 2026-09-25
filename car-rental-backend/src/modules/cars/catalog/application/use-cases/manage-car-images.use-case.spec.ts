import { describe, expect, it, vi } from 'vitest';
import { ManageCarImagesUseCase } from './manage-car-images.use-case.js';
import type {
  CarImageRepositoryPort,
  CarImageStoragePort,
  ImageFile,
  StoredImage,
} from '../ports/car-image.port.js';
import { InMemoryCarRepository } from '../../infrastructure/persistance/in-memory-car.repository.js';
import { LegacyCarImageDeletionError } from '../../domain/car-errors.js';

const jpeg = (size = 3, originalname = 'anything.jpg', mimetype = 'image/jpeg'): ImageFile => {
  const buffer = Buffer.alloc(size);
  buffer.set([0xff, 0xd8, 0xff]);
  return { buffer, size, mimetype, originalname };
};

async function setup(existingImages: Array<{ id: string; url: string; publicId?: string | null; isDefault: boolean }> = []) {
  const cars = new InMemoryCarRepository();
  const car = await cars.create({
    name: 'Test Car', slug: 'test-car', brand: 'Test', model: 'One', year: 2026,
    carTypeId: 'type', transmission: 'Automatic', fuelType: 'Petrol', doors: 4,
    passengers: 5, baggage: 2, amenities: [], city: 'Lahore', dailyPrice: 50,
    currency: 'USD', isRefundable: true, featured: false, images: [],
  });
  car.images = existingImages;
  let sequence = 0;
  const upload = vi.fn(async (): Promise<StoredImage> => {
    sequence += 1;
    return { url: `https://res.cloudinary.com/demo/image/upload/car-${sequence}.jpg`, publicId: `car-rental/cars/test-car/car-${sequence}` };
  });
  const deleteImage = vi.fn(async () => undefined);
  const storage: CarImageStoragePort = {
    upload,
    delete: deleteImage,
  };
  const append = vi.fn(async (_carId: string, uploaded: StoredImage[]) => {
    const hasDefault = car.images.some((image) => image.isDefault);
    if (car.images.length && !hasDefault) car.images[0].isDefault = true;
    const created = uploaded.map((image, index) => ({ id: `new-${index}`, ...image, isDefault: !car.images.length && index === 0 }));
    car.images.push(...created);
    return created;
  });
  const remove = vi.fn(async (_carId: string, imageId: string) => {
    car.images = car.images.filter((image) => image.id !== imageId);
    if (car.images.length && !car.images.some((image) => image.isDefault)) {
      [...car.images].sort((a, b) => a.id.localeCompare(b.id))[0].isDefault = true;
    }
  });
  const images: CarImageRepositoryPort = {
    append,
    remove,
    setDefault: vi.fn(async (_carId, imageId) => {
      car.images.forEach((image) => { image.isDefault = image.id === imageId; });
    }),
  };
  return {
    car, append, remove, upload, deleteImage,
    useCase: new ManageCarImagesUseCase(cars, images, storage),
  };
}

describe('ManageCarImagesUseCase', () => {
  it('uploads one image with the secure URL/public ID and makes it default', async () => {
    const { car, upload, useCase } = await setup();
    const result = await useCase.upload(car.id, [jpeg()]);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'anything.jpg',
        detectedFormat: 'jpeg',
      }),
      'test-car',
    );
    expect(result).toEqual([{ id: 'new-0', url: expect.stringContaining('https://'), publicId: 'car-rental/cars/test-car/car-1', isDefault: true }]);
  });

  it('uses detected bytes instead of a mismatched filename or declared MIME', async () => {
    const { car, upload, useCase } = await setup();
    await useCase.upload(car.id, [jpeg(3, 'my-car-photo.png', 'image/png')]);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ detectedFormat: 'jpeg' }),
      'test-car',
    );
  });

  it('uploads multiple images while preserving an existing default', async () => {
    const { car, useCase } = await setup([{ id: 'old', url: 'https://example.com/old.jpg', publicId: 'car-rental/cars/test-car/old', isDefault: true }]);
    const result = await useCase.upload(car.id, [jpeg(), jpeg()]);
    expect(result).toHaveLength(2);
    expect(result.every((image) => !image.isDefault)).toBe(true);
    expect(car.images.find((image) => image.id === 'old')?.isDefault).toBe(true);
  });

  it('cleans up every uploaded asset if persistence fails', async () => {
    const { car, append, deleteImage, useCase } = await setup();
    append.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(useCase.upload(car.id, [jpeg(), jpeg()])).rejects.toThrow('cleaned up');
    expect(deleteImage).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported and oversized files before storage', async () => {
    const { car, upload, useCase } = await setup();
    await expect(useCase.upload(car.id, [{ buffer: Buffer.from('gif'), size: 3, mimetype: 'image/gif', originalname: 'fake.jpg' }])).rejects.toThrow('Unsupported image format');
    await expect(useCase.upload(car.id, [jpeg(5 * 1024 * 1024 + 1)])).rejects.toThrow('at most 5 MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it('validates ownership and protects legacy images', async () => {
    const { car, remove, deleteImage, useCase } = await setup([{ id: 'legacy', url: 'https://example.com/legacy.jpg', publicId: null, isDefault: true }]);
    await expect(useCase.remove(car.id, 'other-car-image')).rejects.toThrow('does not belong');
    await expect(useCase.remove(car.id, 'legacy')).rejects.toBeInstanceOf(LegacyCarImageDeletionError);
    expect(remove).not.toHaveBeenCalled();
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it('deletes non-default and default images, promoting a deterministic replacement', async () => {
    const existing = [
      { id: 'b', url: 'https://example.com/b.jpg', publicId: 'car-rental/cars/test-car/b', isDefault: true },
      { id: 'a', url: 'https://example.com/a.jpg', publicId: 'car-rental/cars/test-car/a', isDefault: false },
      { id: 'c', url: 'https://example.com/c.jpg', publicId: 'car-rental/cars/test-car/c', isDefault: false },
    ];
    const { car, deleteImage, useCase } = await setup(existing);
    await useCase.remove(car.id, 'c');
    expect(car.images.map((image) => image.id)).toEqual(['b', 'a']);
    await useCase.remove(car.id, 'b');
    expect(deleteImage).toHaveBeenCalledTimes(2);
    expect(car.images).toEqual([expect.objectContaining({ id: 'a', isDefault: true })]);
  });
});
