import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PaymentGatewayConfigStorePort } from '../ports/payment-gateway-config-store.port';
import type { SecretsCryptoPort } from '../ports/secrets-crypto.port';
import type {
  PaymentGateway,
  PaymentGatewayConfigRecord,
  StripeGatewayConfig,
  PayPalGatewayConfig,
} from '../../domain/payment-gateway-config.entity';
import { HttpClientService } from '../../../../shared/http/http-client.service';
import { SECRETS_CRYPTO } from './provider-config.service';
import { OutboxWriterService } from '../../../../shared/outbox/application/outbox-writer.service';
import { NotificationService } from '../../../notifications/application/notification.service';

export const PAYMENT_GATEWAY_CONFIG_STORE = Symbol('PAYMENT_GATEWAY_CONFIG_STORE');

@Injectable()
export class PaymentGatewayConfigService {
  private readonly stripeApiBase = 'https://api.stripe.com/v1';
  private readonly paypalUrls = {
    sandbox: 'https://api-m.sandbox.paypal.com',
    production: 'https://api-m.paypal.com',
  } as const;

  constructor(
    @Inject(PAYMENT_GATEWAY_CONFIG_STORE)
    private readonly store: PaymentGatewayConfigStorePort,
    @Inject(SECRETS_CRYPTO)
    private readonly crypto: SecretsCryptoPort,
    private readonly httpClient: HttpClientService,
    private readonly outboxWriter: OutboxWriterService,
    private readonly notifications: NotificationService,
  ) {}

  async findAll(): Promise<PaymentGatewayConfigRecord[]> {
    return this.store.findAll();
  }

  async getGatewaysSummary() {
    const all = await this.store.findAll();
    return all.map((g) => ({
      gateway: g.gateway,
      enabled: g.enabled,
      updatedAt: g.updatedAt,
    }));
  }

  async getGateway(gateway: PaymentGateway) {
    const row = await this.findGatewayOrThrow(gateway);
    return this.maskSecrets(row);
  }

  async setGatewayEnabled(gateway: PaymentGateway, enabled: boolean) {
    const row = await this.findGatewayOrThrow(gateway);
    return this.store.upsert({
      ...row,
      enabled,
      updatedAt: new Date().toISOString(),
    });
  }

  async setGatewayCredentials(gateway: PaymentGateway, config: any) {
    const row = await this.findGatewayOrThrow(gateway);
    const currentRaw = (row.config ?? {}) as Record<string, any>;

    const current: Record<string, any> = { ...currentRaw };
    const secretFields = this.getSecretFields(gateway);
    for (const field of secretFields) {
      if (current[field]) {
        current[field] = this.crypto.decrypt(current[field]);
      }
    }

    const merged: Record<string, any> = { ...current, ...config };
    for (const field of [...secretFields]) {
      if (config[field] === undefined || config[field] === '') {
        merged[field] = current[field];
      } else {
        merged[field] = config[field];
      }
    }

    const encrypted: Record<string, any> = { ...merged };
    for (const field of secretFields) {
      if (encrypted[field]) {
        encrypted[field] = this.crypto.encrypt(encrypted[field]);
      }
    }

    const result = await this.store.upsert({
      ...row,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });

    const eventId = randomUUID();
    this.outboxWriter.writeSafe({
      idempotencyKey: eventId,
      eventType: 'settings.payment_gateway_updated',
      aggregateType: 'PaymentGatewayConfig',
      aggregateId: gateway,
      payload: { gateway, action: 'credentials_updated' },
    });
    this.notifications.notifyDirect({
      idempotencyKey: eventId,
      eventType: 'settings.payment_gateway_updated',
      aggregateType: 'PaymentGatewayConfig',
      aggregateId: gateway,
      payload: { gateway, action: 'credentials_updated' },
    }).catch(() => {});

    return result;
  }

  async testGatewayConnection(gateway: PaymentGateway): Promise<{
    ok: boolean;
    code?: string;
    message: string;
    details?: any;
  }> {
    const row = await this.findGatewayOrThrow(gateway);
    const c = this.decryptConfig(row);

    if (gateway === 'stripe') {
      return this.testStripeConnection(c as StripeGatewayConfig);
    }
    return this.testPayPalConnection(c as PayPalGatewayConfig);
  }

