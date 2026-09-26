export type PaymentGateway =
  | 'stripe'
  | 'paypal'
  | 'bank_transfer'
  | 'pay_later';

/** Manual (non-gateway) methods: hold now, verify/collect later. */
export interface ManualGatewayConfig {
  manual: true;
}

export interface StripeGatewayConfig {
  environment: 'test' | 'production';
  publishableKey: string;
  secretKey?: string;
  webhookSecret?: string;
  requestTimeoutMs?: number;
}

export interface PayPalGatewayConfig {
  environment: 'sandbox' | 'production';
  clientId: string;
  clientSecret?: string;
  webhookId?: string;
}

export interface PaymentGatewayConfigRecord<TConfig = unknown> {
  gateway: PaymentGateway;
  enabled: boolean;
  config: TConfig;
  updatedAt: string;
}
