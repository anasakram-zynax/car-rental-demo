import { adminRequest } from '@/lib/api/admin-client';

// ─── Types ───────────────────────────────────────────────────────

export interface PendingRefundItem {
  creditShellId: string;
  agentName: string | null;
  agentEmail: string | null;
  bookingId: string;
  bookingType: string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface PendingRefundsResponse {
  items: PendingRefundItem[];
  total: number;
  totalAmount: number;
  totalCurrency: string;
}

export interface ProcessRefundResponse {
  creditShellId: string;
  refundedAmount: number;
  remainingAfter: number;
  currency: string;
}

// ─── API Functions ───────────────────────────────────────────────

export function getAdminPendingRefunds() {
  return adminRequest<PendingRefundsResponse>('/admin/refunds/pending');
}

export function processRefund(creditShellId: string) {
  return adminRequest<ProcessRefundResponse>(`/admin/refunds/${creditShellId}/process`, {
    method: 'POST',
  });
}
