'use client';

import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState, useCallback } from 'react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { useToast } from '@/hooks/useToast';
import {
  getAdminBookingExtras,
  retryFailedExtras,
  refundFailedExtras,
} from '@/features/admin/api/admin-flights';
import type { AdminExtrasResponse, AdminExtraItem } from '@/features/admin/api/admin-flights';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrency } from '@/lib/utils/currency';

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  selected: { label: 'Selected', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  quoted: { label: 'Quoted', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  payment_pending: { label: 'Payment Pending', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  payment_paid: { label: 'Paid', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  adding_to_supplier: { label: 'Adding...', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  refunded: { label: 'Refunded', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
};

function statusBadge(status: string) {
  const config = STATUS_BADGES[status] ?? { label: status, color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function AdminBookingExtrasPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const [extras, setExtras] = useState<AdminExtrasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchExtras = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminBookingExtras(bookingId);
      setExtras(data);
    } catch {
      toasts.error('Failed to load booking extras');
    } finally {
      setLoading(false);
    }
  }, [bookingId, toasts]);

  useEffect(() => {
    let cancelled = false;
    getAdminBookingExtras(bookingId)
      .then((data) => { if (!cancelled) setExtras(data); })
      .catch(() => { if (!cancelled) toasts.error('Failed to load booking extras'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bookingId, toasts]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!extras) return;
    if (selectedIds.size === extras.extras.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(extras.extras.map((e) => e.id)));
    }
  };

  const handleRetry = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toasts.info('No extras selected', 'Select extras to retry');
      return;
    }
    setActionLoading('retry');
    try {
      const result = await retryFailedExtras(bookingId, ids);
      toasts.success('Retry queued', result.summary);
      setSelectedIds(new Set());
      await fetchExtras();
    } catch {
      toasts.error('Retry failed', 'Could not queue extras for retry');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefund = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toasts.info('No extras selected', 'Select extras to refund');
      return;
    }
    setActionLoading('refund');
    try {
      const result = await refundFailedExtras(bookingId, ids, 'Admin-initiated refund');
      toasts.success('Refund processed', result.summary);
      setSelectedIds(new Set());
      await fetchExtras();
    } catch {
      toasts.error('Refund failed', 'Could not process refund');
    } finally {
      setActionLoading(null);
    }
  };

  const hasSelectedFailed = Array.from(selectedIds).some((id) => {
    const item = extras?.extras.find((e) => e.id === id);
    return item?.status === 'failed';
  });

  return (
    <RequirePagePermission permissions={[PermissionCode.BOOKINGS_READ]}>
      <div className="space-y-6">
        <div>
          <PageBreadcrumb pageTitle={`Booking Extras — ${bookingId.slice(0, 8)}...`} />
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage extras for this booking. Select failed extras to retry or refund.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            disabled={actionLoading !== null || selectedIds.size === 0 || !hasSelectedFailed}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'retry' ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            )}
            Retry Selected
          </button>
          <button
            type="button"
            onClick={handleRefund}
            disabled={actionLoading !== null || selectedIds.size === 0 || !hasSelectedFailed}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {actionLoading === 'refund' ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            )}
            Refund Selected
          </button>

          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-500 ml-2">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" />
          </div>
        )}

        {/* Extras table */}
        {!loading && extras && (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="min-w-[760px] w-full divide-y divide-border">
              <thead>
                <tr>
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={extras.extras.length > 0 && selectedIds.size === extras.extras.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300 text-primary focus:ring-ring dark:border-gray-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Label</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {extras.extras.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No extras found for this booking
                    </td>
                  </tr>
                ) : (
                  extras.extras.map((item: AdminExtraItem) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="rounded border-gray-300 text-primary focus:ring-ring dark:border-gray-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {item.type}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {item.label ?? '-'}
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(item.status)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {formatCurrency(item.amount, item.currency, decimalsMap)} {item.currency}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.supplierErrorMessage ? (
                          <span className="text-red-600 dark:text-red-400" title={item.supplierErrorMessage}>
                            {item.supplierErrorMessage.slice(0, 60)}
                            {item.supplierErrorMessage.length > 60 ? '...' : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty state when not loading */}
        {!loading && !extras && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 text-center dark:border-gray-700">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Could not load extras for this booking
            </p>
            <button
              type="button"
              onClick={fetchExtras}
              className="mt-3 text-sm text-primary hover:text-primary"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </RequirePagePermission>
  );
}

// Wrap in Suspense for useParams()
export default function AdminBookingExtrasPageWrapper() {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-primary" /></div>}>
      <AdminBookingExtrasPage />
    </Suspense>
  );
}
