import 'dotenv/config';
import { readdir, stat } from 'node:fs/promises';
import { dirname, extname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
} from 'cloudinary';
import { PrismaClient } from '../src/shared/database/generated/prisma/client.js';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const CLOUDINARY_ROOT = 'car-rental/cars';
const CLOUDINARY_DIAGNOSTIC_FOLDER = 'car-rental/diagnostics';
const EXPECTED_CAR_COUNT = 30;
const EXPECTED_TOTAL_IMAGE_COUNT = 98;
const EXPECTED_ORIGINAL_CAR_IMAGE_COUNT = 4;
const EXPECTED_NEW_CAR_IMAGE_COUNT = 3;
const CLOUDINARY_ENV_VARIABLES = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
] as const;

const SEED_PLACEHOLDERS: Readonly<Record<string, string>> = {
  'toyota-corolla-2025': 'https://placehold.co/800x500?text=Toyota+Corolla',
  'honda-civic-2024': 'https://placehold.co/800x500?text=Honda+Civic',
  'toyota-fortuner-2025': 'https://placehold.co/800x500?text=Toyota+Fortuner',
  'kia-sportage-2024': 'https://placehold.co/800x500?text=Kia+Sportage',
  'suzuki-swift-2024': 'https://placehold.co/800x500?text=Suzuki+Swift',
  'mercedes-c-class-2024': 'https://placehold.co/800x500?text=Mercedes+C-Class',
  'toyota-yaris-2024': 'https://placehold.co/800x500?text=Toyota+Yaris',
  'range-rover-sport-2024':
    'https://placehold.co/800x500?text=Range+Rover+Sport',
};
const ORIGINAL_CAR_SLUGS = new Set(Object.keys(SEED_PLACEHOLDERS));

interface LocalImage {
  filename: string;
  path: string;
  publicId: string;
}

interface ImageFolder {
  slug: string;
  images: LocalImage[];
  ignoredFiles: string[];
  invalidFiles: string[];
}

interface CarImageRecord {
  id: string;
  url: string;
  isDefault: boolean;
}

interface CarRecord {
  id: string;
  slug: string;
  images: CarImageRecord[];
}

type ExistingImageState =
  'empty' | 'seed-placeholder' | 'existing' | 'ambiguous-placeholder';

interface ImportCandidate {
  car: CarRecord;
  folder: ImageFolder;
  imageState: ExistingImageState;
}

interface RunSummary {
  carsChecked: number;
  carsImported: number;
  carsSkipped: number;
  carsFailed: number;
  imagesUploaded: number;
  unmatchedFolders: number;
  missingFolders: number;
}

interface ImportVerification {
  cars: number;
  carsWithImages: number;
  images: number;
  defaultImagesValid: boolean;
  cloudinaryUrlsValid: boolean;
  imageCountsValid: boolean;
  duplicateUrls: number;
}

class ImportConflictError extends Error {
  constructor(slug: string) {
    super(`Database images changed during import for ${slug}; import aborted.`);
    this.name = 'ImportConflictError';
  }
}

const isDryRun = process.argv.includes('--dry-run');
const isTestUpload = process.argv.includes('--test-upload');
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const assetsRoot = resolve(scriptDirectory, '../seed-assets/cars');

let prisma: PrismaClient | undefined;

function getPrismaClient() {
  if (!prisma) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    prisma = new PrismaClient({ adapter });
  }

  return prisma;
}

function compareNames(left: string, right: string) {
  return left.localeCompare(right, 'en', {
    numeric: true,
    sensitivity: 'base',
  });
}

