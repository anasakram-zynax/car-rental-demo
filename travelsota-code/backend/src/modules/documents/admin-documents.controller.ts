import { Controller, Get, Param } from '@nestjs/common';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { RequirePermission } from '../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { InvoiceService } from '../invoices/application/services/invoice.service';

@Controller('admin/agents')
@UserTypes('admin')
export class AdminDocumentsController {
  constructor(
    private readonly invoiceService: InvoiceService,
  ) {}

  @Get(':userId/invoices')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agent invoices retrieved.')
  async getAgentInvoices(
    @Param('userId') userId: string,
  ): Promise<{
    items: Array<{
      id: string;
      bookingId: string;
      bookingType: string;
      fileName: string;
      status: string;
      createdAt: string;
      invoiceNumber: string | null;
      creditNoteNumber: string | null;
      amount: string | null;
      currency: string | null;
    }>;
  }> {
    const items = await this.invoiceService.getAgentInvoices(userId);
    return { items };
  }
}
