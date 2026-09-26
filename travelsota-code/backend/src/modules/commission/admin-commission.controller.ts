import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import {
  CommissionService,
  type PaginatedCommissions,
  type PendingPayouts,
  type CommissionRuleEntity,
} from './commission.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { RequirePermission } from '../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { IsString, IsOptional, IsIn, IsNumber, Min, Max, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────

class AdminCommissionQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() bookingType?: string;
  @IsOptional() @IsString() agentProfileId?: string;
  @IsOptional() @IsString() fromDate?: string;
  @IsOptional() @IsString() toDate?: string;
}

class PayoutDto {
  @IsArray() @IsString({ each: true }) commissionIds: string[];
  @IsOptional() @IsString() payoutId?: string;
}

class CreateRuleDto {
  @IsString() name: string;
  @IsString() @IsIn(['flat', 'percentage']) type: string;
  @IsNumber() @Min(0) rate: number;
  @IsString() @IsIn(['flight', 'hotel', 'package', 'all']) applyTo: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() agentTierId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
}

class UpdateRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @IsIn(['flat', 'percentage']) type?: string;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsString() @IsIn(['flight', 'hotel', 'package', 'all']) applyTo?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() agentTierId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() @Type(() => Boolean) @IsBoolean() isActive?: boolean;
}

// ── Controller ────────────────────────────────────────────────────

@Controller('admin/commissions')
@UserTypes('admin')
export class AdminCommissionController {
  constructor(private readonly commissionService: CommissionService) {}

  @Get()
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Commission records retrieved.')
  async findAll(@Query() query: AdminCommissionQueryDto): Promise<PaginatedCommissions> {
    return this.commissionService.findAll(query);
  }

  @Get('pending-payouts')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Pending payouts retrieved.')
  async getPendingPayouts(): Promise<PendingPayouts> {
    return this.commissionService.getPendingPayouts();
  }

  @Post('payout')
  @RequirePermission(PermissionCode.AGENTS_WRITE)
  @ResponseMessage('Commissions marked as paid.')
  async markAsPaid(@Body() dto: PayoutDto): Promise<{ count: number }> {
    const count = await this.commissionService.markAsPaid(dto.commissionIds, dto.payoutId);
    return { count };
  }

  // ── Off-platform withdrawal requests ──────────────────────

  @Get('withdrawals')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Commission withdrawal requests retrieved.')
  async listWithdrawals(@Query('status') status?: string) {
    const clean = ['pending', 'completed', 'rejected'].includes(status ?? '') ? status : undefined;
    return this.commissionService.listAllCommissionWithdrawals(clean);
  }

  @Post('withdrawals/:id/approve')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Commission withdrawal approved — pay off-platform.')
  async approveWithdrawal(
    @Param('id') id: string,
    @Body() dto: { paymentReference?: string },
    @Req() req: any,
  ) {
    return this.commissionService.payOutOffPlatformWithdrawal(id, dto?.paymentReference, req.user?.id);
  }

  @Post('withdrawals/:id/reject')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Commission withdrawal rejected.')
  async rejectWithdrawal(
    @Param('id') id: string,
    @Body() dto: { reason?: string },
    @Req() req: any,
  ) {
    return this.commissionService.rejectCommissionWithdrawal(id, dto?.reason, req.user?.id);
  }

  // ── Commission Rules CRUD ────────────────────────────────

  @Get('rules')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Commission rules retrieved.')
  async findRules(): Promise<CommissionRuleEntity[]> {
    return this.commissionService.findRules();
  }

  @Post('rules')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Commission rule created.')
  async createRule(@Body() dto: CreateRuleDto): Promise<CommissionRuleEntity> {
    return this.commissionService.createRule(dto);
  }

  @Put('rules/:id')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Commission rule updated.')
  async updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
  ): Promise<CommissionRuleEntity> {
    return this.commissionService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Commission rule deleted.')
  async deleteRule(@Param('id') id: string): Promise<{ success: boolean }> {
    await this.commissionService.deleteRule(id);
    return { success: true };
  }
}