function publicIdFor(filename: string) {
  return parse(filename)
    .name.toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function discoverImageFolders(): Promise<ImageFolder[]> {
  const entries = await readdir(assetsRoot, { withFileTypes: true });
  const directoryEntries = entries
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => compareNames(left.name, right.name));

  return Promise.all(
    directoryEntries.map(async (directoryEntry) => {
      const directoryPath = resolve(assetsRoot, directoryEntry.name);
      const entries = await readdir(directoryPath, { withFileTypes: true });
      const ignoredFiles: string[] = [];
      const invalidFiles: string[] = [];
      const candidates: LocalImage[] = [];

      for (const entry of entries.sort((left, right) =>
        compareNames(left.name, right.name),
      )) {
        const extension = extname(entry.name).toLowerCase();

        if (!entry.isFile() || !SUPPORTED_EXTENSIONS.has(extension)) {
          ignoredFiles.push(entry.name);
          continue;
        }

        const imagePath = resolve(directoryPath, entry.name);
        const imageStats = await stat(imagePath);

        if (imageStats.size === 0) {
          invalidFiles.push(`${entry.name} (empty file)`);
          continue;
        }

        const publicId = publicIdFor(entry.name);

        if (!publicId) {
          invalidFiles.push(`${entry.name} (invalid public ID)`);
          continue;
        }

        candidates.push({
          filename: entry.name,
          path: imagePath,
          publicId,
        });
      }

      const publicIdCounts = new Map<string, number>();

      for (const candidate of candidates) {
        publicIdCounts.set(
          candidate.publicId,
          (publicIdCounts.get(candidate.publicId) ?? 0) + 1,
        );
      }

      const images = candidates.filter((candidate) => {
        if ((publicIdCounts.get(candidate.publicId) ?? 0) === 1) {
          return true;
        }

        invalidFiles.push(
          `${candidate.filename} (duplicate public ID: ${candidate.publicId})`,
        );
        return false;
      });

      return {
        slug: directoryEntry.name,
        images,
        ignoredFiles,
        invalidFiles,
      };
    }),
  );
}

function classifyExistingImages(car: CarRecord): ExistingImageState {
  if (car.images.length === 0) {
    return 'empty';
  }

  const expectedPlaceholder = SEED_PLACEHOLDERS[car.slug];

  if (
    car.images.length === 1 &&
    expectedPlaceholder &&
    car.images[0]?.url === expectedPlaceholder
  ) {
    return 'seed-placeholder';
  }

  const containsPlaceholder = car.images.some(
    (image) =>
      image.url.startsWith('https://placehold.co/') ||
      Object.values(SEED_PLACEHOLDERS).includes(image.url),
  );

  return containsPlaceholder ? 'ambiguous-placeholder' : 'existing';
}

