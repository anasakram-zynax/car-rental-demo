import { getPublicEnv } from '@/lib/env/env';

function apiUrl(path: string): string {
  const base = getPublicEnv().NEXT_PUBLIC_API_BASE_URL.replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function getVoucherUrl(bookingId: string): string {
  return apiUrl(`/agent/bookings/${bookingId}/voucher`);
}

export function getInvoiceUrl(bookingId: string): string {
  return apiUrl(`/agent/bookings/${bookingId}/invoice`);
}

export function downloadVoucher(bookingId: string): void {
  window.open(getVoucherUrl(bookingId), '_blank', 'noopener,noreferrer');
}

export function downloadInvoice(bookingId: string): void {
  window.open(getInvoiceUrl(bookingId), '_blank', 'noopener,noreferrer');
}
