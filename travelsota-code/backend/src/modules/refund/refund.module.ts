import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { WalletModule } from '../wallet/wallet.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { HotelsModule } from '../hotels/hotels.module';
import { RefundService } from './refund.service';
import { AgentRefundController } from './agent-refund.controller';
import { AdminRefundController } from './admin-refund.controller';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, AccessControlModule, WalletModule, InvoicesModule, HotelsModule, CurrencyModule],
  controllers: [AgentRefundController, AdminRefundController],
  providers: [RefundService],
  exports: [RefundService],
})
export class RefundModule {}
