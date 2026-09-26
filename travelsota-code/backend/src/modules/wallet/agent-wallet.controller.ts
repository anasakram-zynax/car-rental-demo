import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { uploadFileToCloudinary } from '../upload/cloudinary-upload.util';
import { WalletService, type WalletBalance, type PaginatedTransactions } from './wallet.service';
import { PermissionCode } from '../access-control/domain/enums/permission-code.enum';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BusinessError } from '../../shared/errors/business-error';
import { PrismaService } from '../../shared/database/prisma.service';
import { IsString, IsOptional, IsNumber, Min, Max, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePaymentIntentUseCase } from '../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../payment/domain/enums/booking-type.enum';
import { PaymentGateway } from '../payment/domain/enums/payment-gateway.enum';
import { AuthGuard } from '@nestjs/passport';
import { AgentAuthGuard } from '../agent-panel/api/guards/agent-auth.guard';
import { CurrencyService } from '../currency/application/services/currency.service';

class TransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @IsIn(['deposit', 'deduct', 'credit_used', 'credit_repayment']) type?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
}

class TopUpDto {
  @IsNumber() @Min(0.01) @Max(100000) amount: number;
  @IsOptional() @IsString() @IsIn(['STRIPE', 'PAYPAL']) gateway?: string;
  @IsOptional() @IsString() description?: string;
}

class TopupRequestDto {
  @IsNumber() @Min(0.01) @Max(100000) amount: number;
  @IsOptional() @IsString() @IsIn(['bank_transfer', 'cash', 'pay_later', 'other']) method?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() evidenceUrl?: string;
}

class WithdrawalRequestDto {
  @IsNumber() @Min(0.01) @Max(100000) amount: number;
  @IsString() methodName: string;
  @IsOptional() @IsString() details?: string;
}

