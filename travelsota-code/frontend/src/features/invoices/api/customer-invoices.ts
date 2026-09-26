import { apiRequest } from '@/lib/api/client';
import { getPublicEnv } from '@/lib/env/env';
import type { PaginatedInvoiceList, GeneratedInvoiceDocument, InvoiceListFilters, InvoiceListItem } from './types';

export async function getCustomerInvoices(filters?: InvoiceListFilters): Promise<PaginatedInvoiceList> {
  const params = new URLSearchParams();
  if (filters?.page) params.set('page', String(filters.page));
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.status) params.set('status', filters.status);
  if (filters?.bookingType) params.set('bookingType', filters.bookingType);
  if (filters?.q) params.set('q', filters.q);
  const qs = params.toString();
  return apiRequest<PaginatedInvoiceList>(`/invoices${qs ? `?${qs}` : ''}`, { auth: true });
}

export async function getCustomerInvoice(id: string): Promise<GeneratedInvoiceDocument> {
  return apiRequest<GeneratedInvoiceDocument>(`/invoices/${id}`, { auth: true });
}

export async function getCustomerInvoiceByBooking(bookingId: string): Promise<GeneratedInvoiceDocument> {
  return apiRequest<GeneratedInvoiceDocument>(`/invoices/by-booking/${bookingId}`, { auth: true });
}

export async function getCustomerCreditNotes(invoiceId: string): Promise<InvoiceListItem[]> {
  return apiRequest<InvoiceListItem[]>(`/invoices/${invoiceId}/credit-notes`, { auth: true });
}

export function getCustomerInvoicePreviewUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/invoices/${id}/preview`;
}

export function getCustomerInvoicePdfUrl(id: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}/invoices/${id}/pdf`;
}
