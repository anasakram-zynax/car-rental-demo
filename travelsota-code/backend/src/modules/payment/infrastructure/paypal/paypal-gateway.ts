import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as paypal from '@paypal/checkout-server-sdk';

import {
  CreatePaymentResult,
  PaymentGatewayInterface,
} from '../../domain/interfaces/payment-gateway.interface';

import { PaymentEntity } from '../../domain/entities/payment.entity';
import { PaymentResult } from '../../domain/interfaces/payment-result.interface';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { CurrencyService } from '../../../currency/application/services/currency.service';

interface PayPalClient {
  client: paypal.core.PayPalHttpClient;
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret: string;
}

@Injectable()
export class PaypalGateway
  implements PaymentGatewayInterface {

  constructor(
    private readonly gatewayConfigService: PaymentGatewayConfigService,
    private readonly currencyService: CurrencyService,
  ) {}

  private async getClient(): Promise<PayPalClient> {
    const config = await this.gatewayConfigService.getGatewayRuntimeConfig('paypal');
    if (!config.clientId || !config.clientSecret) {
      throw new InternalServerErrorException('PayPal credentials are not configured');
    }
    const env = config.environment === 'production'
      ? new paypal.core.LiveEnvironment(config.clientId, config.clientSecret)
      : new paypal.core.SandboxEnvironment(config.clientId, config.clientSecret);

    return {
      client: new paypal.core.PayPalHttpClient(env),
      environment: config.environment ?? 'sandbox',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    };
  }

  async createPayment(
    payment: PaymentEntity,
  ): Promise<CreatePaymentResult> {
    const { client } = await this.getClient();
    const request =
      new paypal.orders.OrdersCreateRequest();

    request.prefer(
      'return=representation',
    );

    const formattedAmount = await this.currencyService.formatAmount(payment.amount, payment.currency);

    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: payment.id,
          amount: {
            currency_code:
              payment.currency,
            value: formattedAmount,
          },
        },
      ],
    });

    const response =
      await client.execute(
        request,
      );

    const approveLink =
      response.result.links?.find(
        (l: any) =>
          l.rel === 'approve',
      );

    return {
      providerPaymentId:
        response.result.id,
      checkoutUrl:
        approveLink?.href,
    };
  }

  async getPayment(
    providerPaymentId: string,
  ): Promise<any> {
    const { client } = await this.getClient();
    const request =
      new paypal.orders.OrdersGetRequest(
        providerPaymentId,
      );

    const response =
      await client.execute(
        request,
      );

    return response.result;
  }

  async capturePayment(
    providerPaymentId: string,
  ): Promise<any> {
    const { client } = await this.getClient();
    const request =
      new paypal.orders.OrdersCaptureRequest(
        providerPaymentId,
      );

    request.requestBody({});

    const response =
      await client.execute(
        request,
      );

    return response.result;
  }

  async refundPayment(
    providerPaymentId: string,
    amount?: number,
    currency?: string,
  ): Promise<void> {
    // PayPal refunds work on captures, not orders.
    // Get the order first to find the capture ID, then refund the capture.
    const order = await this.getPayment(providerPaymentId);
    const purchaseUnit = order?.purchase_units?.[0];
    const capture =
      purchaseUnit?.payments?.captures?.[0];

    if (!capture?.id) {
      // Fall back to voiding the order if no capture exists yet
      return this.cancelPayment(providerPaymentId);
    }

    // Use PayPal SDK for the refund request instead of raw fetch
    const { client } = await this.getClient();
    const refundRequest = new paypal.payments.CapturesRefundRequest(capture.id);

    const refundBody: Record<string, unknown> = {};
    if (amount !== undefined) {
      const refundCurrency = currency ?? purchaseUnit?.amount?.currency_code ?? 'USD';
      refundBody.amount = {
        currency_code: refundCurrency,
        value: await this.currencyService.formatAmount(amount, refundCurrency),
      };
    }

    refundRequest.requestBody(refundBody);

    const response = await client.execute(refundRequest);

    if (response.statusCode >= 400) {
      throw new Error(
        `PayPal refund capture failed: ${response.statusCode} ${JSON.stringify(response.result)}`,
      );
    }
  }

  async cancelPayment(
    providerPaymentId: string,
  ): Promise<void> {
    // Use PayPal SDK's OrdersVoidRequest instead of raw fetch
    const { client } = await this.getClient();
    const voidRequest = new paypal.orders.OrdersVoidRequest(providerPaymentId);

    const response = await client.execute(voidRequest);

    if (response.statusCode >= 400) {
      throw new Error(
        `PayPal void order failed: ${response.statusCode} ${JSON.stringify(response.result)}`,
      );
    }
  }

  async confirmPayment(
  providerPaymentId: string,
): Promise<PaymentResult> {

  const order =
    await this.getPayment(
      providerPaymentId,
    );

  if (order.status === 'COMPLETED') {
    return {
      status: 'PAID',
      providerStatus: order.status,
      raw: order,
    };
  }

  if (
    order.status === 'VOIDED'
  ) {
    return {
      status: 'FAILED',
      providerStatus: order.status,
      raw: order,
    };
  }

  // Delegate to capturePayment to avoid dead code and keep capture logic centralized
  const captureResult = await this.capturePayment(providerPaymentId);

  return {
    status:
      captureResult.status ===
      'COMPLETED'
        ? 'PAID'
        : captureResult.status ===
          'VOIDED'
        ? 'FAILED'
        : 'PENDING',

    providerStatus:
      captureResult.status,

    raw: captureResult,
  };
}

  async constructWebhookEvent(
    payload: any,
    headers: Record<string, string>,
  ): Promise<any> {
    const config = await this.gatewayConfigService.getGatewayRuntimeConfig('paypal');
    const webhookId = config.webhookId;
    if (!webhookId) {
      throw new InternalServerErrorException('PayPal webhook ID is not configured');
    }

    const { client, environment } = await this.getClient();

    const accessTokenRequest =
      new paypal.core.AccessTokenRequest(
        environment === 'production'
          ? new paypal.core.LiveEnvironment(config.clientId, config.clientSecret)
          : new paypal.core.SandboxEnvironment(config.clientId, config.clientSecret),
      );

    const tokenResponse =
      await client.execute(
        accessTokenRequest,
      );

    const accessToken =
      tokenResponse.result.access_token;

    const baseUrl =
      environment === 'production'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';

    const verifyResponse =
      await fetch(
        `${baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            auth_algo:
              headers[
                'paypal-auth-algo'
              ],
            cert_url:
              headers[
                'paypal-cert-url'
              ],
            transmission_id:
              headers[
                'paypal-transmission-id'
              ],
            transmission_sig:
              headers[
                'paypal-transmission-sig'
              ],
            transmission_time:
              headers[
                'paypal-transmission-time'
              ],
            webhook_id: webhookId,
            webhook_event: payload,
          }),
        },
      );

    const result =
      (await verifyResponse.json()) as {
        verification_status: string;
      };

    if (
      result.verification_status !==
      'SUCCESS'
    ) {
      throw new Error(
        'PayPal webhook signature verification failed',
      );
    }

    return payload;
  }
}