import { adminRequest } from '@/lib/api/admin-client';
import { getPublicEnv } from '@/lib/env/env';
import type { PaginatedInvoiceList, GeneratedInvoiceDocument, InvoiceListItem, InvoiceListFilters, InvoiceStats } from './types';

export async function getAdminInvoices(filters?: InvoiceListFilters): Promise<PaginatedInvoiceList> {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.q) params.set('q', filters.q);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.userId) params.set('userId', filters.userId);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return adminRequest<PaginatedInvoiceList>(`/admin/invoices${qs ? `?${qs}` : ''}`);
}

export async function getAdminInvoice(id: string): Promise<GeneratedInvoiceDocument> {
  return adminRequest<GeneratedInvoiceDocument>(`/admin/invoices/${id}`);
}

export async function getInvoiceStats(): Promise<InvoiceStats> {
  return adminRequest<InvoiceStats>('/admin/invoices/stats');
}

export async function regenerateInvoice(id: string): Promise<GeneratedInvoiceDocument> {
  return adminRequest<GeneratedInvoiceDocument>(`/admin/invoices/${id}/regenerate`, { method: 'POST' });
}

export async function voidInvoice(id: string, reason: string): Promise<{ success: boolean }> {
  return adminRequest<{ success: boolean }>(`/admin/invoices/${id}/void`, { method: 'POST', body: { reason } });
}

export async function sendInvoiceEmail(id: string): Promise<{ success: boolean }> {
  return adminRequest<{ success: boolean }>(`/admin/invoices/${id}/email`, { method: 'POST' });
}

export async function createCreditNote(data: {
  bookingId: string;
  originalInvoiceId: string;
  reason?: string;
  refundAmount?: number;
}): Promise<GeneratedInvoiceDocument> {
  return adminRequest<GeneratedInvoiceDocument>('/admin/invoices/credit-note', { method: 'POST', body: data });
}

export function getAdminInvoicePreviewUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/admin/invoices/${id}/preview`;
}

export function getAdminInvoicePdfUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/admin/invoices/${id}/pdf`;
}

export async function getAdminCreditNotes(invoiceId: string): Promise<InvoiceListItem[]> {
  return adminRequest<InvoiceListItem[]>(`/admin/invoices/${invoiceId}/credit-notes`);
}

export function getAdminInvoiceExportUrl(filters?: InvoiceListFilters): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.fromDate) params.set('fromDate', filters.fromDate);
  if (filters?.toDate) params.set('toDate', filters.toDate);
  const qs = params.toString();
  return `${base}/admin/invoices/export${qs ? `?${qs}` : ''}`;
}
