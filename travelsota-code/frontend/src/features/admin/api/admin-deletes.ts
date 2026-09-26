'use client';

// Central admin delete/bulk-delete API surface.
// Every call returns the number of rows deleted so toasts can show counts.

import { adminRequest } from '@/lib/api/admin-client';

export type DeleteScope = 'flight' | 'hotel' | 'all';

async function postBulk<T extends { deleted: number }>(path: string, ids: string[]): Promise<number> {
  const res = await adminRequest<T>(path, { method: 'POST', body: { ids } });
  return res?.deleted ?? ids.length;
}

export function deleteBookings(ids: string[], scope: DeleteScope = 'all') {
  return adminRequest<{ deleted: number }>('/admin/bookings/bulk-delete', {
    method: 'POST',
    body: { ids, type: scope },
  }).then((r) => r?.deleted ?? 0);
}

export function deleteInvoices(ids: string[]) {
  return postBulk('/admin/invoices/bulk-delete', ids);
}

export function deleteNotifications(ids: string[]) {
  return postBulk('/admin/notifications/delete', ids);
}

export function deleteAuditLogs(ids: string[]) {
  return postBulk('/admin/audit-logs/bulk-delete', ids);
}

export function deleteDemoLeads(ids: string[]) {
  return postBulk('/admin/demo-leads/bulk-delete', ids);
}
