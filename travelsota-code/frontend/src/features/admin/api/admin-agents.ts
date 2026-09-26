import { adminRequest } from '@/lib/api/admin-client';

export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AgentProfile {
  id: string;
  userId: string;
  creditLimit: number;
  creditUsed: number;
  commissionRate: number;
  flightMarkup: number;
  hotelMarkup: number;
  companyName: string | null;
  companyPhone: string | null;
  companyAddress: string | null;
  taxId: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;

  // Phase 1 fields
  parentAgentId: string | null;
  walletBalance: number;
  /** Wallet-domain currency of walletBalance/credit figures. */
  walletCurrency?: string | null;
  commissionTierId: string | null;
  markupRules: Record<string, unknown> | null;
  kycStatus: KycStatus;
  kycDocuments: Record<string, unknown>[] | null;
  branding: Record<string, unknown> | null;
  autoSuspendThreshold: number;
  isSuspended: boolean;
  suspensionReason: string | null;

  // Sub-agent management
  maxSubAgents: number;
  maxCreditPerSub: number;
  inheritMarkups: boolean;
  inheritCommission: boolean;
  subAgentDefaultRoleId: string | null;
  canManageSubAgents: boolean;
  segregatedCredit: boolean;
  allowedSubAgentRoleIds: string[] | null;
}

