import { Injectable, Logger } from '@nestjs/common';
import { PaymentGatewayConfigService } from './payment-gateway-config.service';
import type { PaymentGateway } from '../../domain/payment-gateway-config.entity';

const MANUAL_GATEWAY_DEMO_DEFAULTS = {
  bank_transfer: {
    accountTitle: 'TravelsOTA Demo Travel Ltd',
    bankName: 'Demo National Bank',
    accountNumber: '0123456789012',
    iban: 'PK36DEMO0000001234567890',
    swiftCode: 'DEMOPKKA',
    instructions:
      'Transfer the exact booking total and quote your booking reference in the payment remarks. Upload your transfer receipt on the next step — your booking is confirmed once our team verifies the payment (usually within 1 business day).',
  },
  pay_later: {
    instructions:
      'Your booking is held for you. Complete payment within the hold window shown on your booking, otherwise it is released automatically.',
  },
} as const;

@Injectable()
export class PaymentGatewayConfigSeedService {
  private readonly logger = new Logger(PaymentGatewayConfigSeedService.name);

  constructor(private readonly service: PaymentGatewayConfigService) {}

  async ensureSeed(): Promise<void> {
    await this.seedStripe();
    await this.seedPayPal();
    await this.seedManualGateway('bank_transfer');
    await this.seedManualGateway('pay_later');
  }

  /**
   * Manual (non-gateway) methods: no credentials, no adapter calls.
   * Seeded DISABLED — the admin enables them in payment settings.
   * ponytail: one method for both, they differ only by key.
   */
  private async seedManualGateway(key: PaymentGateway): Promise<void> {
    const defaults = MANUAL_GATEWAY_DEMO_DEFAULTS[key as 'bank_transfer' | 'pay_later'] ?? {};
    let exists = true;
    try {
      await this.service.getGateway(key);
    } catch {
      exists = false;
    }
    if (!exists) {
      await this.service.seedGateway(key, { manual: true, ...defaults }, false);
      this.logger.log(`Seeded payment gateway: ${key} (disabled)`);
      return;
    }
    // Backfill only missing/empty demo keys — never overwrite admin-entered values.
    const current = (await this.service.getGatewayPublicConfig(key))?.config ?? {};
    const missing = Object.fromEntries(
      Object.entries(defaults).filter(([k]) => !String(current?.[k] ?? '').trim()),
    );
    if (Object.keys(missing).length === 0) return;
    await this.service.setGatewayCredentials(key, missing);
    this.logger.log(`Backfilled demo defaults for ${key}: ${Object.keys(missing).join(', ')}`);
  }

  private async seedStripe(): Promise<void> {
    let exists = true;
    try {
      await this.service.getGateway('stripe');
    } catch {
      exists = false;
    }
    if (exists) return;

    const config = {
      environment: 'test' as const,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      requestTimeoutMs: Number(process.env.STRIPE_REQUEST_TIMEOUT_MS ?? 45000),
    };

    await this.service.seedGateway('stripe', config, true);
    this.logger.log('Seeded payment gateway: stripe');
  }

  private async seedPayPal(): Promise<void> {
    let exists = true;
    try {
      await this.service.getGateway('paypal');
    } catch {
      exists = false;
    }
    if (exists) return;

    const config = {
      environment: 'sandbox' as const,
      clientId: process.env.PAYPAL_CLIENT_ID ?? '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID ?? '',
    };

    await this.service.seedGateway('paypal', config, true);
    this.logger.log('Seeded payment gateway: paypal');
  }
}
