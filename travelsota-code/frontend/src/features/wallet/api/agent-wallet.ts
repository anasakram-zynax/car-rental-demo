import { apiRequest } from '@/lib/api/client';

export interface WalletBalance {
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  utilizationPercent: number;
  /** Wallet-domain currency of all figures above. */
  currency: string;
}

export interface WalletTransaction {
  id: string;
  agentProfileId: string;
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

export interface PaginatedTransactions {
  items: WalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TransactionFilters {
  page?: number;
  limit?: number;
  type?: string;
  fromDate?: string;
  toDate?: string;
}

export function getWalletBalance() {
  return apiRequest<WalletBalance>('/agent/wallet', { auth: true });
}

export function getWalletTransactions(filters?: TransactionFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.type) params.set('type', filters.type);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return apiRequest<PaginatedTransactions>(`/agent/wallet/transactions${qs ? `?${qs}` : ''}`, { auth: true });
}

export interface TopUpPaymentIntent {
  paymentId: string;
  bookingId?: string;
  amount: number;
  currency: string;
  clientSecret: string | null;
  checkoutUrl: string | null;
  message: string;
}

export function topUpWallet(amount: number, description?: string, gateway?: 'STRIPE' | 'PAYPAL') {
  return apiRequest<TopUpPaymentIntent>('/agent/wallet/top-up', {
    method: 'POST',
    body: { amount, description, ...(gateway ? { gateway } : {}) },
    auth: true,
  });
}

export interface RepayCreditResult {
  transaction: WalletTransaction;
  amount: number;
  remainingCredit: number;
  message: string;
}

/** Repay used credit from the wallet balance (wallet → credit settlement). */
export function repayCredit(amount: number) {
  return apiRequest<RepayCreditResult>('/agent/wallet/repay-credit', {
    method: 'POST',
    body: { amount },
    auth: true,
  });
}

export interface TopupRequest {
  id: string;
  agentProfileId: string;
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
export function requestTopup(
  amount: number,
  method?: string,
  reference?: string,
  opts?: { currency?: string; evidenceUrl?: string },
) {
  return apiRequest<TopupRequest>('/agent/wallet/topup-requests', {
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
export async function uploadAgentTopupEvidence(file: File): Promise<string> {
  const { getAccessToken } = await import('@/lib/auth/storage');
  const { getPublicEnv } = await import('@/lib/env/env');
  const { NEXT_PUBLIC_API_BASE_URL } = getPublicEnv();
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${NEXT_PUBLIC_API_BASE_URL}/agent/wallet/topup-evidence`, {
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
export function getMyTopupRequests() {
  return apiRequest<TopupRequest[]>('/agent/wallet/topup-requests', { auth: true });
}

export interface WithdrawalRequest {
  id: string;
  agentProfileId: string;
  amount: number;
  currency: string;
  /** Payout method name (stored in reference). */
  reference: string | null;
  /** Account details free text (stored in description). */
  description: string | null;
  status: string;
  /** Admin off-platform payment ref (stored in paymentId). */
  paymentId: string | null;
  createdAt: string;
}

/** Request a wallet withdrawal — funds locked until admin approves/rejects. */
export function requestWalletWithdrawal(amount: number, methodName: string, details?: string) {
  return apiRequest<WithdrawalRequest>('/agent/wallet/withdrawals', {
    method: 'POST',
    body: { amount, methodName, ...(details ? { details } : {}) },
    auth: true,
  });
}

/** Own wallet withdrawal requests, newest first. */
export function listWalletWithdrawals() {
  return apiRequest<WithdrawalRequest[]>('/agent/wallet/withdrawals', { auth: true });
}

/** Cancel a pending wallet withdrawal — locked funds released. */
export function cancelWalletWithdrawal(id: string) {
  return apiRequest<WithdrawalRequest>(`/agent/wallet/withdrawals/${id}/cancel`, {
    method: 'POST',
    body: {},
    auth: true,
  });
}
