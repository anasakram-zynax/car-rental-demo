import { apiRequest } from '@/lib/api/client';
import { getPublicEnv } from '@/lib/env/env';
import type { PaginatedInvoiceList, GeneratedInvoiceDocument, InvoiceListFilters } from './types';

export async function getAgentInvoices(filters?: InvoiceListFilters): Promise<PaginatedInvoiceList> {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.q) params.set('q', filters.q);
  const qs = params.toString();
  return apiRequest<PaginatedInvoiceList>(`/agent/invoices${qs ? `?${qs}` : ''}`, { auth: true });
}

export async function getAgentInvoice(id: string): Promise<GeneratedInvoiceDocument> {
  return apiRequest<GeneratedInvoiceDocument>(`/agent/invoices/${id}`, { auth: true });
}

export function getAgentInvoicePreviewUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/agent/invoices/${id}/preview`;
}

export function getAgentInvoicePdfUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/agent/invoices/${id}/pdf`;
}