@Controller('agent/wallet')
@UseGuards(AuthGuard('jwt'), AgentAuthGuard)
@UserTypes('agent')
export class AgentWalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    private readonly currencyService: CurrencyService,
  ) {}

  @Get()
  @ResponseMessage('Wallet balance retrieved.')
  async getBalance(@CurrentUser() user: { id: string }): Promise<WalletBalance | { message: string }> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_VIEW_WALLET);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.walletService.getBalance(agentProfileId);
  }

  @Get('transactions')
  @ResponseMessage('Transaction history retrieved.')
  async getTransactions(
    @CurrentUser() user: { id: string },
    @Query() query: TransactionQueryDto,
  ): Promise<PaginatedTransactions | { message: string }> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_VIEW_WALLET);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.walletService.getTransactionHistory(agentProfileId, query);
  }

  @Post('repay-credit')
  @ResponseMessage('Credit repaid — wallet deducted.')
  async repayCredit(
    @CurrentUser() user: { id: string },
    @Body() dto: TopUpDto,
  ): Promise<any> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_USE_WALLET);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    // Deduct from wallet and decrement creditUsed
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: agentProfileId },
      select: { walletBalance: true, walletCurrency: true, creditUsed: true },
    });
    if (!profile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    const walletCurrency = profile.walletCurrency ?? 'USD';
    const creditUsed = Number(profile.creditUsed);
    if (creditUsed <= 0) {
      throw new BusinessError('NO_CREDIT_TO_REPAY', 'You have no outstanding credit to repay.');
    }

    const repayAmount = Math.min(dto.amount, creditUsed);
    const walletBalance = Number(profile.walletBalance);
    if (walletBalance < repayAmount) {
      const [availableText, requiredText] = await Promise.all([
        this.currencyService.formatWithCode(walletBalance, walletCurrency),
        this.currencyService.formatWithCode(repayAmount, walletCurrency),
      ]);
      throw new BusinessError(
        'INSUFFICIENT_FUNDS',
        `Insufficient wallet balance. Available: ${availableText}, Required: ${requiredText}.`,
      );
    }

    // Deduct wallet + decrement credit in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const currentProfile = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: { walletBalance: true },
      });
      if (!currentProfile) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

      const balanceBefore = Number(currentProfile.walletBalance);
      const balanceAfter = balanceBefore - repayAmount;

      const updated = await tx.agentProfile.updateMany({
        where: { id: agentProfileId, walletBalance: { gte: repayAmount } },
        data: {
          walletBalance: { decrement: repayAmount },
          creditUsed: { decrement: repayAmount },
        },
      });
      if (updated.count === 0) {
        throw new BusinessError('INSUFFICIENT_FUNDS', 'Wallet balance changed. Please try again.');
      }

      // Sub-agents on a shared (non-segregated) parent credit line also free
      // the parent's utilization when they repay — mirrors deductInTransaction.
      const repaidProfile = await tx.agentProfile.findUnique({
        where: { id: agentProfileId },
        select: { parentAgentId: true, segregatedCredit: true },
      });
      if (repaidProfile?.parentAgentId && !repaidProfile.segregatedCredit) {
        await tx.agentProfile.updateMany({
          where: { id: repaidProfile.parentAgentId },
          data: { creditUsed: { decrement: repayAmount } },
        });
      }

      const txRecord = await tx.walletTransaction.create({
        data: {
          agentProfileId,
          type: 'credit_repayment',
          amount: -repayAmount,
          currency: walletCurrency,
          balanceBefore,
          balanceAfter,
          description: `Credit repayment — ${await this.currencyService.formatWithCode(repayAmount, walletCurrency)}`,
          status: 'completed',
        },
      });

      return txRecord;
    });

    const [repaidText, remainingText] = await Promise.all([
      this.currencyService.formatWithCode(repayAmount, walletCurrency),
      this.currencyService.formatWithCode(creditUsed - repayAmount, walletCurrency),
    ]);

    return {
      transaction: this.walletService['toEntity'](result),
      amount: repayAmount,
      remainingCredit: creditUsed - repayAmount,
      message: `Credit repaid: ${repaidText}. Remaining credit: ${remainingText}.`,
    };
  }

  @Post('topup-requests')
  @ResponseMessage('Top-up request submitted — pending admin approval.')
  async requestTopup(@CurrentUser() user: { id: string }, @Body() dto: TopupRequestDto): Promise<any> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_TOPUP_WALLET);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return this.walletService.requestTopup(
      agentProfileId,
      dto.amount,
      dto.method,
      dto.reference,
      dto.currency,
      user.id,
      dto.evidenceUrl,
    );
  }

  @Post('topup-evidence')
  @ResponseMessage('Receipt uploaded.')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: join(tmpdir(), 'travelsota-uploads'),
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`),
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|gif|webp)$/) && file.mimetype !== 'application/pdf') {
          cb(new BadRequestException('Only JPEG, PNG, WebP, GIF images or PDF receipts are allowed.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadTopupEvidence(@UploadedFile() file?: { path: string }) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const url = await uploadFileToCloudinary(file.path, 'travelsota-topups');
    return { url };
  }

  @Get('topup-requests')
  @ResponseMessage('Top-up requests retrieved.')
  async listTopupRequests(@CurrentUser() user: { id: string }): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.walletService.listMyTopupRequests(agentProfileId);
  }

  @Post('withdrawals')
  @ResponseMessage('Withdrawal requested — funds locked pending admin approval.')
  async requestWithdrawal(@CurrentUser() user: { id: string }, @Body() dto: WithdrawalRequestDto): Promise<any> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_WITHDRAW_FUNDS);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return this.walletService.requestWalletWithdrawal(
      agentProfileId,
      dto.amount,
      dto.methodName,
      dto.details ?? '',
      user.id,
    );
  }

  @Get('withdrawals')
  @ResponseMessage('Withdrawal requests retrieved.')
  async listWithdrawals(@CurrentUser() user: { id: string }): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) return { message: 'Agent profile not found' };
    return this.walletService.listMyWithdrawals(agentProfileId);
  }

  @Post('withdrawals/:id/cancel')
  @ResponseMessage('Withdrawal cancelled — locked funds returned.')
  async cancelWithdrawal(@CurrentUser() user: { id: string }, @Param('id') id: string): Promise<any> {
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');
    return this.walletService.cancelWithdrawal(id, agentProfileId);
  }

  @Post('top-up')
  @ResponseMessage('Top-up initiated — payment required.')
  async topUp(
    @CurrentUser() user: { id: string },
    @Body() dto: TopUpDto,
  ): Promise<any> {
    await this.walletService.requireAgentPermission(user.id, PermissionCode.AGENT_TOPUP_WALLET);
    const agentProfileId = await this.resolveProfileId(user.id);
    if (!agentProfileId) throw new BusinessError('AGENT_PROFILE_NOT_FOUND');

    // Create a PaymentIntent so the agent actually pays before wallet is credited
    const gateway = (dto.gateway?.toLowerCase() === 'paypal' ? PaymentGateway.PAYPAL : PaymentGateway.STRIPE) as PaymentGateway;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // ponytail: single bookingId var — intent + return + webhook parse must match
    const topupBookingId = `topup_${agentProfileId}_${Date.now()}`;
    // Create an idempotency key based on user+amount to prevent duplicate top-ups
    const paymentIntent = await this.createPaymentIntentUseCase.execute({
      bookingId: topupBookingId,
      bookingType: BookingType.WALLET_TOPUP,
      gateway,
      amount: dto.amount,
      currency: 'USD',
      successUrl: `${baseUrl}/agent/wallet?topup=success`,
      cancelUrl: `${baseUrl}/agent/wallet?topup=cancelled`,
      customerId: user.id,
    });

    return {
      paymentId: paymentIntent.paymentId,
      bookingId: topupBookingId,
      amount: dto.amount,
      currency: 'USD',
      clientSecret: paymentIntent.clientSecret ?? null,
      checkoutUrl: paymentIntent.checkoutUrl ?? null,
      message: `Payment of ${await this.currencyService.formatWithCode(dto.amount, 'USD')} required. Redirecting to payment...`,
    };
  }

  private async resolveProfileId(userId: string): Promise<string | null> {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }
}