function printList(label: string, values: string[]) {
  if (values.length === 0) {
    return;
  }

  console.log(`\n${label}:`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function printPreflightReport(cars: CarRecord[], folders: ImageFolder[]) {
  const carsBySlug = new Map(cars.map((car) => [car.slug, car]));
  const foldersBySlug = new Map(folders.map((folder) => [folder.slug, folder]));
  const matchedFolders = folders.filter((folder) =>
    carsBySlug.has(folder.slug),
  );
  const unmatchedFolders = folders.filter(
    (folder) => !carsBySlug.has(folder.slug),
  );
  const missingCars = cars.filter((car) => !foldersBySlug.has(car.slug));
  const invalidFolders = folders.filter(
    (folder) => folder.images.length === 0 || folder.invalidFiles.length > 0,
  );
  const carsWithDatabaseImages = cars.filter((car) => car.images.length > 0);
  const candidates: ImportCandidate[] = [];
  const ambiguousCars: string[] = [];
  const structuralErrors: string[] = [];
  const normalizedFolderCounts = new Map<string, number>();

  for (const folder of folders) {
    const normalizedSlug = folder.slug.toLowerCase();
    normalizedFolderCounts.set(
      normalizedSlug,
      (normalizedFolderCounts.get(normalizedSlug) ?? 0) + 1,
    );
  }

  const duplicateFolderNames = [...normalizedFolderCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug);
  const totalImages = folders.reduce(
    (total, folder) => total + folder.images.length,
    0,
  );

  if (cars.length !== EXPECTED_CAR_COUNT) {
    structuralErrors.push(
      `Expected ${EXPECTED_CAR_COUNT} database cars, found ${cars.length}.`,
    );
  }

  if (folders.length !== EXPECTED_CAR_COUNT) {
    structuralErrors.push(
      `Expected ${EXPECTED_CAR_COUNT} image folders, found ${folders.length}.`,
    );
  }

  if (totalImages !== EXPECTED_TOTAL_IMAGE_COUNT) {
    structuralErrors.push(
      `Expected ${EXPECTED_TOTAL_IMAGE_COUNT} supported images, found ${totalImages}.`,
    );
  }

  if (duplicateFolderNames.length > 0) {
    structuralErrors.push(
      `Duplicate folder slugs: ${duplicateFolderNames.join(', ')}.`,
    );
  }

  for (const folder of folders) {
    const expectedCount = ORIGINAL_CAR_SLUGS.has(folder.slug)
      ? EXPECTED_ORIGINAL_CAR_IMAGE_COUNT
      : EXPECTED_NEW_CAR_IMAGE_COUNT;

    if (folder.images.length !== expectedCount) {
      structuralErrors.push(
        `${folder.slug} should contain ${expectedCount} supported images, found ${folder.images.length}.`,
      );
    }
  }

  console.log(
    isDryRun ? '=== CAR IMAGE IMPORT DRY RUN ===' : '=== CAR IMAGE IMPORT ===',
  );
  console.log(`Assets: ${assetsRoot}\n`);

  for (const folder of folders) {
    const car = carsBySlug.get(folder.slug);
    const suffix = car ? '' : ' (no matching car)';
    console.log(
      `[CHECK] ${folder.slug} - ${folder.images.length} images${suffix}`,
    );

    if (folder.ignoredFiles.length > 0) {
      console.log(
        `[INFO] ${folder.slug} - ignored: ${folder.ignoredFiles.join(', ')}`,
      );
    }

    if (folder.invalidFiles.length > 0) {
      console.log(
        `[ERROR] ${folder.slug} - invalid: ${folder.invalidFiles.join(', ')}`,
      );
    }

    if (folder.images.length === 0) {
      console.log(`[ERROR] ${folder.slug} - no valid image files`);
    }

    if (!car) {
      continue;
    }

    const imageState = classifyExistingImages(car);

    if (imageState === 'existing') {
      console.log(
        `[SKIP] ${car.slug} - already has ${car.images.length} images`,
      );
      continue;
    }

    if (imageState === 'ambiguous-placeholder') {
      ambiguousCars.push(car.slug);
      console.log(
        `[ERROR] ${car.slug} - placeholder images cannot be identified safely`,
      );
      continue;
    }

    if (imageState === 'seed-placeholder') {
      console.log(
        `[CHECK] ${car.slug} - exact seed placeholder will be removed after import`,
      );
    }

    if (folder.images.length > 0 && folder.invalidFiles.length === 0) {
      candidates.push({ car, folder, imageState });
    }
  }

  printList(
    'Unmatched folders',
    unmatchedFolders.map((folder) => folder.slug),
  );
  printList(
    'Cars missing an image folder',
    missingCars.map((car) => car.slug),
  );
  printList('Ambiguous placeholder records', ambiguousCars);
  printList('Structural dataset errors', structuralErrors);

  console.log('\n--- Preflight summary ---');
  console.log(`Cars in DB: ${cars.length}`);
  console.log(`Folders found: ${folders.length}`);
  console.log(`Matched folders: ${matchedFolders.length}`);
  console.log(`Unmatched folders: ${unmatchedFolders.length}`);
  console.log(`Missing car folders: ${missingCars.length}`);
  console.log(`Valid images: ${totalImages}`);
  console.log(`Cars already have images: ${carsWithDatabaseImages.length}`);
  console.log(
    `Cars with exact seed placeholders: ${cars.filter((car) => classifyExistingImages(car) === 'seed-placeholder').length}`,
  );
  console.log(`Cars that would be imported: ${candidates.length}`);
  console.log(`Invalid/empty folders: ${invalidFolders.length}`);

  return {
    candidates,
    unmatchedFolders,
    missingCars,
    invalidFolders,
    ambiguousCars,
    structuralErrors,
  };
}

function isCloudinaryUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      (parsedUrl.hostname === 'res.cloudinary.com' ||
        parsedUrl.hostname.endsWith('.cloudinary.com'))
    );
  } catch {
    return false;
  }
}

