import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import type { CarImageStoragePort, StoredImage, ValidatedImageFile } from '../application/ports/car-image.port.js';
import { InvalidCarDataError } from '../domain/car-errors.js';

@Injectable()
export class CloudinaryImageStorage implements CarImageStoragePort {
  private configure() {
    const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const api_key = process.env.CLOUDINARY_API_KEY?.trim();
    const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
    if (!cloud_name || !api_key || !api_secret) {
      throw new InvalidCarDataError('Cloudinary image storage is not configured. Check the three CLOUDINARY environment variables.');
    }
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }

  upload(file: ValidatedImageFile, slug: string): Promise<StoredImage> {
    // A slug is a single folder segment, never a caller-provided Cloudinary path.
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      throw new InvalidCarDataError('Use a URL-friendly car slug before uploading images.');
    }
    this.configure();
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: 'image', type: 'upload',
        folder: `car-rental/cars/${slug}`,
        public_id: randomUUID(), overwrite: false,
        format: file.detectedFormat,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        timeout: 60000,
      }, (error, result) => {
        if (error || !result) return reject(new InvalidCarDataError('Cloudinary image upload failed. Check configuration and connectivity.'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      });
      stream.on('error', () => reject(new InvalidCarDataError('Cloudinary upload connection failed.')));
      stream.end(file.buffer);
    });
  }

  async delete(publicId: string): Promise<void> {
    if (!publicId.startsWith('car-rental/cars/')) {
      throw new InvalidCarDataError('Image asset is outside the managed car image folder.');
    }
    try {
      this.configure();
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image', type: 'upload', invalidate: true,
      }) as { result: string };
      if (result.result !== 'ok' && result.result !== 'not found') throw new Error('Deletion failed');
    } catch {
      throw new InvalidCarDataError('Cloudinary image deletion failed. The image database row was retained; please retry.');
    }
  }
}
