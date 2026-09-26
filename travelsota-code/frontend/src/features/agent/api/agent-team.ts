import { apiRequest } from '@/lib/api/client';

export interface SubAgentUser {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string;
  roleName: string | null;
  creditLimit: number;
  creditUsed: number;
  creditAvailable: number;
  isSuspended: boolean;
  permissions: string[];
    totalBookings: number;
    totalSpent: number;
    /** Wallet-domain currency of totalSpent/credit figures. */
    walletCurrency: string;
    lastLoginAt: string | null;
    createdAt: string;
  }

export interface CreateSubAgentPayload {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  roleId?: string;
  creditLimit?: number;
  segregatedCredit?: boolean;
  grantPermissions?: string[];
  revokePermissions?: string[];
}

export interface UpdateSubAgentPayload {
  firstName?: string;
  lastName?: string;
  roleId?: string;
  creditLimit?: number;
  grantPermissions?: string[];
  revokePermissions?: string[];
}

export interface AgentRole {
  id: string;
  name: string;
  description: string;
}

export async function createSubAgent(data: CreateSubAgentPayload) {
  return apiRequest<SubAgentUser>('/agent/team/create', {
    method: 'POST',
    body: data,
    auth: true,
  });
}

export async function getAgentRoles() {
  return apiRequest<AgentRole[]>('/agent/team/roles', { auth: true });
}

export async function getTeamStats() {
  return apiRequest<{
    subAgentCount: number;
    totalBookings: number;
    totalRevenue: number;
    topSubAgent: { userId: string; name: string; bookings: number; revenue: number } | null;
  }>('/agent/team/stats', { auth: true });
}

export async function listSubAgents() {
  return apiRequest<SubAgentUser[]>('/agent/team', { auth: true });
}

export async function updateSubAgent(userId: string, data: UpdateSubAgentPayload) {
  return apiRequest<SubAgentUser>(`/agent/team/${userId}`, {
    method: 'PATCH',
    body: data,
    auth: true,
  });
}

export async function suspendSubAgent(userId: string) {
  return apiRequest<{ success: boolean }>(`/agent/team/${userId}/suspend`, {
    method: 'POST',
    auth: true,
  });
}

export async function reactivateSubAgent(userId: string) {
  return apiRequest<{ success: boolean }>(`/agent/team/${userId}/reactivate`, {
    method: 'POST',
    auth: true,
  });
}

export async function removeSubAgent(userId: string) {
  return apiRequest<{ success: boolean }>(`/agent/team/${userId}`, {
    method: 'DELETE',
    auth: true,
  });
}

export interface SubAgentDetail extends SubAgentUser {
  commissionRate: number;
  totalTransactions: number;
  recentBookings: Array<{
    id: string;
    type: 'flight' | 'hotel';
    status: string;
    amount: number;
    currency: string;
    createdAt: string;
  }>;
  recentAudit: Array<{
    action: string;
    entity: string;
    description: string;
    createdAt: string;
  }>;
}

export async function getSubAgentDetail(userId: string) {
  return apiRequest<SubAgentDetail>(`/agent/team/${userId}`, { auth: true });
}
