import { apiRequest } from '@/lib/api/client';

export interface CommissionRecord {
  id: string;
  agentProfileId: string;
  bookingId: string;
  bookingType: string;
  ruleId: string | null;
  bookingAmount: number;
  commissionAmount: number;
  rate: number;
  rateType: string;
  /** Currency bookingAmount/commissionAmount are denominated in — the backend
   *  already sends this (CommissionService.toEntity), the type just hadn't
   *  caught up. CommissionSummary totals are reported in USD regardless. */
  currency: string;
  status: string;
  payoutId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedCommissions {
  items: CommissionRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CommissionSummary {
  totalPending: number;
  totalPaid: number;
  totalCommission: number;
  /** Reporting currency of the totals and byPeriod amounts. */
  currency: string;
  bookingCount: number;
  byPeriod: { period: string; amount: number; count: number }[];
}

export interface CommissionFilters {
  page?: number;
  limit?: number;
  status?: string;
  bookingType?: string;
  fromDate?: string;
  toDate?: string;
}

export function getAgentCommissions(filters?: CommissionFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return apiRequest<PaginatedCommissions>(`/agent/commissions${qs ? `?${qs}` : ''}`, { auth: true });
}

export function getAgentCommissionSummary(fromDate?: string, toDate?: string) {
  const params = new URLSearchParams();
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);
  const qs = params.toString();
  return apiRequest<CommissionSummary>(`/agent/commissions/summary${qs ? `?${qs}` : ''}`, { auth: true });
}

export interface CommissionWithdrawalRequest {
  id: string;
  agentProfileId: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  createdAt: string;
}

/** Move full pending commission balance to wallet instantly. */
export function transferCommissionToWallet() {
  return apiRequest<{ count: number }>('/agent/commissions/transfer-to-wallet', {
    method: 'POST',
    body: {},
    auth: true,
  });
}

/** Request a commission withdrawal — paid from current pending at approval. */
export function requestCommissionWithdrawal(methodName: string, details?: string) {
  return apiRequest<CommissionWithdrawalRequest>('/agent/commissions/withdrawals', {
    method: 'POST',
    body: { methodName, ...(details ? { details } : {}) },
    auth: true,
  });
}

/** Own commission withdrawal requests, newest first. */
export function listCommissionWithdrawals() {
  return apiRequest<CommissionWithdrawalRequest[]>('/agent/commissions/withdrawals', { auth: true });
}
