import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { MarkupService } from './markup.service';
import { AdminMarkupController } from './admin-markup.controller';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, CurrencyModule],
  controllers: [AdminMarkupController],
  providers: [MarkupService],
  exports: [MarkupService],
})
export class MarkupModule {}
