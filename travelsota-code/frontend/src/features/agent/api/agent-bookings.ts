import { apiRequest } from '@/lib/api/client';

export interface MarkedUpOffer {
  originalPrice: number;
  markedUpPrice: number;
  markupPercent: number;
  appliedRules: Array<{ name: string; markupAmount: number }>;
  offer: any;
}

export interface AgentBookingItem {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  from?: string;
  to?: string;
  passengerName?: string;
  customerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentBookingDetail {
  id: string;
  type: 'flight' | 'hotel';
  status: string;
  amount: number | null;
  currency: string | null;
  ref: string | null;
  locatorCode?: string | null;
  provider: string;
  offerSnapshot?: any;
  travelerSnapshot?: any;
  holder?: any;
  paxes?: any;
  hotel?: any;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedAgentBookings {
  items: AgentBookingItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AgentBookingFilters {
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  fromDate?: string;
  toDate?: string;
}

export function getAgentBookings(filters?: AgentBookingFilters) {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.type) params.set('type', filters.type);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return apiRequest<PaginatedAgentBookings>(`/agent/bookings${qs ? `?${qs}` : ''}`, { auth: true });
}

export function getAgentBookingDetail(id: string) {
  return apiRequest<AgentBookingDetail | { message: string }>(`/agent/bookings/${id}`, { auth: true });
}

export interface CancelBookingResponse {
  booking: any;
  refundAmount: number;
  cancellationFee: number;
  creditShellId?: string;
  modificationRequestId: string;
}

export function cancelAgentBooking(id: string, reason?: string) {
  return apiRequest<CancelBookingResponse>(`/agent/bookings/${id}/cancel`, {
    method: 'PATCH',
    body: { reason },
    auth: true,
  });
}

export interface ModifyBookingResponse {
  modificationRequestId: string;
  booking: any;
  message: string;
}

export function modifyAgentBooking(id: string, data: {
  type: string;
  reason?: string;
  newValue?: any;
}) {
  return apiRequest<ModifyBookingResponse>(`/agent/bookings/${id}/modify`, {
    method: 'PATCH',
    body: data,
    auth: true,
  });
}
