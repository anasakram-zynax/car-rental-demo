"use client";

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createCar, updateCar } from '../api/car/save-car';
import { deleteCarImage, setDefaultCarImage, uploadCarImages } from '../api/car/car-images';
import type { Car, CreateCarInput, LocalCarImageSelection, UpdateCarInput } from '../types/car.types';

export interface AdminCarSubmission {
  input: CreateCarInput | UpdateCarInput;
  files: LocalCarImageSelection[];
  removedImageIds: string[];
  defaultImageId?: string;
}
export interface AdminCarSaveResult {
  car: Car;
  remainingFiles: LocalCarImageSelection[];
  remainingRemovalIds: string[];
  warning: string | null;
}
export function useSaveAdminCar() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: async ({ carId, input, files, removedImageIds, defaultImageId }: AdminCarSubmission & { carId?: string }): Promise<AdminCarSaveResult> => {
      let car = carId ? await updateCar(carId, input) : await createCar(input as CreateCarInput);
      let remainingFiles = files;
      const remainingRemovalIds = [...removedImageIds];
      try {
        // Upload first so a failed upload never removes existing images.
        if (files.length) {
          const images = await uploadCarImages(car.id, files.map((selection) => selection.file));
          car = { ...car, images: [...car.images, ...images] };
          remainingFiles = [];
          const selected = files.findIndex((selection) => selection.isDefault);
          if (selected >= 0) defaultImageId = images[selected].id;
        }
        if (defaultImageId && !remainingRemovalIds.includes(defaultImageId)) {
          await setDefaultCarImage(car.id, defaultImageId);
          car = { ...car, images: car.images.map((image) => ({ ...image, isDefault: image.id === defaultImageId })) };
        }
        for (const imageId of removedImageIds) {
          await deleteCarImage(car.id, imageId);
          remainingRemovalIds.splice(remainingRemovalIds.indexOf(imageId), 1);
          const images = car.images.filter((image) => image.id !== imageId).map((image) => ({ ...image }));
          if (images.length && !images.some((image) => image.isDefault)) {
            const nextId = [...images].sort((a, b) => a.id.localeCompare(b.id))[0].id;
            images.forEach((image) => { image.isDefault = image.id === nextId; });
          }
          car = { ...car, images };
        }
        return { car, remainingFiles, remainingRemovalIds, warning: null };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Please try again.';
        return { car, remainingFiles, remainingRemovalIds, warning: `Car ${carId ? 'saved' : 'created'}, but image changes could not be completed. ${detail} Review images and save again to retry. The car has been kept.` };
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'cars'] }),
        queryClient.invalidateQueries({ queryKey: ['cars'] }),
      ]);
    },
  });
}
