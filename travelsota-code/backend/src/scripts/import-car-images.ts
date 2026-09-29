import 'dotenv/config';
import { createHash } from 'crypto';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, extname, join, resolve } from 'path';
import { uploadFileToCloudinary } from '../modules/upload/cloudinary-upload.util';

export const EXPECTED_CAR_ASSET_SLUGS = [
  'audi-a6-2024',
  'bmw-3-series-2024',
  'bmw-5-series-2024',
  'changan-alsvin-2024',
  'haval-h6-2024',
  'honda-accord-2024',
  'honda-br-v-2024',
  'honda-city-2024',
  'honda-civic-2024',
  'hyundai-elantra-2024',
  'hyundai-tucson-2024',
  'kia-picanto-2024',
  'kia-sportage-2024',
  'lexus-es-2024',
  'mercedes-c-class-2024',
  'mercedes-e-class-2024',
  'mg-hs-2024',
  'range-rover-sport-2024',
  'suzuki-alto-2024',
  'suzuki-cultus-2023',
  'suzuki-swift-2024',
  'toyota-camry-2023',
  'toyota-corolla-2025',
  'toyota-corolla-cross-2024',
  'toyota-fortuner-2025',
  'toyota-innova-2023',
  'toyota-land-cruiser-2024',
  'toyota-prado-2024',
  'toyota-vitz-2020',
  'toyota-yaris-2024',
] as const;

const ACCEPTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const NUMBERED_IMAGE = /^(\d{2})\.(jpg|jpeg|png|webp)$/i;

export interface CarAssetImage {
  fileName: string;
  filePath: string;
  sourceHash: string;
  order: number;
}

export interface CarAssetFolder {
  slug: string;
  images: CarAssetImage[];
}

export interface CarSeedImage {
  url: string;
  order: number;
  isDefault: boolean;
  sourceFile: string;
  sourceHash: string;
}

export interface CarImageManifest {
  version: 1;
  cars: Record<string, { images: CarSeedImage[] }>;
}

export const DEFAULT_CAR_ASSETS_ROOT = resolve(
  process.cwd(),
  'seed-assets',
  'cars',
);
export const DEFAULT_CAR_IMAGE_MANIFEST_PATH = resolve(
  process.cwd(),
  'src',
  'modules',
  'cars',
  'seed-data',
  'car-image-manifest.json',
);

async function sha256(filePath: string) {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

export async function scanCarAssets(
  assetsRoot = DEFAULT_CAR_ASSETS_ROOT,
): Promise<CarAssetFolder[]> {
  const entries = await readdir(assetsRoot, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const expected = [...EXPECTED_CAR_ASSET_SLUGS].sort();
  const missing = expected.filter((slug) => !folders.includes(slug));
  const unexpected = folders.filter(
    (slug) => !expected.includes(slug as never),
  );
  if (missing.length || unexpected.length) {
    throw new Error(
      `Invalid Cars asset folders. Missing: ${missing.join(', ') || 'none'}. Unexpected: ${unexpected.join(', ') || 'none'}.`,
    );
  }

  return Promise.all(
    expected.map(async (slug) => {
      const folderPath = join(assetsRoot, slug);
      const files = (await readdir(folderPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      const invalid = files.filter((file) => {
        const extension = extname(file).toLowerCase();
        return (
          !ACCEPTED_EXTENSIONS.has(extension) || !NUMBERED_IMAGE.test(file)
        );
      });
      if (invalid.length) {
        throw new Error(
          `Invalid image files in ${slug}: ${invalid.join(', ')}.`,
        );
      }
      if (files.length < 3 || files.length > 4) {
        throw new Error(`${slug} must contain 3 or 4 numbered images.`);
      }
      const numbers = files.map((file) =>
        Number(NUMBERED_IMAGE.exec(file)![1]),
      );
      if (numbers.some((number, index) => number !== index + 1)) {
        throw new Error(
          `${slug} images must be consecutively numbered from 01.`,
        );
      }
      const images = await Promise.all(
        files.map(async (fileName, index) => {
          const filePath = join(folderPath, fileName);
          return {
            fileName,
            filePath,
            sourceHash: await sha256(filePath),
            order: index,
          };
        }),
      );
      return { slug, images };
    }),
  );
}

export async function readCarImageManifest(
  manifestPath = DEFAULT_CAR_IMAGE_MANIFEST_PATH,
): Promise<CarImageManifest> {
  try {
    const parsed = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as CarImageManifest;
    if (parsed.version !== 1 || !parsed.cars) throw new Error('invalid format');
    return parsed;
  } catch (error) {
    throw new Error(
      `Cars image manifest is unavailable at ${manifestPath}. Run npm run import:car-images first.`,
      { cause: error },
    );
  }
}

async function writeManifest(path: string, manifest: CarImageManifest) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, path);
}

type Upload = (filePath: string, folder: string) => Promise<string>;

export async function importCarImages(options?: {
  assetsRoot?: string;
  manifestPath?: string;
  dryRun?: boolean;
  upload?: Upload;
  log?: (message: string) => void;
}) {
  const assets = await scanCarAssets(options?.assetsRoot);
  const log = options?.log ?? console.log;
  log(`Cars assets: ${assets.length} folders.`);
  for (const asset of assets)
    log(`${asset.slug}: ${asset.images.length} images`);
  if (options?.dryRun) return { cars: assets.length, uploads: 0, reused: 0 };

  const manifestPath = options?.manifestPath ?? DEFAULT_CAR_IMAGE_MANIFEST_PATH;
  let manifest: CarImageManifest = { version: 1, cars: {} };
  try {
    await access(manifestPath);
    manifest = await readCarImageManifest(manifestPath);
  } catch {
    // A first import starts a new Cars-local manifest.
  }

  const upload = options?.upload ?? uploadFileToCloudinary;
  let uploads = 0;
  let reused = 0;
  for (const asset of assets) {
    const existing = manifest.cars[asset.slug]?.images ?? [];
    const images: CarSeedImage[] = [];
    for (const image of asset.images) {
      const previous = existing.find(
        (entry) =>
          entry.sourceFile === image.fileName &&
          entry.sourceHash === image.sourceHash &&
          Boolean(entry.url),
      );
      if (previous) {
        images.push({
          ...previous,
          order: image.order,
          isDefault: image.order === 0,
        });
        reused += 1;
        continue;
      }

      const tempDirectory = await mkdtemp(join(tmpdir(), 'travelsota-car-'));
      const tempFile = join(tempDirectory, basename(image.fileName));
      try {
        await copyFile(image.filePath, tempFile);
        const url = await upload(tempFile, `travelsota/cars/${asset.slug}`);
        images.push({
          url,
          order: image.order,
          isDefault: image.order === 0,
          sourceFile: image.fileName,
          sourceHash: image.sourceHash,
        });
        uploads += 1;
        manifest.cars[asset.slug] = { images: [...images] };
        await writeManifest(manifestPath, manifest);
      } finally {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    }
    manifest.cars[asset.slug] = { images };
    await writeManifest(manifestPath, manifest);
  }
  return { cars: assets.length, uploads, reused };
}

async function main() {
  const dryRun = process.argv.slice(2).includes('--dry-run');
  const result = await importCarImages({ dryRun });
  console.log(
    dryRun
      ? `Cars image dry run complete: ${result.cars} cars; no uploads or writes.`
      : `Cars image import complete: ${result.cars} cars, ${result.uploads} uploaded, ${result.reused} reused.`,
  );
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
