import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    Req,
} from '@nestjs/common';

import { CreatePaymentIntentDto } from '../dto/create-payment-intent.dto';

import { CreatePaymentIntentUseCase } from '../../application/use-cases/create-payment-intent.use-case';
import { GetPaymentUseCase } from '../../application/use-cases/get-payment.use-case';
import { ConfirmPaymentUseCase } from '../../application/use-cases/confirm-payment.use-case';
import { ConfirmPaymentDto } from '../dto/confirm-payment.dto';
import { StripeWebhookHandler } from '../../infrastructure/stripe/stripe-webhook.handler';
import { UserTypes } from '../../../../shared/auth/user-types.decorator';
import { ResponseMessage } from '../../../../shared/response/response-message.decorator';
import { PaypalWebhookHandler } from '../../infrastructure/paypal/paypal-webhook.handler';
import { ListPaymentsUseCase } from '../../application/use-cases/list-payments.use-case';
import { CancelPaymentUseCase } from '../../application/use-cases/cancel-payment.use-case';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';

@UserTypes('public')
@Controller('payments')
export class PaymentsController {
    constructor(
        private readonly createPaymentIntent: CreatePaymentIntentUseCase,
        private readonly getPaymentUseCase: GetPaymentUseCase,
        private readonly confirmPaymentUseCase: ConfirmPaymentUseCase,
        private readonly stripeWebhookHandler:
            StripeWebhookHandler,
        private readonly paypalWebhookHandler:
            PaypalWebhookHandler,
        private readonly listPaymentsUseCase:
            ListPaymentsUseCase,
        private readonly cancelPaymentUseCase:
            CancelPaymentUseCase,
        private readonly gatewayConfigService:
            PaymentGatewayConfigService,

    ) { }

    @Get('gateways')
    @ResponseMessage('Payment gateways listed.')
    async listGateways() {
        const all = await this.gatewayConfigService.findAll();
        return Promise.all(all.map(async (g) => {
            const secretFields = g.gateway === 'stripe'
                ? ['secretKey', 'webhookSecret']
                : ['clientSecret', 'webhookId'];
            const config = { ...(g.config ?? {}) } as Record<string, any>;
            for (const field of secretFields) {
                if (config[field]) {
                    try {
                        config[field] = undefined;
                    } catch { /* ignore */ }
                }
            }
            return { gateway: g.gateway, enabled: g.enabled, config };
        }));
    }

    @Post('intent')
    @ResponseMessage('Payment intent created.')
    async createIntent(
        @Body() dto: CreatePaymentIntentDto,
    ) {
        return this.createPaymentIntent.execute(
            dto,
        );
    }

    @Get(':paymentId')
    @ResponseMessage('Payment retrieved.')
    async getPayment(
        @Param('paymentId')
        paymentId: string,
    ) {
        return this.getPaymentUseCase.execute(
            paymentId,
        );
    }

    @Post('confirm')
    @ResponseMessage('Payment confirmed.')
    async confirm(
        @Body()
        dto: ConfirmPaymentDto,
    ) {
        return this.confirmPaymentUseCase.execute(
            dto.paymentId,
        );
    }

    @Post('webhook/stripe')
    @ResponseMessage('Stripe webhook received.')
    async stripeWebhook(
        @Req() req: any,
        @Headers('stripe-signature')
        signature: string,
    ) {
        const payload =
            req['rawBody'];

        await this.stripeWebhookHandler.handle(
            payload,
            signature,
        );

        return {
            received: true,
        };
    }

    @Post('webhook/paypal')
    @ResponseMessage('PayPal webhook received.')
    async paypalWebhook(
        @Req() req: any,
    ) {
        await this.paypalWebhookHandler.handle(
            req.body,
            req.headers,
        );

        return {
            received: true,
        };
    }

    @Get('config/:gateway')
    @ResponseMessage('Gateway configuration retrieved.')
    async getGatewayConfig(
        @Param('gateway')
        gateway: string,
    ) {
        const g = gateway.toLowerCase() as 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later';
        if (g !== 'stripe' && g !== 'paypal' && g !== 'bank_transfer' && g !== 'pay_later') {
            throw new BadRequestException('Unsupported gateway');
        }

        const pub = await this.gatewayConfigService.getGatewayPublicConfig(g);
        if (!pub) {
            return { enabled: false, minAmount: 1, maxAmount: 100000 };
        }

        // Manual-method details (bank account etc.) are only public while enabled.
        if (!pub.enabled && (g === 'bank_transfer' || g === 'pay_later')) {
            return { enabled: false, minAmount: 1, maxAmount: 100000 };
        }

        return {
            enabled: pub.enabled,
            ...pub.config,
            minAmount: 1,
            maxAmount: 100000,
        };
    }

    @Get()
    @ResponseMessage('Payments listed.')
    async listPayments(
        @Query('bookingId')
        bookingId?: string,

        @Query('status')
        status?: string,

        @Query('gateway')
        gateway?: string,

        @Query('from')
        from?: string,

        @Query('to')
        to?: string,
    ) {
        return this.listPaymentsUseCase.execute({
            bookingId,
            status,
            gateway,
            from: from
                ? new Date(from)
                : undefined,
            to: to
                ? new Date(to)
                : undefined,
        });
    }

    @Post(':id/cancel')
    @ResponseMessage('Payment cancelled.')
    @HttpCode(HttpStatus.OK)
    async cancelPayment(
        @Param('id')
        id: string,
    ) {
        return this.cancelPaymentUseCase.execute(
            id,
        );
    }

}