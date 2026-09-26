import { Module } from '@nestjs/common';
import { UploadController } from './api/upload.controller';

@Module({
  controllers: [UploadController],
})
export class UploadModule {}
