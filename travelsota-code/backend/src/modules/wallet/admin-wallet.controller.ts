import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { WalletService, type WalletBalance, type PaginatedTransactions, type TransactionFilters } from './wallet.service';
import { CreditService } from './credit.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { RequirePermission } from '../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { IsString, IsOptional, IsNumber, Min, Max, IsNotEmpty, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

class TransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
}

class AdjustBalanceDto {
  @IsNumber() amount: number;
  @IsString() @IsNotEmpty() reason: string;
  @IsOptional() @IsString() currency?: string;
}

class SetCreditLimitDto {
  @IsNumber() @Min(0) limit: number;
}

@Controller('admin/agents')
@UserTypes('admin')
export class AdminWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly creditService: CreditService,
  ) {}

  @Get(':userId/wallet')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agent wallet retrieved.')
  async getWallet(@Param('userId') userId: string): Promise<{ wallet: WalletBalance | null }> {
    const view = await this.walletService.getAdminWalletView(userId);
    return { wallet: view?.balance ?? null };
  }

  @Get(':userId/credit-utilization')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Credit utilization retrieved.')
  async getCreditUtilization(@Param('userId') userId: string) {
    return this.creditService.getCreditUtilization(userId);
  }

  @Post(':userId/credit-limit')
  @RequirePermission(PermissionCode.AGENTS_SET_CREDIT)
  @ResponseMessage('Credit limit updated.')
  async setCreditLimit(
    @Param('userId') userId: string,
    @Body() dto: SetCreditLimitDto,
    @Req() req: any,
  ) {
    const ip = req.ip;
    const ua = req.headers['user-agent'];
    return this.creditService.setCreditLimit(userId, dto.limit, req.user?.id, ip, ua);
  }

  @Get(':userId/wallet/transactions')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Agent wallet transactions retrieved.')
  async getWalletTransactions(
    @Param('userId') userId: string,
    @Query() query: TransactionQueryDto,
  ): Promise<{ agentProfileId: string | null; transactions: PaginatedTransactions | null }> {
    const result = await this.walletService.getAdminTransactionHistory(userId, query);
    return {
      agentProfileId: result?.agentProfileId ?? null,
      transactions: result?.transactions ?? null,
    };
  }

  @Post(':userId/wallet/adjust')
  @RequirePermission(PermissionCode.AGENTS_WRITE)
  @ResponseMessage('Wallet balance adjusted.')
  async adjustBalance(
    @Param('userId') userId: string,
    @Body() dto: AdjustBalanceDto,
    @Req() req: any,
  ) {
    return this.walletService.adminAdjustBalance(userId, dto.amount, dto.reason, req.user?.id, dto.currency);
  }

  @Post(':userId/auto-suspend-check')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Auto-suspend check completed.')
  async autoSuspendCheck(@Param('userId') userId: string) {
    return this.creditService.autoSuspendCheck(userId);
  }

  @Get('topup-requests/list')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Top-up requests retrieved.')
  async listTopupRequests(@Query('status') status?: string) {
    const clean = ['pending', 'completed', 'rejected'].includes(status ?? '') ? status : undefined;
    return this.walletService.listAllTopupRequests(clean);
  }

  @Post('topup-requests/:id/approve')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Top-up approved — wallet credited.')
  async approveTopup(@Param('id') id: string, @Req() req: any) {
    return this.walletService.approveTopup(id, req.user?.id);
  }

  @Post('topup-requests/:id/reject')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Top-up rejected.')
  async rejectTopup(@Param('id') id: string, @Body() dto: { reason?: string }, @Req() req: any) {
    return this.walletService.rejectTopup(id, dto?.reason, req.user?.id);
  }

  @Get('withdrawals/list')
  @RequirePermission(PermissionCode.AGENTS_READ)
  @ResponseMessage('Withdrawal requests retrieved.')
  async listWithdrawals(@Query('status') status?: string) {
    const clean = ['pending', 'completed', 'rejected', 'cancelled'].includes(status ?? '') ? status : undefined;
    return this.walletService.listAllWithdrawals(clean);
  }

  @Post('withdrawals/:id/approve')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Withdrawal approved — pay off-platform.')
  async approveWithdrawal(@Param('id') id: string, @Body() dto: { paymentReference?: string }, @Req() req: any) {
    return this.walletService.approveWithdrawal(id, dto?.paymentReference, req.user?.id);
  }

  @Post('withdrawals/:id/reject')
  @RequirePermission(PermissionCode.AGENTS_APPROVE)
  @ResponseMessage('Withdrawal rejected — funds returned.')
  async rejectWithdrawal(@Param('id') id: string, @Body() dto: { reason?: string }, @Req() req: any) {
    return this.walletService.rejectWithdrawal(id, dto?.reason, req.user?.id);
  }
}
