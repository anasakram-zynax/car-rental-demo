import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../shared/database/prisma.service.js';
import type { CarImageRepositoryPort, StoredImage } from '../../application/ports/car-image.port.js';
import { InvalidCarDataError } from '../../domain/car-errors.js';

@Injectable()
export class PrismaCarImageRepository implements CarImageRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async append(carId: string, images: StoredImage[]) {
    return this.prisma.$transaction(async (tx) => {
      // All image mutations lock the parent to serialize default-image decisions.
      await tx.$queryRaw`SELECT id FROM car WHERE id = ${carId}::uuid FOR UPDATE`;
      const existing = await tx.carImage.findMany({ where: { carId }, orderBy: { id: 'asc' } });
      const defaults = existing.filter((image) => image.isDefault);
      const defaultId = defaults[0]?.id ?? existing[0]?.id;
      if (defaultId && defaults.length !== 1) {
        await tx.carImage.updateMany({ where: { carId }, data: { isDefault: false } });
        await tx.carImage.update({ where: { id: defaultId }, data: { isDefault: true } });
      }
      const created = [];
      for (const [index, image] of images.entries()) {
        created.push(await tx.carImage.create({ data: { ...image, carId, isDefault: !defaultId && index === 0 } }));
      }
      return created;
    });
  }

  async remove(carId: string, imageId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM car WHERE id = ${carId}::uuid FOR UPDATE`;
      const deleted = await tx.carImage.deleteMany({ where: { id: imageId, carId } });
      if (!deleted.count) throw new InvalidCarDataError('Image no longer belongs to this car.');
      const remaining = await tx.carImage.findMany({ where: { carId }, orderBy: { id: 'asc' } });
      const defaults = remaining.filter((image) => image.isDefault);
      const next = defaults[0] ?? remaining[0];
      if (next && defaults.length !== 1) {
        await tx.carImage.updateMany({ where: { carId }, data: { isDefault: false } });
        await tx.carImage.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  async setDefault(carId: string, imageId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM car WHERE id = ${carId}::uuid FOR UPDATE`;
      if (!await tx.carImage.findFirst({ where: { id: imageId, carId } })) {
        throw new InvalidCarDataError('Image no longer belongs to this car.');
      }
      await tx.carImage.updateMany({ where: { carId }, data: { isDefault: false } });
      await tx.carImage.update({ where: { id: imageId }, data: { isDefault: true } });
    });
  }
}
