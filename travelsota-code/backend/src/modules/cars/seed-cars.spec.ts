import {
  CAR_FLEET_SEEDS,
  CAR_FLEET_CONTENT,
  CAR_FLEET_CONTENT,
  CAR_LOCATION_SEEDS,
  CAR_TRANSFER_PACKAGE_SEEDS,
  seedCars,
} from '../../scripts/seed-cars';
import {
  CarImageManifest,
  EXPECTED_CAR_ASSET_SLUGS,
} from '../../scripts/import-car-images';

describe('Cars seed', () => {
  const manifest: CarImageManifest = {
    version: 1,
    cars: Object.fromEntries(
      EXPECTED_CAR_ASSET_SLUGS.map((slug) => [
        slug,
        {
          images: [
            {
              url: `https://images.example/${slug}/01.jpg`,
              order: 0,
              isDefault: true,
              sourceFile: '01.jpg',
              sourceHash: `hash-${slug}`,
            },
          ],
        },
      ]),
    ),
  };
  function prismaMock() {
    return {
      carLocation: {
        upsert: jest.fn(async ({ where }: any) => ({
          id: `location:${where.identity}`,
        })),
      },
      carFleet: {
        upsert: jest.fn(async ({ where }: any) => ({
          id: `fleet:${JSON.stringify(where)}`,
        })),
      },
      carTransferPackage: {
        upsert: jest.fn(async ({ where }: any) => ({
          id: JSON.stringify(where),
        })),
      },
    };
  }

  it('upserts exactly 30 image-backed fleets and packages repeatably', async () => {
    const prisma = prismaMock();
    await seedCars(prisma as never, manifest);
    await seedCars(prisma as never, manifest);
    expect(prisma.carLocation.upsert).toHaveBeenCalledTimes(
      CAR_LOCATION_SEEDS.length * 2,
    );
    expect(prisma.carFleet.upsert).toHaveBeenCalledTimes(60);
    expect(prisma.carTransferPackage.upsert).toHaveBeenCalledTimes(
      CAR_TRANSFER_PACKAGE_SEEDS.length * 2,
    );
    const keys = prisma.carFleet.upsert.mock.calls.map(([call]) =>
      JSON.stringify(call.where),
    );
    expect(new Set(keys).size).toBe(30);
  });

  it('maps one exact asset folder per fleet without years in display names', () => {
    expect(CAR_FLEET_SEEDS).toHaveLength(30);
    expect(new Set(CAR_FLEET_SEEDS.map((fleet) => fleet.assetSlug))).toEqual(
      new Set(EXPECTED_CAR_ASSET_SLUGS),
    );
    expect(
      CAR_FLEET_SEEDS.every((fleet) => !/\b20\d{2}\b/.test(fleet.displayName)),
    ).toBe(true);
    const logicalKeys = CAR_FLEET_SEEDS.map(
      (fleet) =>
        `${fleet.displayName.toLowerCase()}::${fleet.locationIdentity}`,
    );
    expect(new Set(logicalKeys).size).toBe(CAR_FLEET_SEEDS.length);
  });

  it('provides distinct detailed descriptions and normalized amenities for every fleet', () => {
    const content = CAR_FLEET_SEEDS.map(
      (fleet) => CAR_FLEET_CONTENT[fleet.assetSlug],
    );
    expect(content.every(Boolean)).toBe(true);
    expect(new Set(content.map((item) => item.description)).size).toBe(30);
    for (const item of content) {
      const wordCount = item.description.trim().split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(70);
      expect(wordCount).toBeLessThanOrEqual(120);
      expect(item.amenities.length).toBeGreaterThan(0);
      expect(
        new Set(item.amenities.map((value) => value.toLowerCase())).size,
      ).toBe(item.amenities.length);
    }
  });

  it('provides distinct detailed descriptions and normalized amenities for every fleet', () => {
    const content = CAR_FLEET_SEEDS.map(
      (fleet) => CAR_FLEET_CONTENT[fleet.assetSlug],
    );
    expect(content.every(Boolean)).toBe(true);
    expect(new Set(content.map((item) => item.description)).size).toBe(30);
    for (const item of content) {
      const wordCount = item.description.trim().split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(70);
      expect(wordCount).toBeLessThanOrEqual(120);
      expect(item.amenities.length).toBeGreaterThan(0);
      expect(
        new Set(item.amenities.map((value) => value.toLowerCase())).size,
      ).toBe(item.amenities.length);
    }
  });

  it('writes ordered URL metadata and keeps transfer prices package-owned', async () => {
    const prisma = prismaMock();
    await seedCars(prisma as never, manifest);
    for (const [call] of prisma.carFleet.upsert.mock.calls) {
      expect(call.create.images[0]).toEqual(
        expect.objectContaining({ order: 0, isDefault: true }),
      );
      expect(call.create.images[0].url).toMatch(/^https:\/\//);
      expect(call.create).not.toHaveProperty('transferPrice');
      expect(call.create.description).toEqual(expect.any(String));
      expect(call.create.amenities.length).toBeGreaterThan(0);
      expect(call.create.description).toEqual(expect.any(String));
      expect(call.create.amenities.length).toBeGreaterThan(0);
      expect(call.create.currency).toBe('USD');
      expect(call.update.currency).toBe('USD');
      expect(call.create.rentalPrice).toBeGreaterThan(0);
      expect(call.create.rentalPrice).toBeLessThanOrEqual(300);
    }
    const fleetNames = new Set(
      CAR_FLEET_SEEDS.map((fleet) => fleet.displayName),
    );
    expect(
      CAR_TRANSFER_PACKAGE_SEEDS.every(([name]) => fleetNames.has(name)),
    ).toBe(true);
    for (const [call] of prisma.carTransferPackage.upsert.mock.calls) {
      expect(call.create.currency).toBe('USD');
      expect(call.update.currency).toBe('USD');
      expect(call.create.price).toBeGreaterThan(0);
      expect(call.create.price).toBeLessThanOrEqual(100);
    }
  });

  it('fails clearly when image import has not supplied a fleet', async () => {
    await expect(
      seedCars(prismaMock() as never, { version: 1, cars: {} }),
    ).rejects.toThrow('Run npm run import:car-images first');
  });
});
