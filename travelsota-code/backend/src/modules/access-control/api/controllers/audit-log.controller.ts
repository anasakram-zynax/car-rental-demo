import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { IsArray, IsString } from 'class-validator';
import { AuditLogService } from '../../application/services/audit-log.service';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../decorators/require-permission.decorator';
import { PermissionCode } from '../../domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';

class BulkDeleteAuditLogsDto {
  @IsArray() @IsString({ each: true }) ids!: string[];
}

@Controller('admin/audit-logs')
@UserTypes('admin')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequirePermission(PermissionCode.AUDIT_READ)
  @ResponseMessage('Audit logs listed.')
  async findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogService.findAll(query);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionCode.AUDIT_READ)
  @ResponseMessage('Audit logs deleted.')
  async bulkDelete(@Body() dto: BulkDeleteAuditLogsDto): Promise<{ deleted: number }> {
    return { deleted: await this.auditLogService.deleteMany(dto.ids) };
  }

  @Delete(':id')
  @RequirePermission(PermissionCode.AUDIT_READ)
  @ResponseMessage('Audit log deleted.')
  async delete(@Param('id') id: string): Promise<{ deleted: number }> {
    return { deleted: await this.auditLogService.deleteMany([id]) };
  }
}
