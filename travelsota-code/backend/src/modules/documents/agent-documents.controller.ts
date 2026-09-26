import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { VoucherService } from './voucher.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../../shared/database/prisma.service';
import { InvoiceService } from '../invoices/application/services/invoice.service';

@Controller('agent/bookings')
@UserTypes('agent')
export class AgentDocumentsController {
  constructor(
    private readonly voucherService: VoucherService,
    private readonly invoiceService: InvoiceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':id/voucher')
  @ResponseMessage('Voucher retrieved.')
  async downloadVoucher(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    // Verify ownership
    const owned = await this.isBookingOwnedByAgent(id, user.id);
    if (!owned) throw new NotFoundException('Booking not found');

    let doc = await this.voucherService.getDocument(id, 'voucher');

    // Auto-generate if not yet generated
    if (!doc) {
      doc = await this.voucherService.generateVoucher(id);
    }

    if (!doc?.pdfBuffer) {
      // Fallback: return HTML content
      res.setHeader('Content-Type', 'text/html');
      res.send(doc?.content ?? '<html><body><p>Document not available</p></body></html>');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.send(doc.pdfBuffer);
  }

  @Get(':id/invoice')
  @ResponseMessage('Invoice retrieved.')
  async downloadInvoice(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const owned = await this.isBookingOwnedByAgent(id, user.id);
    if (!owned) throw new NotFoundException('Booking not found');

    let doc = await this.invoiceService.getByBooking(id, 'invoice');

    if (!doc) {
      doc = await this.invoiceService.generateForBooking(id);
    }

    if (!doc?.pdfBuffer) {
      res.setHeader('Content-Type', 'text/html');
      res.send(doc?.content ?? '<html><body><p>Document not available</p></body></html>');
      return;
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.send(doc.pdfBuffer);
  }

  private async isBookingOwnedByAgent(bookingId: string, userId: string): Promise<boolean> {
    const [flight, hotel] = await Promise.all([
      this.prisma.flightBooking.findUnique({ where: { id: bookingId }, select: { userId: true } }),
      this.prisma.hotelBooking.findUnique({ where: { id: bookingId }, select: { userId: true } }),
    ]);
    return flight?.userId === userId || hotel?.userId === userId;
  }
}
