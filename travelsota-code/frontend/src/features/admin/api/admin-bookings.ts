import { adminRequest } from '@/lib/api/admin-client';
import { apiRequest } from '@/lib/api/client';

// ─── Types ───────────────────────────────────────────────────────

export interface AgentBookingFeedItem {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  agent: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  from?: string;
  to?: string;
  passengerName?: string;
  createdAt: string;
}

export interface PaginatedAgentBookingFeed {
  items: AgentBookingFeedItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BookingFinancialSummary {
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  refundedAmount: number;
  cancellationFee: number;
  walletTransactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
  commissionRecords: Array<{
    id: string;
    commissionAmount: number;
    rate: number;
    rateType: string;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  modificationHistory: Array<{
    id: string;
    type: string;
    status: string;
    reason: string | null;
    refundAmount: number | null;
    cancellationFee: number | null;
    creditShellId: string | null;
    createdAt: string;
  }>;
  creditShells: Array<{
    id: string;
    originalAmount: number;
    remainingAmount: number;
    status: string;
    expiresAt: string | null;
  }>;
}

export interface AdminBookingCancelResponse {
  booking: any;
  refundAmount: number;
  cancellationFee: number;
  creditShellId?: string;
  modificationRequestId: string;
}

// ─── API Functions ───────────────────────────────────────────────

export function getAdminAgentBookingFeed(filters?: {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  agentId?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.agentId) params.set('agentId', filters.agentId);
  const qs = params.toString();
  return adminRequest<PaginatedAgentBookingFeed>(`/admin/agent-bookings${qs ? `?${qs}` : ''}`);
}

export function getAdminBookingFinancialSummary(bookingId: string) {
  return adminRequest<BookingFinancialSummary | { message: string }>(
    `/admin/agent-bookings/${bookingId}/financial-summary`,
  );
}

export function adminCancelBooking(bookingId: string, reason?: string) {
  return adminRequest<AdminBookingCancelResponse>(`/admin/bookings/${bookingId}/cancel`, {
    method: 'POST',
    body: { reason },
  });
}

export interface AdminCancelEstimateResponse {
  bookingId: string;
  bookingType: 'flight' | 'hotel';
  status: string;
  totalAmount: number;
  currency: string;
  cancellationFee: number;
  refundAmount: number;
  refundType: string;
  isFreeCancellation: boolean;
  policyDescription: string | null;
  upcomingFee?: number;
  upcomingFeeFrom?: string;
  upcomingFeeDescription?: string | null;
}

export function getAdminCancelEstimate(bookingId: string) {
  return adminRequest<AdminCancelEstimateResponse>(`/admin/bookings/${bookingId}/cancel-estimate`);
}

export interface AdminIssueResponse {
  ok: boolean;
  bookingId: string;
  status?: string;
  locatorCode?: string | null;
}

/** Manual issue for held/pending flight bookings (bank-transfer / pay-later). */
export function adminIssueBooking(bookingId: string) {
  return adminRequest<AdminIssueResponse>(`/admin/bookings/${bookingId}/issue`, {
    method: 'POST',
    // Supplier ticketing (reprice + workbench + ticket) can take minutes on
    // stale holds — the default 60s client timeout aborts it as "fetch failed".
    timeoutMs: 300000,
  });
}

/** Void a ticketed booking (Travelport; pre-issue reversal). */
export function adminVoidBooking(bookingId: string, reason?: string) {
  return apiRequest<{ ok: boolean; status?: string; message?: string }>(
    `/flights/bookings/${bookingId}/void`,
    { method: 'POST', auth: true, body: { reason } },
  );
}

/** Request a refund on a cancelled booking. */
export function adminRefundRequest(bookingId: string, reason?: string) {
  return apiRequest<{ ok: boolean; message?: string }>(
    `/flights/bookings/${bookingId}/refund-request`,
    { method: 'POST', auth: true, body: { reason } },
  );
}
