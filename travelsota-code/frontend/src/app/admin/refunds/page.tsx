'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import {
  getAdminPendingRefunds,
  processRefund,
  type PendingRefundItem,
} from '@/features/admin/api/admin-refund';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { cn } from '@/lib/cn';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// CreditShell has no currency column (implicitly USD platform-wide, same as
// Wallet) — formatted consistently with the rest of the app.

// ─── Inline SVG Icons ─────────────────────────────────────

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}

function DollarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}


function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function HotelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7v14M21 7v14M6 11h4V7H6v4zM14 11h4V7h-4v4zM6 19h4v-4H6v4zM14 19h4v-4h-4v4z" />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────

// ─── Main Page ─────────────────────────────────────────────

export default function AdminRefundsPage() {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();
  const fmt = (n: number, currency?: string) =>
    formatCurrencyWithCode(n, currency ?? data?.totalCurrency ?? 'USD', decimalsMap);

  // ── State ──────────────────────────────────────────────
  const [confirmProcessId, setConfirmProcessId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  // ── Query ──────────────────────────────────────
  const { data, isPending, isFetching, refetch } = useQuery<{
    total: number;
    totalAmount: number;
    totalCurrency: string;
    items: PendingRefundItem[];
  }>({
    queryKey: ['admin', 'refunds', 'pending'],
    queryFn: () => getAdminPendingRefunds(),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // ── Process Refund Mutation ────────────────────────────
  const processMutation = useMutation({
    mutationFn: (shellId: string) => processRefund(shellId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'wallet'] });
      toasts.success(
        'Refund processed',
        `${formatCurrencyWithCode(result.refundedAmount, result.currency ?? data?.totalCurrency ?? 'USD', decimalsMap)} refunded to agent's wallet.`,
      );
      setConfirmProcessId(null);
    },
    onError: (err: any) => {
      toasts.error('Refund failed', err?.message ?? 'Unable to process refund.');
    },
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  // ── Render ─────────────────────────────────────────────
  if (isPending && !data) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Refund Management" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-80 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Refund Management"
        description="Review and process pending credit shell refunds."
        actions={
          <button
            onClick={() => refetch()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <RefreshIcon className="size-4" />
            Refresh
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 dark:bg-warning-900/20">
              <HistoryIcon className="size-5 text-warning-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data?.total ?? 0}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pending refunds</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal-50 dark:bg-brand-teal-900/20">
              <DollarIcon className="size-5 text-brand-teal-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {fmt(data?.totalAmount ?? 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total refundable amount</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 dark:bg-success-900/20">
              <WalletIcon className="size-5 text-success-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {items.filter((i) => new Date(i.expiresAt ?? '').getTime() > now).length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Not expired</p>
            </div>
          </div>
        </div>
      </div>

      {/* Refunds Queue */}
      <div className={cn('rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <CheckIcon className="size-10 text-gray-200 dark:text-gray-700" />
            <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No pending refunds</p>
            <p className="text-xs text-gray-400">
              Credit shells from cancelled bookings that need admin action will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {items.map((item) => {
              const isExpired = item.expiresAt && new Date(item.expiresAt).getTime() <= now;
              return (
                <div key={item.creditShellId} className="p-5 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        item.bookingType === 'flight'
                          ? 'bg-brand-teal-50 dark:bg-brand-teal-900/20'
                          : 'bg-purple-50 dark:bg-purple-900/20'
                      }`}>
                        {item.bookingType === 'flight'
                          ? <PlaneIcon className="size-5 text-brand-teal-500" />
                          : <HotelIcon className="size-5 text-purple-500" />
                        }
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                            {item.bookingType} · Booking #{item.bookingId.substring(0, 8)}
                          </p>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Agent: {item.agentName || item.agentEmail || 'Unknown'}
                          </span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-xs text-gray-500">
                            Created: {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {item.expiresAt && (
                          <p className={`mt-0.5 text-xs ${isExpired ? 'text-error-500' : 'text-gray-400'}`}>
                            {isExpired ? 'Expired: ' : 'Expires: '}
                            {new Date(item.expiresAt).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}
                            {!isExpired && ` (${Math.ceil((new Date(item.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))} days)`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        {fmt(item.remainingAmount, item.currency)}
                      </p>
                      <p className="text-xs text-gray-400">
                        of {fmt(item.originalAmount, item.currency)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setConfirmProcessId(item.creditShellId)}
                      disabled={isExpired || processMutation.isPending}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <WalletIcon className="size-3.5" />
                      Refund to Wallet
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Process Refund Modal */}
      {confirmProcessId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!processMutation.isPending) setConfirmProcessId(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-50 dark:bg-warning-900/20">
                <AlertTriangle className="size-5 text-warning-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Process Refund</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  This will convert the credit shell to cash and send it to the agent&apos;s wallet.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
              <p>This action cannot be undone. The credit shell will be marked as exhausted and the agent will receive the funds in their wallet.</p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setConfirmProcessId(null)}
                disabled={processMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => processMutation.mutate(confirmProcessId)}
                disabled={processMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
              >
                {processMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing…
                  </span>
                ) : (
                  'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
