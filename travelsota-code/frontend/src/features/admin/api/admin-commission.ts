import { adminRequest } from '@/lib/api/admin-client';

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
  /** Currency bookingAmount/commissionAmount are denominated in — the
   *  backend already sends this (CommissionService.toEntity). */
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

export interface PendingPayouts {
  totalAgents: number;
  totalAmount: number;
  /** Reporting currency of totalAmount and per-record totals. */
  currency: string;
  totalRecords: number;
  records: Array<{
    agentProfileId: string;
    agentName: string | null;
    agentEmail: string | null;
    totalCommission: number;
    count: number;
  }>;
}

export interface CommissionRule {
  id: string;
  name: string;
  description: string | null;
  type: string;
  rate: number;
  applyTo: string;
  minAmount: number | null;
  maxAmount: number | null;
  agentTierId: string | null;
  agentId: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCommissionFilters {
  page?: number;
  limit?: number;
  status?: string;
  bookingType?: string;
  agentProfileId?: string;
  fromDate?: string;
  toDate?: string;
}

export function getAdminCommissions(filters?: AdminCommissionFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.agentProfileId) params.set('agentProfileId', filters.agentProfileId);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return adminRequest<PaginatedCommissions>(`/admin/commissions${qs ? `?${qs}` : ''}`);
}

export function getAdminPendingPayouts() {
  return adminRequest<PendingPayouts>('/admin/commissions/pending-payouts');
}

export function markCommissionsAsPaid(commissionIds: string[], payoutId?: string) {
  return adminRequest<{ count: number }>('/admin/commissions/payout', {
    method: 'POST',
    body: { commissionIds, payoutId },
  });
}

export function getCommissionRules() {
  return adminRequest<CommissionRule[]>('/admin/commissions/rules');
}

export function createCommissionRule(data: {
  name: string; type: string; rate: number; applyTo: string;
  description?: string; agentTierId?: string; agentId?: string;
  minAmount?: number; maxAmount?: number; startDate?: string; endDate?: string;
  priority?: number;
}) {
  return adminRequest<CommissionRule>('/admin/commissions/rules', {
    method: 'POST',
    body: data,
  });
}

export function updateCommissionRule(id: string, data: Partial<{
  name: string; type: string; rate: number; applyTo: string;
  description: string; agentTierId: string; agentId: string;
  minAmount: number; maxAmount: number; startDate: string; endDate: string;
  priority: number; isActive: boolean;
}>) {
  return adminRequest<CommissionRule>(`/admin/commissions/rules/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export function deleteCommissionRule(id: string) {
  return adminRequest<{ success: boolean }>(`/admin/commissions/rules/${id}`, {
    method: 'DELETE',
  });
}

export interface AdminCommissionWithdrawal {
  id: string;
  agentProfileId: string;
  amount: number | null;
  currency: string | null;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  createdAt: string;
  agentEmail?: string | null;
  agentName?: string | null;
}

/** Commission withdrawal queue — approval pays current pending balance. */
export function listCommissionWithdrawals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<AdminCommissionWithdrawal[]>(`/admin/commissions/withdrawals${qs}`);
}

export function approveCommissionWithdrawal(requestId: string, paymentReference?: string) {
  return adminRequest<AdminCommissionWithdrawal>(`/admin/commissions/withdrawals/${requestId}/approve`, {
    method: 'POST',
    body: { ...(paymentReference ? { paymentReference } : {}) },
  });
}

export function rejectCommissionWithdrawal(requestId: string, reason?: string) {
  return adminRequest<AdminCommissionWithdrawal>(`/admin/commissions/withdrawals/${requestId}/reject`, {
    method: 'POST',
    body: { ...(reason ? { reason } : {}) },
  });
}