export interface AgentUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  userType: 'STAFF' | 'CUSTOMER' | 'AGENT';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
  roleId: string | null;
  roleName: string | null;
  agentProfile: AgentProfile | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AgentListFilters {
  kycStatus?: KycStatus;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export function getAgents(filters?: AgentListFilters) {
  const params = new URLSearchParams();
  if (filters?.kycStatus) params.set('kycStatus', filters.kycStatus);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return adminRequest<AgentUser[]>(`/admin/agents${qs ? `?${qs}` : ''}`);
}

export function getAgent(userId: string) {
  return adminRequest<AgentUser | null>(`/admin/agents/${userId}`);
}

export function updateAgent(userId: string, data: {
  creditLimit?: number; commissionRate?: number; flightMarkup?: number; hotelMarkup?: number;
  companyName?: string; companyPhone?: string; companyAddress?: string; taxId?: string; isApproved?: boolean;
  maxSubAgents?: number; maxCreditPerSub?: number; inheritMarkups?: boolean; inheritCommission?: boolean;
  subAgentDefaultRoleId?: string; canManageSubAgents?: boolean; segregatedCredit?: boolean; allowedSubAgentRoleIds?: string[];
}) {
  return adminRequest<AgentProfile>(`/admin/agents/${userId}`, { method: 'PATCH', body: data });
}

export function approveAgent(userId: string) {
  return adminRequest<AgentProfile>(`/admin/agents/${userId}/approve`, { method: 'POST' });
}

export function rejectAgent(userId: string, reason: string) {
  return adminRequest<AgentProfile>(`/admin/agents/${userId}/reject`, { method: 'POST', body: { reason } });
}

export function suspendAgent(userId: string, reason?: string) {
  return adminRequest<AgentProfile>(`/admin/agents/${userId}/suspend`, {
    method: 'POST',
    body: { ...(reason ? { reason } : {}) },
  });
}

export function unsuspendAgent(userId: string) {
  return adminRequest<AgentProfile>(`/admin/agents/${userId}/unsuspend`, { method: 'POST' });
}

export function assignAgentRole(userId: string, roleId: string) {
  return adminRequest<{ id: string; roleId?: string; roleName?: string }>(`/admin/agents/${userId}/role`, { method: 'PUT', body: { roleId } });
}

export interface AgentEffectivePermissions {
  roleName: string | null;
  rolePermissions: string[];
  permissionOverrides: { grant?: string[]; revoke?: string[] } | null;
  effectivePermissions: string[];
}

export function getAgentEffectivePermissions(userId: string) {
  return adminRequest<AgentEffectivePermissions>(`/admin/agents/${userId}/effective-permissions`);
}

export function setAgentPermissionOverrides(userId: string, overrides: { grant?: string[]; revoke?: string[] } | null) {
  return adminRequest<{ success: boolean }>(`/admin/agents/${userId}/permission-overrides`, {
    method: 'PUT',
    body: overrides ?? {},
  });
}

export interface AgentMarkupRule {
  id: string;
  name: string;
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  /** Only meaningful for markupType 'fixed'. */
  currency?: string | null;
  routeFrom: string | null;
  routeTo: string | null;
  isActive: boolean;
}

// ─── Admin Wallet API ──────────────────────────────────────

export interface AdminWalletBalance {
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  utilizationPercent: number;
  currency: string;
}

export function getAdminAgentWallet(userId: string) {
  return adminRequest<{ wallet: AdminWalletBalance | null }>(`/admin/agents/${userId}/wallet`);
}

export function getAdminAgentWalletTransactions(userId: string, params?: {
  page?: number; limit?: number; type?: string; fromDate?: string; toDate?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.type) qs.set('type', params.type);
  if (params?.fromDate) qs.set('fromDate', params.fromDate);
  if (params?.toDate) qs.set('toDate', params.toDate);
  const search = qs.toString();
  return adminRequest<{ agentProfileId: string | null; transactions: {
    items: Array<{
      id: string; agentProfileId: string; type: string; amount: number;
      balanceBefore: number; balanceAfter: number; reference: string | null;
      description: string | null; status: string; paymentId: string | null;
      bookingId: string | null; bookingType: string | null; createdAt: string;
    }>; total: number; page: number; limit: number; totalPages: number;
  } | null }>(`/admin/agents/${userId}/wallet/transactions${search ? `?${search}` : ''}`);
}

export function setAdminCreditLimit(userId: string, limit: number) {
  return adminRequest<{ creditLimit: number; creditUsed: number }>(`/admin/agents/${userId}/credit-limit`, {
    method: 'POST',
    body: { limit },
  });
}

export function adminAdjustWalletBalance(userId: string, amount: number, reason: string) {
  return adminRequest<{ id: string; type: string; amount: number; currency: string; description: string | null; balanceAfter: number }>(
    `/admin/agents/${userId}/wallet/adjust`,
    { method: 'POST', body: { amount, reason } },
  );
}

export interface AdminTopupRequest {
  id: string;
  agentProfileId: string;
  type: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string | null;
  status: string;
  createdAt: string;
  agentEmail: string | null;
}

/** All offline top-up requests (admin queue). */
export function listTopupRequests(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<AdminTopupRequest[]>(`/admin/agents/topup-requests/list${qs}`);
}

/** Approve a top-up request — credits the agent wallet. */
export function approveTopupRequest(requestId: string) {
  return adminRequest<AdminTopupRequest>(`/admin/agents/topup-requests/${requestId}/approve`, { method: 'POST', body: {} });
}

/** Reject a top-up request — no money moves. */
export function rejectTopupRequest(requestId: string, reason?: string) {
  return adminRequest<AdminTopupRequest>(`/admin/agents/topup-requests/${requestId}/reject`, { method: 'POST', body: { reason } });
}

export interface AdminWithdrawalRequest {
  id: string;
  agentProfileId: string;
  amount: number;
  currency: string;
  reference: string | null;
  description: string | null;
  status: string;
  paymentId: string | null;
  createdAt: string;
  agentEmail: string | null;
}

/** Wallet withdrawal queue (funds already locked). */
export function listWalletWithdrawals(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return adminRequest<AdminWithdrawalRequest[]>(`/admin/agents/withdrawals/list${qs}`);
}

export function approveWalletWithdrawal(requestId: string, paymentReference?: string) {
  return adminRequest<AdminWithdrawalRequest>(`/admin/agents/withdrawals/${requestId}/approve`, {
    method: 'POST',
    body: { ...(paymentReference ? { paymentReference } : {}) },
  });
}

export function rejectWalletWithdrawal(requestId: string, reason?: string) {
  return adminRequest<AdminWithdrawalRequest>(`/admin/agents/withdrawals/${requestId}/reject`, {
    method: 'POST',
    body: { ...(reason ? { reason } : {}) },
  });
}

export function getAgentMarkups(userId: string) {
  return adminRequest<AgentMarkupRule[]>(`/admin/agents/${userId}/markups`);
}

export function setAgentMarkups(userId: string, markups: { name: string; applyTo: string; markupType: string; markupValue: number; routeFrom?: string; routeTo?: string }[]) {
  return adminRequest<AgentMarkupRule[]>(`/admin/agents/${userId}/markups`, {
    method: 'PUT',
    body: { markups },
  });
}