async function verifyImportedDataset(): Promise<ImportVerification> {
  const database = getPrismaClient();
  const cars = await database.car.findMany({
    orderBy: { slug: 'asc' },
    select: {
      slug: true,
      images: {
        select: { id: true, url: true, isDefault: true },
      },
    },
  });
  const images = cars.flatMap((car) => car.images);
  const urls = images.map((image) => image.url);
  const carsWithImages = cars.filter((car) => car.images.length > 0).length;
  const defaultImagesValid = cars.every(
    (car) => car.images.filter((image) => image.isDefault).length === 1,
  );
  const imageCountsValid = cars.every((car) => {
    const expectedCount = ORIGINAL_CAR_SLUGS.has(car.slug)
      ? EXPECTED_ORIGINAL_CAR_IMAGE_COUNT
      : EXPECTED_NEW_CAR_IMAGE_COUNT;
    return car.images.length === expectedCount;
  });
  const cloudinaryUrlsValid = cars.every((car) =>
    car.images.every(
      (image) =>
        isCloudinaryUrl(image.url) &&
        new URL(image.url).pathname.includes(
          `/${CLOUDINARY_ROOT}/${car.slug}/`,
        ),
    ),
  );
  const duplicateUrls = urls.length - new Set(urls).size;
  const verification: ImportVerification = {
    cars: cars.length,
    carsWithImages,
    images: images.length,
    defaultImagesValid,
    cloudinaryUrlsValid,
    imageCountsValid,
    duplicateUrls,
  };

  console.log('\n--- Post-import verification ---');
  console.log(`Cars in DB: ${verification.cars}`);
  console.log(`Cars with images: ${verification.carsWithImages}`);
  console.log(`CarImage rows: ${verification.images}`);
  console.log(
    `Expected per-car image counts: ${verification.imageCountsValid ? 'valid' : 'invalid'}`,
  );
  console.log(
    `Exactly one default per car: ${verification.defaultImagesValid ? 'valid' : 'invalid'}`,
  );
  console.log(
    `Cloudinary URL/folder ownership: ${verification.cloudinaryUrlsValid ? 'valid' : 'invalid'}`,
  );
  console.log(`Duplicate image URLs: ${verification.duplicateUrls}`);

  const valid =
    verification.cars === EXPECTED_CAR_COUNT &&
    verification.carsWithImages === EXPECTED_CAR_COUNT &&
    verification.images === EXPECTED_TOTAL_IMAGE_COUNT &&
    verification.imageCountsValid &&
    verification.defaultImagesValid &&
    verification.cloudinaryUrlsValid &&
    verification.duplicateUrls === 0;

  if (!valid) {
    throw new Error('Post-import database verification failed.');
  }

  return verification;
}

function printCloudinaryEnvironmentPresence() {
  console.log('\n--- Cloudinary configuration ---');

  for (const variable of CLOUDINARY_ENV_VARIABLES) {
    const isPresent = Boolean(process.env[variable]?.trim());
    console.log(`${variable}: ${isPresent ? 'present' : 'missing'}`);
  }

  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  let uploadPrefix = 'https://api.cloudinary.com (default)';

  if (cloudinaryUrl) {
    try {
      const configuredPrefix = new URL(cloudinaryUrl).searchParams.get(
        'upload_prefix',
      );

      if (configuredPrefix) {
        uploadPrefix = new URL(configuredPrefix).origin;
      }
    } catch {
      uploadPrefix = 'invalid CLOUDINARY_URL configuration';
    }
  }

  console.log(`Upload API endpoint: ${uploadPrefix}`);
}

