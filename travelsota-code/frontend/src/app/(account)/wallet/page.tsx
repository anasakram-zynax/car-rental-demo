'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getCustomerWalletBalance,
  getCustomerWalletTransactions,
  getMyCustomerTopupRequests,
  listCustomerWithdrawals,
  cancelCustomerWithdrawal,
  type CustomerWalletBalance,
  type CustomerPaginatedTransactions,
} from '@/features/wallet/api/customer-wallet';
import { TopUpModal } from '@/features/wallet/components/TopUpModal';
import { WithdrawModal } from '@/features/wallet/components/WithdrawModal';
import { ModalErrorBoundary } from '@/features/wallet/components/ModalErrorBoundary';
import { useToast } from '@/hooks/useToast';
import { WalletIcon, ArrowUpIcon, HistoryIcon, RefreshIcon } from '@/components/agent/AgentIcons';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; bg: string; text: string; dot: string }> = {
    deposit: {
      label: 'Deposit',
      bg: 'bg-success-50 dark:bg-success-900/20',
      text: 'text-success-700 dark:text-success-400',
      dot: 'bg-success-500',
    },
    deduct: {
      label: 'Deduction',
      bg: 'bg-error-50 dark:bg-error-900/20',
      text: 'text-error-700 dark:text-error-400',
      dot: 'bg-error-500',
    },
  };
  const c = config[type] ?? {
    label: type.replace(/_/g, ' '),
    bg: 'bg-gray-50 dark:bg-gray-800',
    text: 'text-gray-600 dark:text-gray-400',
    dot: 'bg-gray-400',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function TopupStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const isPending = s.includes('pend');
  const isApproved = s.includes('approv') || s.includes('complet') || s.includes('success');
  const cls = isPending
    ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400'
    : isApproved
      ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'
      : 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400';
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {isPending ? 'Pending' : isApproved ? 'Approved' : 'Rejected'}
    </span>
  );
}

