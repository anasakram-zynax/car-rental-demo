import { Injectable, InternalServerErrorException } from '@nestjs/common';
import Stripe = require('stripe');

import {
  CreatePaymentResult,
  PaymentGatewayInterface,
} from '../../domain/interfaces/payment-gateway.interface';

import { PaymentEntity } from '../../domain/entities/payment.entity';
import { PaymentResult } from '../../domain/interfaces/payment-result.interface';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';

@Injectable()
export class StripeGateway
  implements PaymentGatewayInterface {

  constructor(
    private readonly gatewayConfigService: PaymentGatewayConfigService,
    private readonly currencyService: CurrencyService,
  ) {}

  private async getStripe(): Promise<InstanceType<typeof Stripe>> {
    const config = await this.gatewayConfigService.getGatewayRuntimeConfig('stripe');
    if (!config.secretKey) {
      throw new InternalServerErrorException('Stripe secret key is not configured');
    }
    return new Stripe(config.secretKey);
  }

  private async getWebhookSecret(): Promise<string> {
    const config = await this.gatewayConfigService.getGatewayRuntimeConfig('stripe');
    if (!config.webhookSecret) {
      throw new InternalServerErrorException('Stripe webhook secret is not configured');
    }
    return config.webhookSecret;
  }

  async createPayment(
    payment: PaymentEntity,
  ): Promise<CreatePaymentResult> {
    const stripe = await this.getStripe();
    const isManualCapture =
      payment.captureMethod === 'manual';
    const chargeAmount = await this.currencyService.toSmallestUnit(
      payment.amount,
      payment.currency,
    );
    const intent =
      await stripe.paymentIntents.create(
        {
          amount: chargeAmount,
          currency:
            payment.currency.toLowerCase(),
          metadata: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            bookingType:
              payment.bookingType,
          },
          capture_method: isManualCapture ? 'manual' : 'automatic',
          automatic_payment_methods: {
            enabled: true,
          },
        },
        {
          idempotencyKey:
            payment.idempotencyKey,
        },
      );

    return {
      providerPaymentId: intent.id,
      clientSecret:
        intent.client_secret ?? undefined,
    };
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<any> {
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Stripe getPayment: providerPaymentId is required');
    }
    const stripe = await this.getStripe();
    return stripe.paymentIntents.retrieve(
      providerPaymentId,
    );
  }

  async confirmPayment(
    providerPaymentId: string,
  ): Promise<PaymentResult> {
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Stripe confirmPayment: providerPaymentId is required');
    }
    const stripe = await this.getStripe();
    const paymentIntent =
      await stripe.paymentIntents.retrieve(
        providerPaymentId,
      );

    const status =
      paymentIntent.status === 'succeeded'
        ? 'PAID'
        : paymentIntent.status === 'requires_capture'
          ? 'AUTHORIZED'
          : paymentIntent.status === 'canceled'
            ? 'FAILED'
            : 'PENDING';

    return { status, providerStatus: paymentIntent.status, raw: paymentIntent };
  }

  async cancelPayment(
    providerPaymentId: string,
  ): Promise<void> {
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Stripe cancelPayment: providerPaymentId is required');
    }
    const stripe = await this.getStripe();
    await stripe.paymentIntents.cancel(
      providerPaymentId,
    );
  }

  async capturePayment(
    providerPaymentId: string,
  ): Promise<any> {
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Stripe capturePayment: providerPaymentId is required');
    }
    const stripe = await this.getStripe();
    return stripe.paymentIntents.capture(
      providerPaymentId,
    );
  }

  async refundPayment(
    providerPaymentId: string,
    amount?: number,
    currency?: string,
  ): Promise<void> {
    if (!providerPaymentId) {
      throw new InternalServerErrorException('Stripe refundPayment: providerPaymentId is required');
    }
    const stripe = await this.getStripe();
    const refundAmount = amount !== undefined
      ? await this.currencyService.toSmallestUnit(amount, currency ?? 'USD')
      : undefined;
    await stripe.refunds.create({
      payment_intent: providerPaymentId,
      ...(refundAmount !== undefined ? { amount: refundAmount } : {}),
    });
  }

  async constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): Promise<any> {
    const webhookSecret = await this.getWebhookSecret();
    const stripe = await this.getStripe();
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );
  }
}