function requireCloudinaryConfiguration() {
  const missingVariables = CLOUDINARY_ENV_VARIABLES.filter(
    (variable) => !process.env[variable]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing Cloudinary environment variables: ${missingVariables.join(', ')}`,
    );
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET!.trim();

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

function getCloudinaryErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('http_code' in error)) {
    return undefined;
  }

  return typeof error.http_code === 'number' ? error.http_code : undefined;
}

async function verifyCloudinaryAuthentication() {
  console.log('\n[CLOUDINARY] Verifying authentication and connectivity...');

  try {
    const response = (await cloudinary.api.ping()) as unknown;

    if (
      !response ||
      typeof response !== 'object' ||
      !('status' in response) ||
      response.status !== 'ok'
    ) {
      throw new Error('Cloudinary ping returned an unexpected response.');
    }

    console.log('[CLOUDINARY] Authentication/connectivity preflight passed.');
  } catch (error) {
    const status = getCloudinaryErrorStatus(error);
    const statusLabel = status ? ` (HTTP ${status})` : '';

    throw new Error(
      `Cloudinary authentication/connectivity preflight failed${statusLabel}. ` +
        'Check CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and ' +
        'CLOUDINARY_API_SECRET against the API Keys page for the same ' +
        'Cloudinary product environment.',
    );
  }
}

interface SafeCloudinaryError {
  status?: number;
  message: string;
  name?: string;
  code?: string | number;
  requestId?: string;
}

interface SafeUploadParameters {
  localFile: string;
  resourceType: string;
  deliveryType: string;
  folder?: string;
  assetFolder?: string;
  publicId: string;
  overwrite: boolean;
  uniqueFilename: boolean;
  useFilename: boolean;
  uploadPreset?: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'string' ? record[key] : undefined;
}

function readNumber(record: Record<string, unknown>, key: string) {
  return typeof record[key] === 'number' ? record[key] : undefined;
}

function getSafeCloudinaryError(error: unknown): SafeCloudinaryError {
  const outer = asRecord(error) ?? {};
  const source = asRecord(outer.error) ?? outer;
  const code = source.code;

  return {
    status:
      readNumber(source, 'http_code') ??
      readNumber(source, 'statusCode') ??
      readNumber(source, 'status'),
    message:
      readString(source, 'message') ?? 'Cloudinary returned an unknown error.',
    name: readString(source, 'name'),
    code:
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
    requestId:
      readString(source, 'request_id') ?? readString(source, 'requestId'),
  };
}

function printSafeUploadParameters(parameters: SafeUploadParameters) {
  console.log('[DIAGNOSTIC] Non-secret upload parameters:');
  console.log(`  local file: ${parameters.localFile}`);
  console.log(`  resource_type: ${parameters.resourceType}`);
  console.log(`  type: ${parameters.deliveryType}`);
  console.log(`  folder: ${parameters.folder ?? 'not set'}`);
  console.log(`  asset_folder: ${parameters.assetFolder ?? 'not set'}`);
  console.log(`  public_id: ${parameters.publicId}`);
  console.log(`  overwrite: ${parameters.overwrite}`);
  console.log(`  unique_filename: ${parameters.uniqueFilename}`);
  console.log(`  use_filename: ${parameters.useFilename}`);
  console.log(`  upload_preset: ${parameters.uploadPreset ?? 'not set'}`);
}

function printSafeCloudinaryError(error: unknown) {
  const details = getSafeCloudinaryError(error);

  console.error('[DIAGNOSTIC] Cloudinary Upload API failure:');
  console.error(`  HTTP status: ${details.status ?? 'not exposed'}`);
  console.error(`  message: ${details.message}`);
  console.error(`  name: ${details.name ?? 'not exposed'}`);
  console.error(`  code: ${details.code ?? 'not exposed'}`);
  console.error(`  request ID: ${details.requestId ?? 'not exposed'}`);

  if (details.name === 'UnexpectedResponse') {
    console.error(
      '  response detail: the installed SDK did not expose the 403 response body or headers',
    );
  }
}

async function runSingleUploadDiagnostic(folders: ImageFolder[]) {
  const folder = folders.find(
    (candidate) =>
      candidate.images.length > 0 && candidate.invalidFiles.length === 0,
  );
  const image = folder?.images[0];

  if (!folder || !image) {
    throw new Error(
      'No valid local image is available for the upload diagnostic.',
    );
  }

  const publicId = `upload-test-${Date.now()}`;
  const uploadOptions: UploadApiOptions = {
    folder: CLOUDINARY_DIAGNOSTIC_FOLDER,
    public_id: publicId,
    overwrite: false,
    resource_type: 'image',
    type: 'upload',
    unique_filename: false,
    use_filename: false,
  };
  const safeParameters: SafeUploadParameters = {
    localFile: image.path,
    resourceType: 'image',
    deliveryType: 'upload',
    folder: CLOUDINARY_DIAGNOSTIC_FOLDER,
    publicId,
    overwrite: false,
    uniqueFilename: false,
    useFilename: false,
  };

  console.log(`\n[TEST UPLOAD] Selected ${folder.slug}/${image.filename}`);
  printSafeUploadParameters(safeParameters);

  let uploaded: UploadApiResponse;

  try {
    uploaded = await cloudinary.uploader.upload(image.path, uploadOptions);
    console.log(`[TEST UPLOAD] Upload passed: ${uploaded.public_id}`);
  } catch (error) {
    printSafeCloudinaryError(error);
    throw new Error('Single-image Cloudinary upload diagnostic failed.');
  }

  try {
    await cloudinary.uploader.destroy(uploaded.public_id, {
      invalidate: true,
      resource_type: 'image',
      type: 'upload',
    });
    console.log(
      `[TEST UPLOAD] Temporary resource deleted: ${uploaded.public_id}`,
    );
  } catch (error) {
    printSafeCloudinaryError(error);
    throw new Error(
      `Diagnostic upload passed, but temporary cleanup failed for ${uploaded.public_id}.`,
    );
  }
}

async function cleanupUploads(publicIds: string[]) {
  if (publicIds.length === 0) {
    return;
  }

  console.log(
    `[CLEANUP] Removing ${publicIds.length} newly uploaded resources`,
  );

  for (const publicId of [...publicIds].reverse()) {
    try {
      await cloudinary.uploader.destroy(publicId, {
        invalidate: true,
        resource_type: 'image',
      });
      console.log(`[CLEANUP] Removed ${publicId}`);
    } catch (error) {
      console.error(`[CLEANUP ERROR] Could not remove ${publicId}`, error);
    }
  }
}

async function importCar(candidate: ImportCandidate) {
  const database = getPrismaClient();
  const uploadedResources: UploadApiResponse[] = [];
  const { car, folder } = candidate;

  try {
    for (const image of folder.images) {
      console.log(`[UPLOAD] ${car.slug}/${image.filename}`);
      const uploaded = await cloudinary.uploader.upload(image.path, {
        folder: `${CLOUDINARY_ROOT}/${car.slug}`,
        public_id: image.publicId,
        overwrite: false,
        resource_type: 'image',
        unique_filename: false,
        use_filename: false,
      });
      uploadedResources.push(uploaded);
    }

    await database.$transaction(async (transaction) => {
      const currentCar = await transaction.car.findUniqueOrThrow({
        where: { id: car.id },
        select: {
          id: true,
          slug: true,
          images: {
            select: { id: true, url: true, isDefault: true },
          },
        },
      });
      const currentState = classifyExistingImages(currentCar);

      if (currentState !== 'empty' && currentState !== 'seed-placeholder') {
        throw new ImportConflictError(car.slug);
      }

      await transaction.carImage.createMany({
        data: uploadedResources.map((resource, index) => ({
          carId: car.id,
          url: resource.secure_url,
          isDefault: index === 0,
        })),
      });

      if (currentState === 'seed-placeholder') {
        await transaction.carImage.delete({
          where: { id: currentCar.images[0]!.id },
        });
      }
    });

    console.log(
      `[DONE] ${car.slug} - ${uploadedResources.length} images imported`,
    );
    return uploadedResources.length;
  } catch (error) {
    console.error(`[ERROR] ${car.slug} - import failed`, error);
    await cleanupUploads(
      uploadedResources.map((resource) => resource.public_id),
    );
    throw error;
  }
}

function printRunSummary(summary: RunSummary) {
  console.log('\n--- Import summary ---');
  console.log(`Cars checked: ${summary.carsChecked}`);
  console.log(`Cars imported: ${summary.carsImported}`);
  console.log(`Cars skipped: ${summary.carsSkipped}`);
  console.log(`Cars failed: ${summary.carsFailed}`);
  console.log(`Images uploaded: ${summary.imagesUploaded}`);
  console.log(`Unmatched folders: ${summary.unmatchedFolders}`);
  console.log(`Missing folders: ${summary.missingFolders}`);
}

async function main() {
  printCloudinaryEnvironmentPresence();

  if (isDryRun && isTestUpload) {
    throw new Error('Use either --dry-run or --test-upload, not both.');
  }

  if (isTestUpload) {
    const folders = await discoverImageFolders();
    requireCloudinaryConfiguration();
    await verifyCloudinaryAuthentication();
    await runSingleUploadDiagnostic(folders);
    console.log(
      '\n[TEST UPLOAD] Diagnostic finished without database reads or writes.',
    );
    return;
  }

  const database = getPrismaClient();

  const [cars, folders] = await Promise.all([
    database.car.findMany({
      orderBy: { slug: 'asc' },
      select: {
        id: true,
        slug: true,
        images: {
          select: { id: true, url: true, isDefault: true },
        },
      },
    }),
    discoverImageFolders(),
  ]);
  const report = printPreflightReport(cars, folders);
  const unsafeConditions =
    report.unmatchedFolders.length > 0 ||
    report.missingCars.length > 0 ||
    report.invalidFolders.length > 0 ||
    report.ambiguousCars.length > 0 ||
    report.structuralErrors.length > 0;

  if (isDryRun) {
    printRunSummary({
      carsChecked: cars.length,
      carsImported: 0,
      carsSkipped: cars.length - report.candidates.length,
      carsFailed: 0,
      imagesUploaded: 0,
      unmatchedFolders: report.unmatchedFolders.length,
      missingFolders: report.missingCars.length,
    });
    console.log(
      '\n[DRY RUN] No Cloudinary uploads or database writes were performed.',
    );

    if (unsafeConditions) {
      process.exitCode = 1;
    }

    return;
  }

  if (unsafeConditions) {
    throw new Error('Preflight checks failed. No uploads were attempted.');
  }

  requireCloudinaryConfiguration();
  await verifyCloudinaryAuthentication();

  const summary: RunSummary = {
    carsChecked: cars.length,
    carsImported: 0,
    carsSkipped: cars.length - report.candidates.length,
    carsFailed: 0,
    imagesUploaded: 0,
    unmatchedFolders: report.unmatchedFolders.length,
    missingFolders: report.missingCars.length,
  };

  for (const candidate of report.candidates) {
    try {
      summary.imagesUploaded += await importCar(candidate);
      summary.carsImported += 1;
    } catch {
      summary.carsFailed += 1;
    }
  }

  printRunSummary(summary);

  if (summary.carsFailed > 0) {
    process.exitCode = 1;
    return;
  }

  await verifyImportedDataset();
}

main()
  .catch((error) => {
    console.error('[FATAL] Car image import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });
