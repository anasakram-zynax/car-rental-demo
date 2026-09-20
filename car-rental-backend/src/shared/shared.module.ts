import { Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';

@Module({
  providers: [PrismaService]
})
export class SharedModule {}
