import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaModule } from '../../shared/database/prisma.module';
import { VoucherService } from './voucher.service';
import { AgentDocumentsController } from './agent-documents.controller';
import { AdminDocumentsController } from './admin-documents.controller';
import { EventDispatcherService } from '../../shared/outbox/application/event-dispatcher.service';
import { InvoicesModule } from '../invoices/invoices.module';
import { InvoiceService } from '../invoices/application/services/invoice.service';
import { CurrencyModule } from '../currency/currency.module';

@Module({
  imports: [PrismaModule, InvoicesModule, CurrencyModule],
  controllers: [AgentDocumentsController, AdminDocumentsController],
  providers: [VoucherService],
  exports: [VoucherService],
})
export class DocumentsModule implements OnModuleInit {
  private readonly logger = new Logger(DocumentsModule.name);

  constructor(
    private readonly voucherService: VoucherService,
    private readonly invoiceService: InvoiceService,
    private readonly dispatcher: EventDispatcherService,
  ) {}

  onModuleInit(): void {
    this.dispatcher.register('DOCUMENT_GEN', async (event) => {
      const { bookingId } = event.payload as any;
      this.logger.log(`Processing DOCUMENT_GEN for booking ${bookingId}`);
      await this.voucherService.generateVoucher(bookingId);
      await this.invoiceService.generateForBooking(bookingId);
    });

    // Handle supplier-confirmed bookings for customers (agent bookings are
    // handled via DOCUMENT_GEN from AgentBookingService). Idempotency
    // in generateForBooking prevents duplicate generation.
    // Voucher and invoice generation are independent — a voucher failure
    // must not block invoice creation (the invoice is the critical document).
    this.dispatcher.register('booking.supplier_confirmed', async (event) => {
      const { bookingId } = event.payload as any;
      this.logger.log(`Processing booking.supplier_confirmed for booking ${bookingId}`);
      try {
        await this.voucherService.generateVoucher(bookingId);
      } catch (err) {
        this.logger.error(
          `Voucher generation failed for ${bookingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
      try {
        await this.invoiceService.generateForBooking(bookingId);
      } catch (err) {
        this.logger.error(
          `Invoice generation failed for ${bookingId}: ${err instanceof Error ? err.message : err}`,
        );
        throw err;
      }
    });

    // Held bookings (toggle-OFF paid holds, bank-transfer / pay-later manual
    // holds) never reach supplier_confirmed — generate their voucher +
    // invoice here so the success page never shows "Generating…" forever.
    // Idempotency in generateForBooking prevents duplicates when the booking
    // later tickets (which fires supplier_confirmed too).
    this.dispatcher.register('booking.awaiting_issue', async (event) => {
      const { bookingId } = event.payload as any;
      if (!bookingId) return;
      this.logger.log(`Processing booking.awaiting_issue for booking ${bookingId}`);
      try {
        await this.voucherService.generateVoucher(bookingId);
      } catch (err) {
        this.logger.error(
          `Voucher generation failed for ${bookingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
      try {
        await this.invoiceService.generateForBooking(bookingId);
      } catch (err) {
        this.logger.error(
          `Invoice generation failed for ${bookingId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    });

    this.logger.log('DocumentsModule initialized — DOCUMENT_GEN handler registered');
  }
}
