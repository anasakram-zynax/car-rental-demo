import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { PromoCodeAdminService } from '../application/services/promo-code-admin.service';
import { CreatePromoCodeDto, UpdatePromoCodeDto } from './dto';
import { PromoCodeStatus } from '../domain/enums';

@Controller('admin/promo-codes')
@UserTypes('admin')
export class AdminPromoCodesController {
  constructor(private readonly adminService: PromoCodeAdminService) {}

  @Get()
  @RequirePermission(PermissionCode.PROMO_CODES_READ)
  @ResponseMessage('Promo codes listed.')
  async findAll(
    @Query('status') status?: string,
    @Query('code') code?: string,
    @Query('productType') productType?: string,
    @Query('customerType') customerType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.list({
      status: status as PromoCodeStatus | undefined,
      code,
      productType,
      customerType,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('stats/summary')
  @RequirePermission(PermissionCode.PROMO_CODES_READ)
  @ResponseMessage('Promo stats retrieved.')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get(':id')
  @RequirePermission(PermissionCode.PROMO_CODES_READ)
  @ResponseMessage('Promo code retrieved.')
  async findOne(@Param('id') id: string) {
    return this.adminService.getById(id);
  }

  @Post()
  @RequirePermission(PermissionCode.PROMO_CODES_CREATE)
  @ResponseMessage('Promo code created.')
  async create(
    @Body() dto: CreatePromoCodeDto,
    @Req() req: any,
  ) {
    return this.adminService.create({
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      createdById: req.user?.id,
    });
  }

  @Patch(':id')
  @RequirePermission(PermissionCode.PROMO_CODES_UPDATE)
  @ResponseMessage('Promo code updated.')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromoCodeDto,
    @Req() req: any,
  ) {
    return this.adminService.update(id, {
      ...dto,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      updatedById: req.user?.id,
    });
  }

  @Patch(':id/status')
  @RequirePermission(PermissionCode.PROMO_CODES_UPDATE)
  @ResponseMessage('Promo code status updated.')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: PromoCodeStatus,
    @Req() req: any,
  ) {
    return this.adminService.updateStatus(id, status, req.user?.id);
  }

  @Post(':id/archive')
  @RequirePermission(PermissionCode.PROMO_CODES_DELETE)
  @ResponseMessage('Promo code archived.')
  async archive(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.adminService.archive(id, req.user?.id);
  }

  @Get(':id/redemptions')
  @RequirePermission(PermissionCode.PROMO_CODES_READ)
  @ResponseMessage('Promo redemptions listed.')
  async getRedemptions(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getRedemptions(
      id,
      page ? parseInt(page, 10) : undefined,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get(':id/audit')
  @RequirePermission(PermissionCode.PROMO_CODES_READ)
  @ResponseMessage('Promo audit logs listed.')
  async getAuditLogs(@Param('id') id: string) {
    return this.adminService.getAuditLogs(id);
  }
}
