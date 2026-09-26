import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsIn, IsString } from 'class-validator';
import { type Response } from 'express';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PrismaDemoLeadsRepository } from '../infrastructure/prisma-demo-leads.repository';
import { DemoResetService } from '../application/demo-reset.service';
import { RealAdminGuard } from './real-admin.guard';

class BulkDeleteLeadsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

const LEAD_STATUSES = ['VERIFIED', 'PENDING', 'UNREACHABLE'] as const;

class BulkUpdateStatusDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
  @IsIn(LEAD_STATUSES) emailStatus!: string;
}

class UpdateStatusDto {
  @IsIn(LEAD_STATUSES) emailStatus!: string;
}

@UserTypes('admin')
@UseGuards(RealAdminGuard)
@Controller('admin/demo-leads')
export class AdminDemoLeadsController {
  constructor(
    private readonly repo: PrismaDemoLeadsRepository,
    private readonly resetService: DemoResetService,
  ) {}

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo leads deleted.')
  async bulkDelete(
    @Body() dto: BulkDeleteLeadsDto,
  ): Promise<{ deleted: number }> {
    return { deleted: await this.repo.deleteMany(dto.ids) };
  }

  @Post('bulk-status')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo lead statuses updated.')
  async bulkUpdateStatus(
    @Body() dto: BulkUpdateStatusDto,
  ): Promise<{ updated: number }> {
    return {
      updated: await this.repo.updateManyStatus(dto.ids, dto.emailStatus),
    };
  }

  @Patch(':id/status')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo lead status updated.')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ): Promise<{ updated: number }> {
    return { updated: await this.repo.updateManyStatus([id], dto.emailStatus) };
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo lead deleted.')
  async delete(@Param('id') id: string): Promise<{ deleted: number }> {
    return { deleted: await this.repo.deleteMany([id]) };
  }

  @Get()
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo leads retrieved.')
  async listLeads(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('emailStatus') emailStatus?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
  ) {
    return this.repo.findLeads({
      page: Math.max(1, parseInt(page ?? '1', 10) || 1),
      pageSize: Math.min(200, Math.max(1, parseInt(limit ?? '20', 10) || 20)),
      search: search || undefined,
      emailStatus: emailStatus || undefined,
      sortBy: sortBy || 'createdAt',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
    });
  }

  @Get('export')
  @RequirePermission(PermissionCode.EMAILS_READ)
  async exportCsv(
    @Query('search') search?: string,
    @Query('emailStatus') emailStatus?: string,
    @Res() res?: Response,
  ) {
    const leads = await this.repo.findAllLeadsForExport({
      search: search || undefined,
      emailStatus: emailStatus || undefined,
    });

    const headers = [
      'Name',
      'Company',
      'Email',
      'WhatsApp',
      'Status',
      'Requested At',
    ];
    const rows = leads.map((l) => [
      l.name ?? '',
      l.companyName ?? '',
      l.email,
      l.whatsappNumber ?? '',
      l.emailStatus,
      l.submittedAt?.toISOString() ?? l.createdAt.toISOString(),
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');

    res?.setHeader('Content-Type', 'text/csv');
    res?.setHeader(
      'Content-Disposition',
      'attachment; filename="demo-leads.csv"',
    );
    res?.send(csv);
  }

  @Post('reset')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo reset executed.')
  async triggerReset() {
    await this.resetService.executeReset();
    return this.resetService.getStatus();
  }

  @Get('reset/status')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Demo reset status.')
  resetStatus() {
    return this.resetService.getStatus();
  }
}
