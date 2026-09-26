import { Body, Controller, Get, Param, Post, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { tmpdir } from 'os';
import { uploadFileToCloudinary } from '../upload/cloudinary-upload.util';
import { CustomerWalletService } from './customer-wallet.service';
import { UserTypes } from '../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../shared/response/response-message.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BusinessError } from '../../shared/errors/business-error';
import { IsString, IsOptional, IsNumber, Min, Max, IsIn, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { CreatePaymentIntentUseCase } from '../payment/application/use-cases/create-payment-intent.use-case';
import { BookingType } from '../payment/domain/enums/booking-type.enum';
import { PaymentGateway } from '../payment/domain/enums/payment-gateway.enum';
import { AuthGuard } from '@nestjs/passport';
import { CurrencyService } from '../currency/application/services/currency.service';

class TransactionQueryDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @IsIn(['deposit', 'deduct', 'topup_request']) type?: string;
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

@Controller('customer/wallet')
@UseGuards(AuthGuard('jwt'))
@UserTypes('customer')
export class CustomerWalletController {
  constructor(
    private readonly customerWalletService: CustomerWalletService,
    private readonly createPaymentIntentUseCase: CreatePaymentIntentUseCase,
    private readonly currencyService: CurrencyService,
  ) {}

  @Get()
  @ResponseMessage('Wallet balance retrieved.')
  async getBalance(@CurrentUser() user: { id: string }) {
    return this.customerWalletService.getBalance(user.id);
  }

  @Get('transactions')
  @ResponseMessage('Transaction history retrieved.')
  async getTransactions(@CurrentUser() user: { id: string }, @Query() query: TransactionQueryDto) {
    return this.customerWalletService.getTransactionHistory(user.id, query);
  }

  @Post('withdrawals')
  @ResponseMessage('Withdrawal requested — funds locked pending admin approval.')
  async requestWithdrawal(@CurrentUser() user: { id: string }, @Body() dto: WithdrawalRequestDto): Promise<any> {
    return this.customerWalletService.requestWalletWithdrawal(user.id, dto.amount, dto.methodName, dto.details ?? '');
  }

  @Get('withdrawals')
  @ResponseMessage('Withdrawal requests retrieved.')
  async listWithdrawals(@CurrentUser() user: { id: string }): Promise<any> {
    return this.customerWalletService.listMyWithdrawals(user.id);
  }

  @Post('withdrawals/:id/cancel')
  @ResponseMessage('Withdrawal cancelled — locked funds returned.')
  async cancelWithdrawal(@CurrentUser() user: { id: string }, @Param('id') id: string): Promise<any> {
    return this.customerWalletService.cancelWithdrawal(id, user.id);
  }

  @Post('top-up')
  @ResponseMessage('Top-up initiated — payment required.')
  async topUp(@CurrentUser() user: { id: string }, @Body() dto: TopUpDto): Promise<any> {
    const gateway = (dto.gateway?.toLowerCase() === 'paypal' ? PaymentGateway.PAYPAL : PaymentGateway.STRIPE) as PaymentGateway;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // ponytail: single bookingId var — intent + return + webhook parse must match
    const topupBookingId = `ctopup_${user.id}_${Date.now()}`;
    const paymentIntent = await this.createPaymentIntentUseCase.execute({
      bookingId: topupBookingId,
      bookingType: BookingType.WALLET_TOPUP,
      gateway,
      amount: dto.amount,
      currency: 'USD',
      successUrl: `${baseUrl}/wallet?topup=success`,
      cancelUrl: `${baseUrl}/wallet?topup=cancelled`,
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

  @Post('topup-requests')
  @ResponseMessage('Top-up request submitted — pending admin approval.')
  async requestTopup(@CurrentUser() user: { id: string }, @Body() dto: TopupRequestDto): Promise<any> {
    return this.customerWalletService.requestTopup(user.id, dto.amount, dto.method, dto.reference, dto.currency, dto.evidenceUrl);
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
    return this.customerWalletService.listMyTopupRequests(user.id);
  }
}
