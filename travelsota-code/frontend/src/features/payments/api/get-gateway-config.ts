import { apiRequest } from '@/lib/api/client';

export interface GatewayPublicConfig {
  enabled: boolean;
  publishableKey?: string;
  clientId?: string;
  environment?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface GatewayListItem {
  gateway: 'stripe' | 'paypal' | 'bank_transfer' | 'pay_later';
  enabled: boolean;
  config: Record<string, unknown>;
}

const GATEWAY_LABELS: Record<GatewayListItem['gateway'], { title: string; subtitle: string }> = {
  stripe: { title: 'Stripe', subtitle: 'Credit or debit card' },
  paypal: { title: 'PayPal', subtitle: 'PayPal account' },
  bank_transfer: { title: 'Bank Transfer', subtitle: 'Transfer, we verify' },
  pay_later: { title: 'Pay Later', subtitle: 'Hold now, pay in window' },
};

export function gatewayLabel(key: string): { title: string; subtitle: string } {
  return GATEWAY_LABELS[key as GatewayListItem['gateway']] ?? { title: key, subtitle: '' };
}

export function toCheckoutGateway(
  key: string,
): 'STRIPE' | 'PAYPAL' | 'BANK_TRANSFER' | 'PAY_LATER' {
  const k = key.toLowerCase();
  if (k === 'paypal') return 'PAYPAL';
  if (k === 'bank_transfer') return 'BANK_TRANSFER';
  if (k === 'pay_later') return 'PAY_LATER';
  return 'STRIPE';
}

export function isManualGatewayKey(key: string): boolean {
  const k = key.toLowerCase();
  return k === 'bank_transfer' || k === 'pay_later';
}

export async function getGatewayPublicConfig(gateway: 'stripe' | 'paypal'): Promise<GatewayPublicConfig> {
  return apiRequest<GatewayPublicConfig>(`/payments/config/${gateway}`);
}

export async function getEnabledGateways(): Promise<GatewayListItem[]> {
  return apiRequest<GatewayListItem[]>('/payments/gateways');
}