import { describe, expect, it, vi } from 'vitest';
import { PrismaCarImageRepository } from './prisma-car-image.repository.js';
import type { PrismaService } from '../../../../../shared/database/prisma.service.js';

function repositoryWith(transaction: Record<string, unknown>) {
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(transaction)),
  } as unknown as PrismaService;
  return new PrismaCarImageRepository(prisma);
}

describe('PrismaCarImageRepository default policy', () => {
  it('makes only the first upload default when the car has no images', async () => {
    const create = vi.fn(async ({ data }) => ({ id: data.publicId, ...data }));
    const tx = {
      $queryRaw: vi.fn(),
      carImage: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn(),
        update: vi.fn(),
        create,
      },
    };
    const repository = repositoryWith(tx);
    const result = await repository.append('car', [
      { url: 'https://example.com/1.jpg', publicId: 'one' },
      { url: 'https://example.com/2.jpg', publicId: 'two' },
    ]);

    expect(result.map((image) => image.isDefault)).toEqual([true, false]);
  });

  it('preserves an existing default for additional uploads', async () => {
    const create = vi.fn(async ({ data }) => ({ id: 'new', ...data }));
    const tx = {
      $queryRaw: vi.fn(),
      carImage: {
        findMany: vi.fn().mockResolvedValue([{ id: 'existing', carId: 'car', url: 'old', publicId: null, isDefault: true }]),
        updateMany: vi.fn(), update: vi.fn(), create,
      },
    };
    const repository = repositoryWith(tx);
    const result = await repository.append('car', [{ url: 'https://example.com/new.jpg', publicId: 'new' }]);

    expect(result[0]?.isDefault).toBe(false);
    expect(tx.carImage.updateMany).not.toHaveBeenCalled();
    expect(tx.carImage.update).not.toHaveBeenCalled();
  });

  it('promotes the first deterministic remaining image after deleting the default', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      carImage: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', carId: 'car', url: 'a', publicId: 'a', isDefault: false },
          { id: 'b', carId: 'car', url: 'b', publicId: 'b', isDefault: false },
        ]),
        updateMany: vi.fn(), update: vi.fn(),
      },
    };
    const repository = repositoryWith(tx);
    await repository.remove('car', 'deleted');

    expect(tx.carImage.deleteMany).toHaveBeenCalledWith({ where: { id: 'deleted', carId: 'car' } });
    expect(tx.carImage.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { isDefault: true } });
  });

  it('deletes a non-default image without rewriting the existing default', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      carImage: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'a', carId: 'car', url: 'a', publicId: 'a', isDefault: true },
        ]),
        updateMany: vi.fn(), update: vi.fn(),
      },
    };
    const repository = repositoryWith(tx);
    await repository.remove('car', 'non-default');

    expect(tx.carImage.updateMany).not.toHaveBeenCalled();
    expect(tx.carImage.update).not.toHaveBeenCalled();
  });
});
