import { Body, Controller, Get, Param, Post, Patch, Delete } from '@nestjs/common';
import { RefundService, type PendingRefundItem } from './refund.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { RequirePermission } from '../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsString, IsOptional, IsNumber, Min, IsIn, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// ── DTOs ──────────────────────────────────────────────────────────

class CreateFeeRuleDto {
  @IsString() name: string;
  @IsString() @IsIn(['flat', 'percentage']) type: string;
  @IsNumber() @Min(0) fee: number;
  @IsString() @IsIn(['flight', 'hotel', 'all']) applyTo: string;
  @IsOptional() @IsNumber() @Min(0) minFee?: number;
  @IsOptional() @IsNumber() @Min(0) maxFee?: number;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) hoursSinceBooking?: number;
}

class UpdateFeeRuleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @IsIn(['flat', 'percentage']) type?: string;
  @IsOptional() @IsNumber() @Min(0) fee?: number;
  @IsOptional() @IsString() @IsIn(['flight', 'hotel', 'all']) applyTo?: string;
  @IsOptional() @IsNumber() @Min(0) minFee?: number;
  @IsOptional() @IsNumber() @Min(0) maxFee?: number;
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) hoursSinceBooking?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Controller ────────────────────────────────────────────────────

@Controller('admin/refunds')
@UserTypes('admin')
export class AdminRefundController {
  constructor(
    private readonly refundService: RefundService,
  ) {}

  @Get('pending')
  @RequirePermission(PermissionCode.BOOKINGS_READ)
  @ResponseMessage('Pending refunds retrieved.')
  async getPendingRefunds(): Promise<{
    total: number;
    totalAmount: number;
    items: PendingRefundItem[];
  }> {
    return this.refundService.getAdminPendingRefunds();
  }

  @Post(':creditShellId/process')
  @RequirePermission(PermissionCode.BOOKINGS_REFUND)
  @ResponseMessage('Credit shell refunded to wallet.')
  async processRefund(
    @Param('creditShellId') creditShellId: string,
    @CurrentUser() user: { id: string },
  ): Promise<{ creditShellId: string; refundedAmount: number; remainingAfter: number }> {
    return this.refundService.processRefund(creditShellId, user.id);
  }

  // ── Cancellation Fee Rules CRUD ───────────────────────────

  @Get('fee-rules')
  @RequirePermission(PermissionCode.SETTINGS_READ)
  @ResponseMessage('Fee rules retrieved.')
  async getFeeRules(): Promise<any[]> {
    return this.refundService.getFeeRules();
  }

  @Post('fee-rules')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Fee rule created.')
  async createFeeRule(@Body() dto: CreateFeeRuleDto): Promise<any> {
    return this.refundService.createFeeRule(dto);
  }

  @Patch('fee-rules/:id')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Fee rule updated.')
  async updateFeeRule(@Param('id') id: string, @Body() dto: UpdateFeeRuleDto): Promise<any> {
    return this.refundService.updateFeeRule(id, dto);
  }

  @Delete('fee-rules/:id')
  @RequirePermission(PermissionCode.SETTINGS_WRITE)
  @ResponseMessage('Fee rule deleted.')
  async deleteFeeRule(@Param('id') id: string): Promise<void> {
    return this.refundService.deleteFeeRule(id);
  }
}
