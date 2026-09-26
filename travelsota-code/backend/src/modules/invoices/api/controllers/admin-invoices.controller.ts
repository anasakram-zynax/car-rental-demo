import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { InvoiceService } from '../../application/services/invoice.service';
import { ListInvoicesDto } from '../dto/list-invoices.dto';
import { CreateCreditNoteDto } from '../dto/create-credit-note.dto';
import { VoidInvoiceDto } from '../dto/void-invoice.dto';
import type {
  GeneratedInvoiceDocument,
  InvoiceListItem,
  InvoiceStats,
  PaginatedInvoiceList,
} from '../../domain/invoice-document.types';

@Controller('admin/invoices')
@UserTypes('admin')
export class AdminInvoicesController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.INVOICES_MANAGE)
  @ResponseMessage('Invoices deleted.')
  async bulkDelete(@Body() body: { ids: string[] }): Promise<{ deleted: number }> {
    const ids = (body?.ids ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0);
    return { deleted: await this.invoiceService.deleteByIds(ids) };
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.INVOICES_MANAGE)
  @ResponseMessage('Invoice deleted.')
  async delete(@Param('id') id: string): Promise<{ deleted: number }> {
    return { deleted: await this.invoiceService.deleteByIds([id]) };
  }

  @Get()
  @RequirePermission(PermissionCode.INVOICES_READ)
  @ResponseMessage('Invoices retrieved.')
  list(@Query() query: ListInvoicesDto): Promise<PaginatedInvoiceList> {
    return this.invoiceService.listForAdmin(query);
  }

  @Get('stats')
  @RequirePermission(PermissionCode.INVOICES_READ)
  @ResponseMessage('Invoice stats retrieved.')
  stats(): Promise<InvoiceStats> {
    return this.invoiceService.getStats();
  }

  @Get('export')
  @RequirePermission(PermissionCode.INVOICES_EXPORT)
  async export(@Query() query: ListInvoicesDto, @Res() res: Response): Promise<void> {
    const csv = await this.invoiceService.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="invoices-export.csv"');
    res.send(csv);
  }

  @Post('credit-note')
  @RequirePermission(PermissionCode.CREDIT_NOTES_CREATE)
  @ResponseMessage('Credit note created.')
  async createCreditNote(@Body() dto: CreateCreditNoteDto): Promise<GeneratedInvoiceDocument> {
    return this.invoiceService.generateCreditNote(dto.bookingId, dto.originalInvoiceId, {
      reason: dto.reason,
      refundAmount: dto.refundAmount,
    });
  }

  @Get(':id')
  @RequirePermission(PermissionCode.INVOICES_READ)
  @ResponseMessage('Invoice retrieved.')
  async get(@Param('id') id: string): Promise<GeneratedInvoiceDocument> {
    const invoice = await this.invoiceService.getById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  @Get(':id/preview')
  @RequirePermission(PermissionCode.INVOICES_READ)
  async preview(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoiceService.getById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(invoice.content);
  }

  @Get(':id/pdf')
  @RequirePermission(PermissionCode.INVOICES_READ)
  async pdf(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const invoice = await this.invoiceService.getById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');

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

  @Get(':id/credit-notes')
  @RequirePermission(PermissionCode.INVOICES_READ)
  @ResponseMessage('Credit notes retrieved.')
  async getCreditNotes(@Param('id') id: string): Promise<InvoiceListItem[]> {
    return this.invoiceService.getCreditNotesForInvoice(id);
  }

  @Post(':id/regenerate')
  @RequirePermission(PermissionCode.INVOICES_MANAGE)
  @ResponseMessage('Invoice regenerated.')
  async regenerate(@Param('id') id: string): Promise<GeneratedInvoiceDocument> {
    return this.invoiceService.regenerate(id);
  }

  @Post(':id/void')
  @RequirePermission(PermissionCode.INVOICES_MANAGE)
  @ResponseMessage('Invoice voided.')
  async voidInvoice(
    @Param('id') id: string,
    @Body() dto: VoidInvoiceDto,
  ): Promise<{ success: boolean }> {
    await this.invoiceService.voidInvoice(id, dto.reason);
    return { success: true };
  }

  @Post(':id/email')
  @RequirePermission(PermissionCode.INVOICES_MANAGE)
  @ResponseMessage('Invoice queued for email.')
  async email(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.invoiceService.sendEmail(id);
    return { success: true };
  }
}
