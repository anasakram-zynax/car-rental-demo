import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  config: vi.fn(),
  uploadStream: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('cloudinary', () => ({
  v2: {
    config: mocks.config,
    uploader: { upload_stream: mocks.uploadStream, destroy: mocks.destroy },
  },
}));

import { CloudinaryImageStorage } from './cloudinary-image.storage.js';

describe('CloudinaryImageStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
    process.env.CLOUDINARY_API_KEY = 'test-key';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
  });

  it('maps secure_url/public_id and uses the managed slug folder', async () => {
    mocks.uploadStream.mockImplementation((options, callback) => ({
      on: vi.fn().mockReturnThis(),
      end: vi.fn(() => callback(null, {
        secure_url: 'https://res.cloudinary.com/test/image/upload/car.jpg',
        public_id: 'car-rental/cars/test-car/generated',
      })),
    }));
    const storage = new CloudinaryImageStorage();
    const result = await storage.upload(
      {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        size: 3,
        mimetype: 'image/png',
        originalname: 'anything.png',
        detectedFormat: 'jpeg',
      },
      'test-car',
    );

    expect(result).toEqual({
      url: 'https://res.cloudinary.com/test/image/upload/car.jpg',
      publicId: 'car-rental/cars/test-car/generated',
    });
    expect(mocks.uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: 'car-rental/cars/test-car',
        resource_type: 'image',
        type: 'upload',
        overwrite: false,
        format: 'jpeg',
      }),
      expect.any(Function),
    );
    expect(mocks.config).toHaveBeenCalledWith({
      cloud_name: 'test-cloud', api_key: 'test-key', api_secret: 'test-secret', secure: true,
    });
  });

  it('only deletes assets inside the managed car folder', async () => {
    mocks.destroy.mockResolvedValue({ result: 'ok' });
    const storage = new CloudinaryImageStorage();
    await storage.delete('car-rental/cars/test-car/generated');
    await expect(storage.delete('unmanaged/image')).rejects.toThrow('outside the managed');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});