  private async testStripeConnection(config: StripeGatewayConfig) {
    const missing: string[] = [];
    if (!config.secretKey) missing.push('secretKey');

    if (missing.length > 0) {
      return {
        ok: false,
        code: 'GATEWAY_MISCONFIGURED',
        message: 'Gateway configuration is incomplete.',
        details: { gateway: 'stripe', missingFields: missing },
      };
    }

    try {
      const res = await this.httpClient.request<any>(`${this.stripeApiBase}/balance`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'json',
        timeoutMs: config.requestTimeoutMs ?? 15000,
      });

      if (!res.ok) {
        return {
          ok: false,
          code: 'GATEWAY_AUTH_FAILED',
          message: 'Stripe authentication failed. Check your secret key.',
          details: { status: res.status, upstream: res.data },
        };
      }

      return {
        ok: true,
        message: 'Stripe connection is valid.',
        details: {
          livemode: res.data?.livemode,
          availableBalance: res.data?.available?.[0],
        },
      };
    } catch (error: any) {
      return {
        ok: false,
        code: 'GATEWAY_CONNECTION_ERROR',
        message: error?.message ?? 'Connection test failed.',
      };
    }
  }

  private async testPayPalConnection(config: PayPalGatewayConfig) {
    const missing: string[] = [];
    if (!config.clientId) missing.push('clientId');
    if (!config.clientSecret) missing.push('clientSecret');

    if (missing.length > 0) {
      return {
        ok: false,
        code: 'GATEWAY_MISCONFIGURED',
        message: 'Gateway configuration is incomplete.',
        details: { gateway: 'paypal', missingFields: missing },
      };
    }

    const env = config.environment === 'production' ? 'production' : 'sandbox';
    const baseUrl = this.paypalUrls[env];

    try {
      const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
      const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

      const res = await this.httpClient.request<any>(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        responseType: 'json',
        timeoutMs: 15000,
      });

      if (!res.ok || !res.data?.access_token) {
        return {
          ok: false,
          code: 'GATEWAY_AUTH_FAILED',
          message: 'PayPal authentication failed. Check your credentials.',
          details: { status: res.status, upstream: res.data },
        };
      }

      return {
        ok: true,
        message: 'PayPal connection is valid.',
        details: {
          environment: env,
          tokenType: res.data?.token_type,
        },
      };
    } catch (error: any) {
      return {
        ok: false,
        code: 'GATEWAY_CONNECTION_ERROR',
        message: error?.message ?? 'Connection test failed.',
      };
    }
  }

  async seedGateway(gateway: PaymentGateway, config: any, enabled: boolean): Promise<PaymentGatewayConfigRecord> {
    const existing = await this.store.findOne(gateway);
    if (existing) return existing;

    const secretFields = this.getSecretFields(gateway);
    const encrypted: Record<string, any> = { ...config };
    for (const field of secretFields) {
      if (encrypted[field]) {
        encrypted[field] = this.crypto.encrypt(encrypted[field]);
      }
    }

    return this.store.upsert({
      gateway,
      enabled,
      config: encrypted,
      updatedAt: new Date().toISOString(),
    });
  }

  private getSecretFields(gateway: PaymentGateway): string[] {
    if (gateway === 'stripe') return ['secretKey', 'webhookSecret'];
    return ['clientSecret', 'webhookId'];
  }

  private maskSecrets(row: PaymentGatewayConfigRecord) {
    const c = { ...(row.config ?? {}) } as Record<string, any>;
    for (const field of this.getSecretFields(row.gateway as PaymentGateway)) {
      if (c[field]) c[field] = '********';
    }
    return { ...row, config: c };
  }

  private decryptConfig(row: PaymentGatewayConfigRecord): Record<string, any> {
    const c = { ...(row.config ?? {}) } as Record<string, any>;
    for (const field of this.getSecretFields(row.gateway as PaymentGateway)) {
      if (c[field]) {
        try {
          c[field] = this.crypto.decrypt(c[field]);
        } catch {
          // keep as-is if decryption fails
        }
      }
    }
    return c;
  }

  async getGatewayRuntimeConfig(gateway: PaymentGateway): Promise<Record<string, any>> {
    const row = await this.findGatewayOrThrow(gateway);
    return this.decryptConfig(row);
  }

  async getGatewayPublicConfig(gateway: PaymentGateway): Promise<{ enabled: boolean; config: Record<string, any> } | null> {
    try {
      const row = await this.findGatewayOrThrow(gateway);
      const decrypted = this.decryptConfig(row);
      const secretFields = this.getSecretFields(gateway);
      const publicConfig: Record<string, any> = {};
      for (const [key, value] of Object.entries(decrypted)) {
        if (!secretFields.includes(key)) {
          publicConfig[key] = value;
        }
      }
      return { enabled: row.enabled, config: publicConfig };
    } catch {
      return null;
    }
  }

  private async findGatewayOrThrow(gateway: PaymentGateway) {
    const row = await this.store.findOne(gateway);
    if (!row) throw new NotFoundException(`payment gateway "${gateway}" config not found`);
    return row;
  }
}