export default function CustomerWalletPage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [txnPage, setTxnPage] = useState(1);
  const [topupDone, setTopupDone] = useState(false);

  // ponytail: read ?topup=success without useSearchParams (no Suspense needed)
  useEffect(() => {
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('topup') === 'success') {
      setTopupDone(true);
      router.replace('/wallet');
    }
  }, [router]);

  const {
    data: balance,
    isPending: balanceLoading,
    refetch: refetchBalance,
  } = useQuery<CustomerWalletBalance>({
    queryKey: ['customer', 'wallet', 'balance'],
    queryFn: getCustomerWalletBalance,
    refetchInterval: (query) => (query.state.data && document.hidden ? false : 15000),
  });

  const { data: transactions, isPending: txnLoading } = useQuery<CustomerPaginatedTransactions>({
    queryKey: ['customer', 'wallet', 'transactions', txnPage],
    queryFn: () => getCustomerWalletTransactions({ page: txnPage, limit: 15 }),
  });

  const { data: topupRequests } = useQuery({
    queryKey: ['customer', 'wallet', 'topup-requests'],
    queryFn: getMyCustomerTopupRequests,
  });

  const { data: withdrawals, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['customer', 'wallet', 'withdrawals'],
    queryFn: listCustomerWithdrawals,
  });

  const cancelWithdrawalMutation = useMutation({
    mutationFn: (id: string) => cancelCustomerWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', 'wallet'] });
      refetchWithdrawals();
      toasts.success('Withdrawal cancelled', 'Locked funds released back to your wallet.');
    },
    onError: (err: unknown) => toasts.error('Cancel failed', err instanceof Error ? err.message : 'Request may already be handled.'),
  });

  const walletCurrency = balance?.currency ?? 'USD';
  const fmt = (n: number, currency: string = walletCurrency) => formatCurrencyWithCode(n, currency, decimalsMap);

  if (balanceLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        <div className="h-36 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Wallet</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Prepaid funds for faster checkout — top up, track requests and history
          </p>
        </div>
        <button
          onClick={() => { refetchBalance(); queryClient.invalidateQueries({ queryKey: ['customer', 'wallet', 'transactions'] }); queryClient.invalidateQueries({ queryKey: ['customer', 'wallet', 'withdrawals'] }); }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
        >
          <RefreshIcon className="size-4" />
          Refresh
        </button>
      </div>

      {topupDone && (
        <div className="flex items-start gap-3 rounded-2xl border border-success-200 bg-success-50 p-4 dark:border-success-800/50 dark:bg-success-950/20">
          <div>
            <p className="text-sm font-semibold text-success-800 dark:text-success-300">Top-up successful</p>
            <p className="mt-0.5 text-xs text-success-600 dark:text-success-400">
              Your wallet has been credited. The new balance is shown below.
            </p>
          </div>
        </div>
      )}

      {/* ── Balance + Add Funds ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-500 to-brand-700 p-6 dark:border-brand-800">
          <div className="absolute right-0 top-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full bg-white/10" />
          <div className="absolute bottom-0 left-0 h-24 w-24 -translate-x-6 translate-y-6 rounded-full bg-white/5" />
          <div className="relative z-10">
              <div className="flex items-center gap-2 text-white/80">
                <WalletIcon className="size-5" />
                <span className="text-sm font-medium">Wallet Balance</span>
              </div>
            <p className="mt-2 text-3xl font-bold text-white">
              {fmt(balance?.walletBalance ?? 0)}
            </p>
            <p className="mt-1 text-xs text-white/60">Available in your wallet</p>
          </div>
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Top-Up</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Top up by card or PayPal for instant credit, or request an offline top-up after a bank transfer.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => setShowTopUp(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-600 active:scale-[0.98]"
            >
              <ArrowUpIcon className="size-4" />
              Top-Up
            </button>
            <button
              onClick={() => setShowWithdraw(true)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* ── Own top-up requests ── */}
      {topupRequests && topupRequests.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Top-up requests</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Offline requests are credited after admin approval. Card payments above credit instantly.
          </p>
          <div className="mt-3 space-y-2">
            {topupRequests.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm dark:bg-gray-800">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{fmt(r.amount, r.currency)}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{r.description ?? 'Top-up request'}{r.reference ? ` · ${r.reference}` : ''}</p>
                </div>
                <TopupStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Top-Up Modal (online + offline) ── */}
      <ModalErrorBoundary>
        <TopUpModal open={showTopUp} onClose={() => setShowTopUp(false)} mode="customer" walletCurrency={walletCurrency} />
      </ModalErrorBoundary>
      <ModalErrorBoundary>
        <WithdrawModal
        open={showWithdraw}
        onClose={() => setShowWithdraw(false)}
        mode="customer"
        pool="wallet"
        walletBalance={balance?.walletBalance ?? 0}
        walletCurrency={walletCurrency}
        onSuccess={() => refetchWithdrawals()}
      />
      </ModalErrorBoundary>

      {/* ── Withdrawal requests ── */}
      {withdrawals && withdrawals.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Withdrawal requests</h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Requested amounts stay locked until admin approves or rejects.
          </p>
          <div className="mt-3 space-y-2">
            {withdrawals.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3.5 py-2.5 text-sm dark:bg-gray-800">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{fmt(r.amount, r.currency)}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={r.description ?? r.reference ?? undefined}>{r.reference ?? 'Withdrawal'}{r.description ? ` · ${r.description}` : ''}{r.paymentId ? ` · ref ${r.paymentId}` : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'pending' ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400' : r.status === 'approved' ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : r.status === 'cancelled' ? 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' : 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'}`}>
                    {r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : r.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
                  </span>
                  {r.status === 'pending' && (
                    <button
                      onClick={() => cancelWithdrawalMutation.mutate(r.id)}
                      disabled={cancelWithdrawalMutation.isPending}
                      className="cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction History ── */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <HistoryIcon className="size-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Transaction History</h2>
            {transactions && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                {transactions.total}
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          {txnLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : !transactions || transactions.items.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <HistoryIcon className="size-10 text-gray-200 dark:text-gray-700" />
              <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No transactions found</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Your transactions will appear here</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-gray-800/50">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Description</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Amount</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Balance</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                {transactions.items.map((txn) => (
                  <tr key={txn.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="px-5 py-3.5">
                      <TransactionTypeBadge type={txn.type} />
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3.5 text-gray-700 dark:text-gray-300">
                      <span className="truncate">{txn.description ?? '—'}</span>
                      {txn.reference && (
                        <span className="ml-1.5 text-[11px] text-gray-400" title={txn.reference}>#{txn.reference.length > 12 ? txn.reference.slice(0, 8) + '…' : txn.reference}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium tabular-nums">
                      <span className={txn.amount >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}>
                        {txn.amount >= 0 ? '+' : ''}{fmt(Math.abs(txn.amount), txn.currency ?? walletCurrency)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                      {fmt(txn.balanceAfter, txn.currency ?? walletCurrency)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-right text-xs text-gray-400">
                      {new Date(txn.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {transactions && transactions.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
            <p className="text-xs text-gray-400">
              Page {txnPage} of {transactions.totalPages} ({transactions.total} transactions)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                disabled={txnPage <= 1}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Previous
              </button>
              <button
                onClick={() => setTxnPage((p) => Math.min(transactions.totalPages, p + 1))}
                disabled={txnPage >= transactions.totalPages}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
