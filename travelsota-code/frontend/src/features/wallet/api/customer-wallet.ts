import { apiRequest } from '@/lib/api/client';

export interface CustomerWalletBalance {
  walletBalance: number;
  /** Wallet-domain currency of all figures. */
  currency: string;
  creditLimit?: number;
  creditUsed?: number;
  creditAvailable?: number;
  utilizationPercent?: number;
}

export interface CustomerWalletTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  /** Wallet-domain currency of `amount`. */
  currency: string;
  /** Pre-conversion values when the money moved in a foreign currency. */
  originalAmount: number | null;
  originalCurrency: string | null;
  balanceBefore: number;
  balanceAfter: number;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  bookingId: string | null;
  bookingType: string | null;
  createdAt: string;
}

export interface CustomerPaginatedTransactions {
  items: CustomerWalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CustomerTransactionFilters {
  page?: number;
  limit?: number;
  type?: string;
  fromDate?: string;
  toDate?: string;
}

export function getCustomerWalletBalance() {
  return apiRequest<CustomerWalletBalance>('/customer/wallet', { auth: true });
}

export function getCustomerWalletTransactions(filters?: CustomerTransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.type) params.set('type', filters.type);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return apiRequest<CustomerPaginatedTransactions>(`/customer/wallet/transactions${qs ? `?${qs}` : ''}`, { auth: true });
}

export interface CustomerTopUpPaymentIntent {
  paymentId: string;
  bookingId?: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  message: string;
}

export function topUpCustomerWallet(amount: number, description?: string, gateway?: 'STRIPE' | 'PAYPAL') {
  return apiRequest<CustomerTopUpPaymentIntent>('/customer/wallet/top-up', {
    method: 'POST',
    body: { amount, description, ...(gateway ? { gateway } : {}) },
    auth: true,
  });
}

export interface CustomerTopupRequest {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  originalAmount: number | null;
  originalCurrency: string | null;
  reference: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

/** Request an offline top-up (bank transfer / cash). Admin approves before credit. */
export function requestCustomerTopup(
  amount: number,
  method?: string,
  reference?: string,
  opts?: { currency?: string; evidenceUrl?: string },
) {
  return apiRequest<CustomerTopupRequest>('/customer/wallet/topup-requests', {
    method: 'POST',
    body: {
      amount,
      method,
      reference,
      ...(opts?.currency ? { currency: opts.currency } : {}),
      ...(opts?.evidenceUrl ? { evidenceUrl: opts.evidenceUrl } : {}),
    },
    auth: true,
  });
}

/** Upload top-up receipt evidence (images + PDF, 5MB max). Returns the file URL. */
export async function uploadCustomerTopupEvidence(file: File): Promise<string> {
  const { getAccessToken } = await import('@/lib/auth/storage');
  const { getPublicEnv } = await import('@/lib/env/env');
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${NEXT_PUBLIC_API_BASE_URL}/customer/wallet/topup-evidence`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
    credentials: 'include',
  });
  const json = (await res.json().catch(() => null)) as {
    success?: boolean;
    message?: string;
    data?: { url?: string };
  } | null;
  if (!res.ok || !json?.data?.url) {
    throw new Error(json?.message ?? 'Evidence upload failed.');
  }
  return json.data.url;
}

/** Own offline top-up requests, newest first. */
export function getMyCustomerTopupRequests() {
  return apiRequest<CustomerTopupRequest[]>('/customer/wallet/topup-requests', { auth: true });
}

export interface CustomerWithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  createdAt: string;
}

/** Request a wallet withdrawal — funds locked until admin approves/rejects. */
export function requestCustomerWithdrawal(amount: number, methodName: string, details?: string) {
  return apiRequest<CustomerWithdrawalRequest>('/customer/wallet/withdrawals', {
    method: 'POST',
    body: { amount, methodName, ...(details ? { details } : {}) },
    auth: true,
  });
}

/** Own wallet withdrawal requests, newest first. */
export function listCustomerWithdrawals() {
  return apiRequest<CustomerWithdrawalRequest[]>('/customer/wallet/withdrawals', { auth: true });
}

/** Cancel a pending wallet withdrawal — locked funds released. */
export function cancelCustomerWithdrawal(id: string) {
  return apiRequest<CustomerWithdrawalRequest>(`/customer/wallet/withdrawals/${id}/cancel`, {
    method: 'POST',
    body: {},
    auth: true,
  });
}
