'use client';

export interface CheckoutData {
  paymentId: string;
  bookingId: string;
  bookingType?: string;
  amount: number;
  currency: string;
  displayAmount?: number;
  displayCurrency?: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  hotelName: string | null;
  roomName: string | null;
  paymentMethod?: 'stripe' | 'paypal' | 'wallet' | 'bank_transfer' | 'pay_later';
  isAgent?: boolean;
  aggregatedPolicy?: import('@/lib/schema/hotel').AggregatedPolicy;
}

const CHECKOUT_DATA_KEY = 'checkout_data';

export function storeCheckoutData(data: CheckoutData): void {
  try {
    sessionStorage.setItem(CHECKOUT_DATA_KEY, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

export function readCheckoutData(paymentId: string): CheckoutData | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_DATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutData;
    if (parsed.paymentId === paymentId) return parsed;
  } catch {
    // Ignore parse errors
  }
  return null;
}

export function clearCheckoutData(): void {
  try {
    sessionStorage.removeItem(CHECKOUT_DATA_KEY);
  } catch {
    // Ignore
  }
}
