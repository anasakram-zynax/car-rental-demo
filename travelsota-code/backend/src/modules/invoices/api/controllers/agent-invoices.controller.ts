import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { InvoiceService } from '../../application/services/invoice.service';
import { ListInvoicesDto } from '../dto/list-invoices.dto';
import type { GeneratedInvoiceDocument, PaginatedInvoiceList } from '../../domain/invoice-document.types';

@Controller('agent/invoices')
@UserTypes('agent')
export class AgentInvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Get()
  @ResponseMessage('Agent invoices retrieved.')
  list(
    @CurrentUser() user: { id: string },
    @Query() query: ListInvoicesDto,
  ): Promise<PaginatedInvoiceList> {
    return this.invoiceService.listForUser(user.id, query);
  }

  @Get(':id')
  @ResponseMessage('Agent invoice retrieved.')
  async get(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ): Promise<GeneratedInvoiceDocument> {
    const invoice = await this.invoiceService.getByIdForUser(id, user.id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Get(':id/preview')
  async preview(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoiceService.getByIdForUser(id, user.id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.invoiceService.markViewed(invoice.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(invoice.content);
  }

  @Get(':id/pdf')
  async pdf(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoiceService.getByIdForUser(id, user.id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    await this.invoiceService.markViewed(invoice.id);
    if (invoice.pdfBuffer) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName}"`);
      res.send(invoice.pdfBuffer);
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.fileName?.replace(/\.pdf$/i, '.html') ?? 'invoice.html'}"`);
      res.send(invoice.content);
    }
  }
}
