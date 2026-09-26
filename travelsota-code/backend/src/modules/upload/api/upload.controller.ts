/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-base-to-string, @typescript-eslint/no-require-imports */
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { uploadFileToCloudinary } from '../cloudinary-upload.util';

@UserTypes('admin')
@Controller('admin/upload')
export class UploadController {
  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(tmpdir(), 'travelsota-uploads'),
        filename: (_req, file, cb) =>
          cb(
            null,
            `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
          ),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (
          !file.mimetype.match(
            /^image\/(jpeg|png|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)$/,
          )
        ) {
          cb(
            new BadRequestException(
              'Only JPEG, PNG, WebP, GIF, SVG, and ICO images are allowed.',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ResponseMessage('Image uploaded.')
  async uploadImage(@UploadedFile() file?: { path: string }) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const url = await uploadFileToCloudinary(file.path, 'travelsota');
    return { url };
  }
}
