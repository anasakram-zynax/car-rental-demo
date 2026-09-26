import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { CustomerWalletService } from './customer-wallet.service';
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

@Controller('admin/customers')
@UserTypes('admin')
export class AdminCustomerWalletController {
  constructor(private readonly customerWalletService: CustomerWalletService) {}

  @Get(':userId/wallet')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Customer wallet retrieved.')
  async getWallet(@Param('userId') userId: string) {
    const view = await this.customerWalletService.getAdminWalletView(userId);
    return { wallet: view?.balance ?? null };
  }

  @Get(':userId/wallet/transactions')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Customer wallet transactions retrieved.')
  async getWalletTransactions(@Param('userId') userId: string, @Query() query: TransactionQueryDto) {
    const transactions = await this.customerWalletService.getTransactionHistory(userId, query);
    return { userId, transactions };
  }

  @Post(':userId/wallet/adjust')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('Wallet balance adjusted.')
  async adjustBalance(@Param('userId') userId: string, @Body() dto: AdjustBalanceDto, @Req() req: any) {
    return this.customerWalletService.adminAdjustBalance(userId, dto.amount, dto.reason, req.user?.id, dto.currency);
  }

  @Get('topup-requests/list')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Top-up requests retrieved.')
  async listTopupRequests(@Query('status') status?: string) {
    const clean = ['pending', 'completed', 'rejected'].includes(status ?? '') ? status : undefined;
    return this.customerWalletService.listAllTopupRequests(clean);
  }

  @Post('topup-requests/:id/approve')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('Top-up approved — wallet credited.')
  async approveTopup(@Param('id') id: string, @Req() req: any) {
    return this.customerWalletService.approveTopup(id, req.user?.id);
  }

  @Post('topup-requests/:id/reject')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('Top-up rejected.')
  async rejectTopup(@Param('id') id: string, @Body() dto: { reason?: string }, @Req() req: any) {
    return this.customerWalletService.rejectTopup(id, dto?.reason, req.user?.id);
  }

  @Get('withdrawals/list')
  @RequirePermission(PermissionCode.USERS_READ)
  @ResponseMessage('Withdrawal requests retrieved.')
  async listWithdrawals(@Query('status') status?: string) {
    const clean = ['pending', 'completed', 'rejected', 'cancelled'].includes(status ?? '') ? status : undefined;
    return this.customerWalletService.listAllWithdrawals(clean);
  }

  @Post('withdrawals/:id/approve')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('Withdrawal approved — pay off-platform.')
  async approveWithdrawal(@Param('id') id: string, @Body() dto: { paymentReference?: string }, @Req() req: any) {
    return this.customerWalletService.approveWithdrawal(id, dto?.paymentReference, req.user?.id);
  }

  @Post('withdrawals/:id/reject')
  @RequirePermission(PermissionCode.USERS_WRITE)
  @ResponseMessage('Withdrawal rejected — funds returned.')
  async rejectWithdrawal(@Param('id') id: string, @Body() dto: { reason?: string }, @Req() req: any) {
    return this.customerWalletService.rejectWithdrawal(id, dto?.reason, req.user?.id);
  }
}
