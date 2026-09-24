import { InvalidCarDataError } from './car-errors.js';

export const MAX_CAR_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_CAR_IMAGE_FILES = 10;
export type CarImageFormat = 'jpeg' | 'png' | 'webp';

export function detectCarImageFormat(file: {
  size: number;
  buffer: Uint8Array;
}): CarImageFormat {
  if (!file.size || file.size > MAX_CAR_IMAGE_BYTES || file.buffer.length !== file.size) {
    throw new InvalidCarDataError('Each image must be nonempty and at most 5 MB.');
  }
  const bytes = file.buffer;
  const startsWith = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte)
  ) return 'webp';

  throw new InvalidCarDataError(
    'Unsupported image format. Please upload a JPEG, PNG, or WebP image.',
  );
}
