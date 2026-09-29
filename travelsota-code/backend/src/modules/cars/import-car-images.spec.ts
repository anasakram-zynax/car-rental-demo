import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import {
  EXPECTED_CAR_ASSET_SLUGS,
  importCarImages,
  readCarImageManifest,
  scanCarAssets,
} from '../../scripts/import-car-images';

describe('Cars image importer', () => {
  const assetsRoot = resolve(process.cwd(), 'seed-assets', 'cars');

  it('detects exactly the expected 30 folders and numbered jpg-compatible images', async () => {
    const assets = await scanCarAssets(assetsRoot);
    expect(assets.map(({ slug }) => slug)).toEqual([
      ...EXPECTED_CAR_ASSET_SLUGS,
    ]);
    expect(assets).toHaveLength(30);
    expect(
      assets.every(({ images }) => images.length === 3 || images.length === 4),
    ).toBe(true);
    expect(
      assets
        .flatMap(({ images }) => images)
        .some(({ fileName }) => fileName.endsWith('.jpg')),
    ).toBe(true);
  });

  it('dry-run performs no uploads, writes, or source deletion', async () => {
    const upload = jest.fn();
    const firstAsset = join(assetsRoot, EXPECTED_CAR_ASSET_SLUGS[0], '01.jpg');
    const before = await readFile(firstAsset);
    const result = await importCarImages({
      assetsRoot,
      dryRun: true,
      upload,
      log: () => undefined,
    });
    expect(result).toEqual({ cars: 30, uploads: 0, reused: 0 });
    expect(upload).not.toHaveBeenCalled();
    expect(await readFile(firstAsset)).toEqual(before);
  });

  it('preserves sources and reuses the manifest without duplicate uploads', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'cars-import-test-'));
    const manifestPath = join(temp, 'manifest.json');
    const upload = jest.fn(
      async (file: string, folder: string) =>
        `https://cloudinary.example/${folder}/${file.split(/[\\/]/).pop()}`,
    );
    try {
      const first = await importCarImages({
        assetsRoot,
        manifestPath,
        upload,
        log: () => undefined,
      });
      const second = await importCarImages({
        assetsRoot,
        manifestPath,
        upload,
        log: () => undefined,
      });
      expect(first.uploads).toBeGreaterThan(0);
      expect(second.uploads).toBe(0);
      expect(second.reused).toBe(first.uploads);
      expect(upload).toHaveBeenCalledTimes(first.uploads);
      const manifest = await readCarImageManifest(manifestPath);
      for (const slug of EXPECTED_CAR_ASSET_SLUGS) {
        expect(manifest.cars[slug].images[0]).toEqual(
          expect.objectContaining({ order: 0, isDefault: true }),
        );
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
