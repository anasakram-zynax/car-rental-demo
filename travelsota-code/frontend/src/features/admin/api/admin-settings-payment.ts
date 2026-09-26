import { adminRequest } from '@/lib/api/admin-client';

export interface PaymentGatewaySummary {
  gateway: string;
  enabled: boolean;
  updatedAt: string;
}

export interface StripeGatewayConfig {
  gateway: 'stripe';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'test' | 'production';
    publishableKey: string;
    secretKey?: string;
    webhookSecret?: string;
  };
}

export interface PayPalGatewayConfig {
  gateway: 'paypal';
  enabled: boolean;
  updatedAt: string;
  config: {
    environment: 'sandbox' | 'production';
    clientId: string;
    clientSecret?: string;
    webhookId?: string;
  };
}

export function getPaymentGateways() {
  return adminRequest<PaymentGatewaySummary[]>('/admin/settings/payment/gateways');
}

export function getStripeConfig() {
  return adminRequest<StripeGatewayConfig>('/admin/settings/payment/gateways/stripe');
}

export function getPayPalConfig() {
  return adminRequest<PayPalGatewayConfig>('/admin/settings/payment/gateways/paypal');
}

export function setStripeEnabled(enabled: boolean) {
  return adminRequest<StripeGatewayConfig>(
    '/admin/settings/payment/gateways/stripe/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setPayPalEnabled(enabled: boolean) {
  return adminRequest<PayPalGatewayConfig>(
    '/admin/settings/payment/gateways/paypal/enabled',
    { method: 'PUT', body: { enabled } },
  );
}

export function setStripeCredentials(config: StripeGatewayConfig['config']) {
  return adminRequest<StripeGatewayConfig>(
    '/admin/settings/payment/gateways/stripe/credentials',
    { method: 'PUT', body: config },
  );
}

export function setPayPalCredentials(config: PayPalGatewayConfig['config']) {
  return adminRequest<PayPalGatewayConfig>(
    '/admin/settings/payment/gateways/paypal/credentials',
    { method: 'PUT', body: config },
  );
}

export function testStripeConnection() {
  return adminRequest<{ ok: boolean; message: string; code?: string; details?: unknown }>(
    '/admin/settings/payment/gateways/stripe/test-connection',
    { method: 'POST', body: {} },
  );
}

export function testPayPalConnection() {
  return adminRequest<{ ok: boolean; message: string; code?: string; details?: unknown }>(
    '/admin/settings/payment/gateways/paypal/test-connection',
    { method: 'POST', body: {} },
  );
}

export type PaymentGatewayKey = 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later';

export const MANUAL_GATEWAY_KEYS: PaymentGatewayKey[] = ['bank_transfer', 'pay_later'];

export function isManualGatewayKey(key: PaymentGatewayKey): boolean {
  return key === 'bank_transfer' || key === 'pay_later';
}

/** Enable/disable any gateway (manual methods share one backend route). */
export function setGatewayEnabled(key: PaymentGatewayKey, enabled: boolean) {
  return adminRequest<{ gateway: string; enabled: boolean }>(
    `/admin/settings/payment/gateways/${key}/enabled`,
    { method: 'PUT', body: { enabled } },
  );
}

export interface BankTransferDetails {
  accountTitle?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  instructions?: string;
}

/** Save bank-transfer display details (admin only). */
export function setBankTransferDetails(details: BankTransferDetails) {
  return adminRequest<{ gateway: string }>(
    '/admin/settings/payment/gateways/bank_transfer/details',
    { method: 'PUT', body: details },
  );
}

/** Bank details for display (public endpoint — no secrets stored). */
export async function getBankTransferDetails(): Promise<BankTransferDetails & { enabled: boolean }> {
  const { apiRequest } = await import('@/lib/api/client');
  return apiRequest<BankTransferDetails & { enabled: boolean }>('/payments/config/bank_transfer');
}

export interface PaymentGatewayMeta {
  label: string;
  description: string;
  docsUrl: string;
  accent: string;
  accentBg: string;
  accentLight: string;
  accentRing: string;
  gradientFrom: string;
  gradientTo: string;
  bannerFrom: string;
  bannerTo: string;
  tag: string;
  tagValue: string;
}

const PAYMENT_GATEWAY_META: Record<PaymentGatewayKey, PaymentGatewayMeta> = {
  stripe: {
    label: 'Stripe',
    description: 'Card payments, wallets, and local payment methods.',
    docsUrl: 'https://docs.stripe.com/',
    accent: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    accentLight: 'bg-indigo-100 dark:bg-indigo-900/30',
    accentRing: 'ring-indigo-200 dark:ring-indigo-800/40',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-purple-600',
    bannerFrom: 'from-indigo-500/10',
    bannerTo: 'to-purple-500/10',
    tag: 'Cards & Wallets',
    tagValue: 'Global',
  },
  paypal: {
    label: 'PayPal',
    description: 'Digital wallet and checkout solutions worldwide.',
    docsUrl: 'https://developer.paypal.com/',
    accent: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-50 dark:bg-blue-950/40',
    accentLight: 'bg-blue-100 dark:bg-blue-900/30',
    accentRing: 'ring-blue-200 dark:ring-blue-800/40',
    gradientFrom: 'from-blue-500',
    gradientTo: 'to-sky-600',
    bannerFrom: 'from-blue-500/10',
    bannerTo: 'to-sky-500/10',
    tag: 'Digital Wallet',
    tagValue: 'Global',
  },
  bank_transfer: {
    label: 'Bank Transfer',
    description: 'Customer transfers manually, uploads receipt; admin verifies and issues.',
    docsUrl: '',
    accent: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    accentLight: 'bg-emerald-100 dark:bg-emerald-900/30',
    accentRing: 'ring-emerald-200 dark:ring-emerald-800/40',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    bannerFrom: 'from-emerald-500/10',
    bannerTo: 'to-teal-500/10',
    tag: 'Manual',
    tagValue: 'Verify',
  },
  pay_later: {
    label: 'Pay Later',
    description: 'Booking held for the admin-set window; auto-cancelled on expiry.',
    docsUrl: '',
    accent: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-50 dark:bg-amber-950/40',
    accentLight: 'bg-amber-100 dark:bg-amber-900/30',
    accentRing: 'ring-amber-200 dark:ring-amber-800/40',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-600',
    bannerFrom: 'from-amber-500/10',
    bannerTo: 'to-orange-500/10',
    tag: 'Manual',
    tagValue: 'Hold',
  },
};

export function getPaymentGatewayMeta<K extends PaymentGatewayKey>(key: K): PaymentGatewayMeta {
  return PAYMENT_GATEWAY_META[key];
}

export function getPaymentGatewayDocsUrl(key: PaymentGatewayKey): string {
  if (key === 'stripe') return 'https://docs.stripe.com/';
  if (key === 'paypal') return 'https://developer.paypal.com/';
  return '';
}
