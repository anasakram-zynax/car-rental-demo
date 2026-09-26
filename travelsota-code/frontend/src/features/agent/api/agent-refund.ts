import { apiRequest } from '@/lib/api/client';

// ─── Types ───────────────────────────────────────────────────────

export interface RefundEstimate {
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  status: string;
  totalAmount: number;
  currency: string;
  cancellationFee: number;
  feeType: string;
  feeDescription: string;
  netRefund: number;
  refundType: 'credit_shell' | 'wallet';
  isFreeCancellation: boolean;
}

export interface CreditShellItem {
  id: string;
  bookingId: string;
  bookingType: 'flight' | 'hotel' | string;
  originalAmount: number;
  remainingAmount: number;
  currency: string;
  status: 'active' | 'partially_used' | 'exhausted' | 'used' | 'expired' | 'cancelled';
  expiresAt: string | null;
  createdAt: string;
}

export interface PaginatedCreditShells {
  items: CreditShellItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UseCreditShellResponse {
  success: boolean;
  amountUsed: number;
  remainingAmount: number;
  message: string;
}

// ─── API Functions ───────────────────────────────────────────────

export function getRefundPreview(bookingId: string) {
  return apiRequest<RefundEstimate>(`/agent/bookings/${bookingId}/cancel/preview`, {
    method: 'POST',
    auth: true,
  });
}

export function getAgentCreditShells(filters?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return apiRequest<PaginatedCreditShells>(`/agent/credit-shells${qs ? `?${qs}` : ''}`, { auth: true });
}

export function useCreditShell(shellId: string, data: {
  amount: number;
  newBookingId?: string;
}) {
  return apiRequest<UseCreditShellResponse>(`/agent/credit-shells/${shellId}/use`, {
    method: 'POST',
    body: data,
    auth: true,
  });
}
