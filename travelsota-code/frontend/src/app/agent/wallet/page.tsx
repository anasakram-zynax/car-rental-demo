'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet, CreditCard, Gauge, RefreshCw, Plus, ArrowUpFromLine, History } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import {
  getWalletBalance,
  getWalletTransactions,
  repayCredit,
  getMyTopupRequests,
  listWalletWithdrawals,
  cancelWalletWithdrawal,
  type WalletBalance,
  type PaginatedTransactions,
} from '@/features/wallet/api/agent-wallet';
import { TopUpModal } from '@/features/wallet/components/TopUpModal';
import { WithdrawModal } from '@/features/wallet/components/WithdrawModal';
import { ModalErrorBoundary } from '@/features/wallet/components/ModalErrorBoundary';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminCardsSkeleton, AdminTableSkeleton } from '@/components/admin/shared/AdminSkeletons';
import { DashboardCard, DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// Wallet figures are denominated in the agent's wallet currency (backend
// WalletBalance.currency) — never a hardcoded USD.

// ─── Transaction Type Badge ────────────────────────────────

function TransactionTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; cls: string; dot: string }> = {
    deposit: {
      label: 'Deposit',
      cls: 'bg-success-500/10 text-success-700 dark:text-success-400',
      dot: 'bg-success-500',
    },
    deduct: {
      label: 'Deduction',
      cls: 'bg-error-500/10 text-error-700 dark:text-error-400',
      dot: 'bg-error-500',
    },
    credit_used: {
      label: 'Credit Used',
      cls: 'bg-warning-500/10 text-warning-700 dark:text-warning-400',
      dot: 'bg-warning-500',
    },
    credit_repayment: {
      label: 'Credit Payment',
      cls: 'bg-brand-teal-500/10 text-brand-teal-700 dark:text-brand-teal-400',
      dot: 'bg-brand-teal-500',
    },
  };
  const c = config[type] ?? {
    label: type.replace(/_/g, ' '),
    cls: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.cls}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────

