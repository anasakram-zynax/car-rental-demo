import { adminRequest } from '@/lib/api/admin-client';

export interface DiagnosticStep {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
}

export interface DiagnosticResult {
  ok: boolean;
  summary: string;
  steps: DiagnosticStep[];
  configSanitized: {
    hasConfig: boolean;
    baseUrl?: string;
    pcc?: string;
    accessGroupConfigured?: boolean;
  };
}

export function runTravelportDiagnostics() {
  return adminRequest<DiagnosticResult>('/admin/flights/diagnostics/travelport');
}

export interface AdminExtraItem {
  id: string;
  type: string;
  status: string;
  label?: string;
  amount: number;
  currency: string;
  supplierErrorCode?: string;
  supplierErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminExtrasResponse {
  ok: boolean;
  bookingId: string;
  totalExtras: number;
  extras: AdminExtraItem[];
  message?: string;
}

export function getAdminBookingExtras(bookingId: string) {
  return adminRequest<AdminExtrasResponse>(`/admin/flights/bookings/${bookingId}/extras`);
}

export interface AdminExtrasActionResponse {
  ok: boolean;
  bookingId: string;
  results: Array<{ id: string; ok: boolean; error?: string }>;
  summary: string;
}

export function retryFailedExtras(bookingId: string, extraIds: string[]) {
  return adminRequest<AdminExtrasActionResponse>(
    `/admin/flights/bookings/${bookingId}/extras/retry`,
    { method: 'POST', body: { extraIds } },
  );
}

export function refundFailedExtras(bookingId: string, extraIds: string[], reason?: string) {
  return adminRequest<AdminExtrasActionResponse>(
    `/admin/flights/bookings/${bookingId}/extras/refund`,
    { method: 'POST', body: { extraIds, reason } },
  );
}
