import { adminRequest } from '@/lib/api/admin-client';

export interface CustomerWalletBalance {
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  utilizationPercent: number;
  currency: string;
}

export interface CustomerWalletTransaction {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
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

export interface PagedCustomerWalletTransactions {
  items: CustomerWalletTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminCustomerTopupRequest {
  id: string;
  userId: string;
  type: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  customerEmail: string | null;
}

export function getAdminCustomerWallet(userId: string) {
  return adminRequest<{ wallet: CustomerWalletBalance | null }>(`/admin/customers/${userId}/wallet`);
}

export function getAdminCustomerWalletTransactions(userId: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const search = qs.toString();
  return adminRequest<{ userId: string; transactions: PagedCustomerWalletTransactions | null }>(
    `/admin/customers/${userId}/wallet/transactions${search ? `?${search}` : ''}`,
  );
}

export function adminAdjustCustomerWalletBalance(userId: string, amount: number, reason: string) {
  return adminRequest<CustomerWalletTransaction>(`/admin/customers/${userId}/wallet/adjust`, {
    method: 'POST',
    body: { amount, reason },
  });
}

export function listCustomerTopupRequests(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<AdminCustomerTopupRequest[]>(`/admin/customers/topup-requests/list${qs}`);
}

export function approveCustomerTopupRequest(requestId: string) {
  return adminRequest<AdminCustomerTopupRequest>(`/admin/customers/topup-requests/${requestId}/approve`, {
    method: 'POST',
    body: {},
  });
}

export function rejectCustomerTopupRequest(requestId: string, reason?: string) {
  return adminRequest<AdminCustomerTopupRequest>(`/admin/customers/topup-requests/${requestId}/reject`, {
    method: 'POST',
    body: { reason },
  });
}

export interface AdminCustomerWithdrawalRequest {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  createdAt: string;
  customerEmail: string | null;
}

/** Wallet withdrawal queue (funds already locked). */
export function listCustomerWithdrawals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<AdminCustomerWithdrawalRequest[]>(`/admin/customers/withdrawals/list${qs}`);
}

export function approveCustomerWithdrawal(requestId: string, paymentReference?: string) {
  return adminRequest<AdminCustomerWithdrawalRequest>(`/admin/customers/withdrawals/${requestId}/approve`, {
    method: 'POST',
    body: { ...(paymentReference ? { paymentReference } : {}) },
  });
}

export function rejectCustomerWithdrawal(requestId: string, reason?: string) {
  return adminRequest<AdminCustomerWithdrawalRequest>(`/admin/customers/withdrawals/${requestId}/reject`, {
    method: 'POST',
    body: { ...(reason ? { reason } : {}) },
  });
}
