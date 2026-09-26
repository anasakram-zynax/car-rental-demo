import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { InvoiceNumberService } from './application/services/invoice-number.service';
import { InvoiceService } from './application/services/invoice.service';
import { AdminInvoicesController } from './api/controllers/admin-invoices.controller';
import { AgentInvoicesController } from './api/controllers/agent-invoices.controller';
import { CustomerInvoicesController } from './api/controllers/customer-invoices.controller';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, OutboxModule, CurrencyModule],
  controllers: [AdminInvoicesController, AgentInvoicesController, CustomerInvoicesController],
  providers: [InvoiceNumberService, InvoiceService],
  exports: [InvoiceNumberService, InvoiceService],
})
export class InvoicesModule {}
