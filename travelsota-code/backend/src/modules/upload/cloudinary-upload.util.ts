/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports */
import { unlink } from 'fs';

/**
 * Shared Cloudinary upload (temp-file in, public URL out).
 * ponytail: single impl reused by admin image upload + booking receipts.
 */
export async function uploadFileToCloudinary(
  filePath: string,
  folder: string,
): Promise<string> {
  const cloudinary = require('cloudinary');
  cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  try {
    const result = await new Promise<{ secure_url: string }>(
      (resolve, reject) => {
        cloudinary.v2.uploader.upload(
          filePath,
          { folder },
          (error: unknown, res: { secure_url: string }) => {
            if (error)
              reject(error instanceof Error ? error : new Error(String(error)));
            else resolve(res);
          },
        );
      },
    );
    return result.secure_url;
  } finally {
    unlink(filePath, () => {});
  }
}