export default function AgentWalletPage() {
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { decimalsMap } = useCurrencyData();

  // ── State ──────────────────────────────────────────────
  const [showTopUp, setShowTopUp] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showRepay, setShowRepay] = useState(false);
  const [repayAmount, setRepayAmount] = useState('');
  const [txnPage, setTxnPage] = useState(1);
  const [txnType, setTxnType] = useState('');
  const [txnSearch, setTxnSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Queries ────────────────────────────────────────────
  const {
    data: balance,
    isPending: balanceLoading,
    refetch: refetchBalance,
  } = useQuery<WalletBalance>({
    queryKey: ['agent', 'wallet', 'balance'],
    queryFn: getWalletBalance,
    refetchInterval: (query) => query.state.data && document.hidden ? false : 15000,
  });

  const {
    data: transactions,
    isPending: txnLoading,
  } = useQuery<PaginatedTransactions>({
    queryKey: ['agent', 'wallet', 'transactions', txnPage, txnType, txnSearch, dateFrom, dateTo],
    queryFn: () =>
      getWalletTransactions({
        page: txnPage,
        // When searching, fetch more records so client-side filter has full dataset
        limit: txnSearch.trim() ? 1000 : 15,
        type: txnType || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      }),
  });

  // ── Mutations ──────────────────────────────────────────
  const walletCurrency = balance?.currency ?? 'USD';
  const fmt = (n: number, currency: string = walletCurrency) => formatCurrencyWithCode(n, currency, decimalsMap);

  // ponytail: memoized so CountUp does not re-arm mid-count on every render.
  const fmtMoney = useMemo(
    () => (n: number) => formatCurrencyWithCode(n, walletCurrency, decimalsMap),
    [walletCurrency, decimalsMap],
  );
  const fmtPct = useMemo(() => (n: number) => `${n}%`, []);

  const repayMutation = useMutation({
    mutationFn: (amount: number) => repayCredit(amount),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'wallet'] });
      setShowRepay(false);
      setRepayAmount('');
      toasts.success('Credit repaid', res.message);
    },
    onError: () => toasts.error('Repayment failed', 'Could not repay credit. Please check your wallet balance and try again.'),
  });

  // ── Offline top-up requests (bank transfer / cash → admin approval) ──
  const { data: topupRequests } = useQuery({
    queryKey: ['agent', 'wallet', 'topup-requests'],
    queryFn: getMyTopupRequests,
  });

  // ── Withdrawal requests (funds locked until admin decision) ──
  const { data: withdrawals, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['agent', 'wallet', 'withdrawals'],
    queryFn: listWalletWithdrawals,
  });

  const cancelWithdrawalMutation = useMutation({
    mutationFn: (id: string) => cancelWalletWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'wallet'] });
      refetchWithdrawals();
      toasts.success('Withdrawal cancelled', 'Locked funds released back to your wallet.');
    },
    onError: (err: unknown) => toasts.error('Cancel failed', err instanceof Error ? err.message : 'Request may already be handled.'),
  });

  // ── Derived ────────────────────────────────────────────
  const showWarning = balance && balance.utilizationPercent >= 80 && balance.creditLimit > 0;

  const filteredTxns = useMemo(() => {
    if (!transactions?.items) return [];
    if (!txnSearch.trim()) return transactions.items;
    const q = txnSearch.toLowerCase();
    return transactions.items.filter(
      (t) =>
        t.description?.toLowerCase().includes(q) ||
        t.reference?.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q),
    );
  }, [transactions, txnSearch]);

  // ── Render ─────────────────────────────────────────────
  if (balanceLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Wallet" description="Manage your funds, credit, and transaction history." />
        <AdminCardsSkeleton count={3} />
        <AdminTableSkeleton rows={6} columns={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Wallet"
        description="Manage your funds, credit, and transaction history."
        actions={
          <button
            onClick={() => { refetchBalance(); queryClient.invalidateQueries({ queryKey: ['agent', 'wallet', 'transactions'] }); }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RefreshCw className="size-4" />
            Refresh
          </button>
        }
      />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardOverviewCardV2
          title="Wallet Balance"
          period="Prepaid funds ready to spend"
          icon={<Wallet />}
          data={{ value: balance?.walletBalance, format: fmtMoney }}
          cacheKey="agent-wallet-balance"
          capValue={5000}
        />
        <DashboardOverviewCardV2
          title="Credit Available"
          period={balance?.creditLimit ? `Of ${fmt(balance.creditLimit)} limit` : 'Extra spending room'}
          icon={<CreditCard />}
          data={{ value: balance?.creditAvailable, format: fmtMoney }}
          cacheKey="agent-credit-available"
          capValue={5000}
        />
        <DashboardOverviewCardV2
          title="Utilization"
          period="Share of credit line in use"
          icon={<Gauge />}
          data={{ value: balance?.utilizationPercent, format: fmtPct }}
          cacheKey="agent-credit-utilization"
          capValue={100}
        />
      </div>

      {/* ── Low Balance Warning Banner ──────────────────── */}
      {balance && balance.walletBalance > 0 && balance.walletBalance < 50 && (
        <div className="flex items-start gap-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-4">
          <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning-500" />
          <div>
            <p className="text-sm font-semibold text-warning-700 dark:text-warning-400">Low Wallet Balance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your wallet balance is {fmt(balance.walletBalance)}. Consider topping up to avoid
              interruptions when making bookings.
            </p>
            <button
              onClick={() => setShowTopUp(true)}
              className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-warning-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            >
              <ArrowUpFromLine className="size-3.5" />
              Top Up Now
            </button>
          </div>
        </div>
      )}

      {/* ── Auto-suspension Warning Banner ──────────────── */}
      {showWarning && (
        <div className="flex items-start gap-3 rounded-xl border border-error-500/30 bg-error-500/10 p-4">
          <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-error-500" />
          <div>
            <p className="text-sm font-semibold text-error-700 dark:text-error-400">
              Credit Utilization High — {balance!.utilizationPercent}%
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Your credit utilization has exceeded 80%. If it reaches your auto-suspend threshold, your account
              may be suspended. Consider repaying credit or requesting a limit increase.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md border border-error-500/30 bg-error-500/10 px-2 py-1 text-[11px] font-medium text-error-700 dark:text-error-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-error-500" />
                {fmt(balance!.creditUsed ?? 0)} used of {fmt(balance!.creditLimit ?? 0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Up & Withdraw actions ───────────────────── */}
      <DashboardCard
        title="Top-up & Withdraw"
        period="Add funds (card, PayPal, bank, pay later) or withdraw to your payout method"
        contentClassName="justify-start gap-y-4 px-6 pb-6"
      >
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowTopUp(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-700"
          >
            <Plus className="size-4" />
            Top-Up
          </button>
          <button
            onClick={() => setShowWithdraw(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
          >
            Withdraw
          </button>
          {balance && balance.creditUsed > 0 && (
            <button
              onClick={() => {
                // Default to the smaller of used credit and wallet balance —
                // the backend rejects repayments larger than the wallet.
                setRepayAmount(Math.min(balance.creditUsed, balance.walletBalance).toFixed(2));
                setShowRepay(true);
              }}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-card-foreground transition-colors hover:bg-muted"
            >
              Repay credit ({fmt(balance.creditUsed)})
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Card payments credit instantly. Offline top-ups and withdrawals need admin approval. Repaying credit moves wallet funds to clear used credit immediately.
        </p>
      </DashboardCard>

      {/* ── Requests (top-ups + withdrawals) ────────────── */}
      <DashboardCard
        title="Top-up & Withdrawal Requests"
        period="Offline top-ups credit after approval — withdrawals stay locked until decided"
        contentClassName="justify-start gap-y-4 px-6 pb-6"
      >
        {/* Pending top-up requests */}
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top-up requests</h3>
          {!topupRequests || topupRequests.length === 0 ? (
            <p className="mt-2 text-xs italic text-muted-foreground">No top-up requests yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {topupRequests.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-foreground">{fmt(r.amount, r.currency)}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.description ?? 'Top-up request'}{r.reference ? ` · ${r.reference}` : ''}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'pending' ? 'bg-warning-500/10 text-warning-700 dark:text-warning-400' : r.status === 'completed' ? 'bg-success-500/10 text-success-700 dark:text-success-400' : 'bg-muted text-muted-foreground'}`}>
                    {r.status === 'pending' ? 'Pending approval' : r.status === 'completed' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Withdrawal requests */}
        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-foreground">Withdrawal requests</h3>
          {!withdrawals || withdrawals.length === 0 ? (
            <p className="mt-2 text-xs italic text-muted-foreground">No withdrawal requests yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {withdrawals.slice(0, 5).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-foreground">{fmt(r.amount, r.currency)}</p>
                    <p className="truncate text-xs text-muted-foreground" title={r.description ?? r.reference ?? undefined}>{r.reference ?? 'Withdrawal'}{r.description ? ` · ${r.description}` : ''}{r.paymentId ? ` · ref ${r.paymentId}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'pending' ? 'bg-warning-500/10 text-warning-700 dark:text-warning-400' : r.status === 'approved' ? 'bg-success-500/10 text-success-700 dark:text-success-400' : r.status === 'cancelled' ? 'bg-muted text-muted-foreground' : 'bg-error-500/10 text-error-700 dark:text-error-400'}`}>
                      {r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : r.status === 'cancelled' ? 'Cancelled' : 'Rejected'}
                    </span>
                    {r.status === 'pending' && (
                      <button
                        onClick={() => cancelWithdrawalMutation.mutate(r.id)}
                        disabled={cancelWithdrawalMutation.isPending}
                        className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DashboardCard>

      {/* ── Top-Up Modal (online + offline) ─────────────── */}
      <ModalErrorBoundary>
        <TopUpModal open={showTopUp} onClose={() => setShowTopUp(false)} mode="agent" walletCurrency={walletCurrency} />
      </ModalErrorBoundary>
      <ModalErrorBoundary>
        <WithdrawModal
          open={showWithdraw}
          onClose={() => setShowWithdraw(false)}
          mode="agent"
          pool="wallet"
          walletBalance={balance?.walletBalance ?? 0}
          walletCurrency={walletCurrency}
          onSuccess={() => refetchWithdrawals()}
        />
      </ModalErrorBoundary>

      {/* ── Repay Credit Modal ───────────────────────────── */}
      {showRepay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setShowRepay(false); setRepayAmount(''); }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Repay Credit</h3>
              <button
                onClick={() => { setShowRepay(false); setRepayAmount(''); }}
                className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Move funds from your wallet balance to clear your used credit. This restores your
              available credit immediately.
            </p>

            <div className="mt-4 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              Used credit: <span className="font-semibold text-foreground">{fmt(balance?.creditUsed ?? 0)}</span>
              {' · '}Wallet balance: <span className="font-semibold text-foreground">{fmt(balance?.walletBalance ?? 0)}</span>
            </div>

            <div className="mt-5">
              <label className="mb-1.5 block text-sm font-medium">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full rounded-xl border border-border bg-card py-3 pl-8 pr-4 text-lg font-semibold text-foreground placeholder:text-muted-foreground focus:border-brand-teal-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => { setShowRepay(false); setRepayAmount(''); }}
                className="flex-1 cursor-pointer rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const amt = parseFloat(repayAmount);
                  if (amt > 0) repayMutation.mutate(amt);
                }}
                disabled={repayMutation.isPending || !repayAmount || parseFloat(repayAmount) <= 0}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-teal-700 disabled:opacity-50"
              >
                {repayMutation.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing…
                  </span>
                ) : (
                  `Repay ${fmt(parseFloat(repayAmount || '0'))}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaction History ─────────────────────────── */}
      <DashboardCard
        title="Transaction History"
        period={transactions ? `${transactions.total} transactions` : 'Wallet movements'}
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <History className="size-4" />
            {txnLoading ? 'Loading…' : `${filteredTxns.length} shown`}
          </span>
        }
        contentClassName="justify-start gap-y-0 px-0 pb-0"
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
          <select
            value={txnType}
            onChange={(e) => { setTxnType(e.target.value); setTxnPage(1); }}
            className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground focus:border-brand-teal-500 focus:outline-none"
          >
            <option value="">All Types</option>
            <option value="deposit">Deposits</option>
            <option value="deduct">Deductions</option>
            <option value="credit_used">Credit Used</option>
            <option value="credit_repayment">Credit Payments</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setTxnPage(1); }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:border-brand-teal-500 focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setTxnPage(1); }}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground focus:border-brand-teal-500 focus:outline-none"
          />
          <input
            type="text"
            placeholder="Search…"
            value={txnSearch}
            onChange={(e) => { setTxnSearch(e.target.value); setTxnPage(1); }}
            className="w-32 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal-500 focus:outline-none"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {txnLoading ? (
            <AdminTableSkeleton rows={5} columns={5} className="px-6 pb-6" />
          ) : filteredTxns.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12">
              <History className="size-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No transactions found</p>
              <p className="text-xs text-muted-foreground">
                {txnType || dateFrom || txnSearch ? 'Try adjusting your filters' : 'Your transactions will appear here'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredTxns.map((txn) => (
                  <tr
                    key={txn.id}
                    className="transition-colors hover:bg-muted/50"
                  >
                    <td className="px-6 py-3.5">
                      <TransactionTypeBadge type={txn.type} />
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3.5 text-muted-foreground">
                      <span className="truncate">{txn.description ?? '—'}</span>
                      {txn.reference && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground" title={txn.reference}>#{txn.reference.length > 12 ? txn.reference.slice(0, 8) + '…' : txn.reference}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-medium tabular-nums">
                      <span className={txn.amount >= 0 ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}>
                        {txn.amount >= 0 ? '+' : ''}{fmt(Math.abs(txn.amount), txn.currency ?? walletCurrency)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-muted-foreground">
                      {fmt(txn.balanceAfter, txn.currency ?? walletCurrency)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3.5 text-right text-xs text-muted-foreground">
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

        {/* Pagination */}
        {transactions && transactions.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3">
            <p className="text-xs text-muted-foreground">
              Page {txnPage} of {transactions.totalPages} ({transactions.total} transactions)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setTxnPage((p) => Math.max(1, p - 1))}
                disabled={txnPage <= 1}
                className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              {Array.from({ length: Math.min(5, transactions.totalPages) }, (_, i) => {
                const start = Math.max(1, txnPage - 2);
                const page = start + i;
                if (page > transactions.totalPages) return null;
                return (
                  <button
                    key={page}
                    onClick={() => setTxnPage(page)}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      page === txnPage
                        ? 'border-brand-teal-500 bg-brand-teal-500/10 text-brand-teal-700 dark:text-brand-teal-400'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
              <button
                onClick={() => setTxnPage((p) => Math.min(transactions.totalPages, p + 1))}
                disabled={txnPage >= transactions.totalPages}
                className="cursor-pointer rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
