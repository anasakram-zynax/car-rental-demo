import { describe, expect, it } from 'vitest';
import { detectCarImageFormat, MAX_CAR_IMAGE_BYTES } from './car-image-policy.js';

const file = (
  bytes: number[],
  originalname: string,
  mimetype: string,
) => ({
  buffer: Buffer.from(bytes),
  size: bytes.length,
  originalname,
  mimetype,
});

const jpeg = [0xff, 0xd8, 0xff, 0xe0, 0x00];
const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00];
const webp = [
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
];

describe('detectCarImageFormat', () => {
  it('accepts an arbitrary filename with JPEG bytes and declaration', () => {
    expect(detectCarImageFormat(file(jpeg, 'my-car-photo.jpg', 'image/jpeg'))).toBe('jpeg');
  });

  it('detects PNG content', () => {
    expect(detectCarImageFormat(file(png, 'holiday-image.png', 'image/png'))).toBe('png');
  });

  it('detects WebP content', () => {
    expect(detectCarImageFormat(file(webp, 'vehicle.webp', 'image/webp'))).toBe('webp');
  });

  it('accepts a .jpg filename containing valid WebP bytes as WebP', () => {
    expect(detectCarImageFormat(file(webp, 'vehicle.jpg', 'image/jpeg'))).toBe('webp');
  });

  it('accepts a .png filename containing JPEG bytes as JPEG', () => {
    expect(detectCarImageFormat(file(jpeg, 'vehicle.png', 'image/png'))).toBe('jpeg');
  });

  it('rejects a fake .jpg containing non-image bytes', () => {
    expect(() => detectCarImageFormat(file([0x6e, 0x6f, 0x70, 0x65], 'fake.jpg', 'image/jpeg')))
      .toThrow('Unsupported image format. Please upload a JPEG, PNG, or WebP image.');
  });

  it('rejects AVIF content while AVIF is unsupported', () => {
    const avif = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66];
    expect(() => detectCarImageFormat(file(avif, 'vehicle.avif', 'image/avif')))
      .toThrow('Unsupported image format');
  });

  it('keeps the five MiB size limit', () => {
    const buffer = Buffer.alloc(MAX_CAR_IMAGE_BYTES + 1);
    buffer.set(jpeg);
    expect(() => detectCarImageFormat({ buffer, size: buffer.length }))
      .toThrow('at most 5 MB');
  });
});
