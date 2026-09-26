'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAgentCreditShells,
  useCreditShell,
  type CreditShellItem,
  type PaginatedCreditShells,
} from '@/features/agent/api/agent-refund';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import Pagination from '@/components/common/Pagination';
import { cn } from '@/lib/cn';
import {
  WalletIcon,
  RefreshIcon,
  AlertTriangle,
  CheckIcon,
  PlaneIcon,
  HotelIcon,
  HistoryIcon as ClockIcon,
} from '@/components/agent/AgentIcons';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// Credit shells are stamped in their originating booking currency — each row
// renders its own code; the header total converts into the selected display
// currency (convert-then-sum).

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'partially_used', label: 'Partially used' },
  { value: 'exhausted', label: 'Exhausted' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

// ─── Status Badge (credit shell specific status mapping) ──

function CreditShellStatusBadge({ status }: { status: string }) {
  const active = status === 'active';
  const partial = status === 'partially_used';
  const exhausted = status === 'exhausted' || status === 'used';
  const expired = status === 'expired' || status === 'cancelled';

  const bg = active ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400'
    : partial ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400'
    : exhausted ? 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
    : expired ? 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'
    : 'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400';

  const dot = active ? 'bg-success-500' : partial ? 'bg-warning-500' : exhausted ? 'bg-gray-400' : expired ? 'bg-error-500' : 'bg-gray-400';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', bg)}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dot)} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Main Page ─────────────────────────────────────────────

export default function AgentCreditShellsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [now] = useState(() => Date.now());
  const [useTarget, setUseTarget] = useState<CreditShellItem | null>(null);
  const [useAmount, setUseAmount] = useState('');
  const [useBookingId, setUseBookingId] = useState('');
  const [useError, setUseError] = useState('');
  const queryClient = useQueryClient();
  const { convertAmount, selectedCurrency } = useCurrency();
  const { decimalsMap } = useCurrencyData();
  const fmtTotal = (n: number) => formatCurrencyWithCode(n, selectedCurrency.code, decimalsMap);

  // ── Query (page + status) ────────────────────────────────
  const { data, isPending, isFetching, isError, refetch } = useQuery<PaginatedCreditShells>({
    queryKey: ['agent', 'credit-shells', page, statusFilter],
    queryFn: () =>
      getAgentCreditShells({
        page,
        limit: 15,
        status: statusFilter || undefined,
      }),
  });

  // ── Use-shell action ─────────────────────────────────────
  const useShellMutation = useMutation({
    mutationFn: (args: { id: string; amount: number; newBookingId?: string }) =>
      useCreditShell(args.id, { amount: args.amount, newBookingId: args.newBookingId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'credit-shells'] });
      setUseTarget(null);
      setUseAmount('');
      setUseBookingId('');
      setUseError('');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Unable to use credit shell.';
      setUseError(msg);
    },
  });

  const openUse = (shell: CreditShellItem) => {
    setUseTarget(shell);
    setUseAmount(String(shell.remainingAmount));
    setUseBookingId('');
    setUseError('');
  };

  const confirmUse = () => {
    if (!useTarget) return;
    const amount = Number(useAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setUseError('Enter an amount greater than zero.');
      return;
    }
    if (amount > useTarget.remainingAmount) {
      setUseError(`Amount cannot exceed ${useTarget.remainingAmount}.`);
      return;
    }
    setUseError('');
    useShellMutation.mutate({
      id: useTarget.id,
      amount,
      newBookingId: useBookingId.trim() || undefined,
    });
  };

  // ── Render ─────────────────────────────────────────────
  if (isPending && !data) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Credit Shells"
          description="Credits from cancellations that can be used toward future bookings."
        />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  const shells = data?.items ?? [];
  const totalActive = shells.filter((s) => s.status === 'active').length;
  // Shells can sit in different currencies — convert each into the selected
  // display currency before summing.
  const totalAvailable = shells.reduce((sum, s) => {
    const cur = (s.currency ?? selectedCurrency.code).toUpperCase();
    return sum + (cur === selectedCurrency.code ? s.remainingAmount : convertAmount(s.remainingAmount, cur));
  }, 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Credit Shells"
        description="Credits from cancellations that can be used toward future bookings."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className={cn('size-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-teal-50 dark:bg-brand-teal-900/20">
              <WalletIcon className="size-5 text-brand-teal-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {fmtTotal(totalAvailable)}
              </p>
              <p className="text-xs text-muted-foreground">Total available credit</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success-50 dark:bg-success-900/20">
              <CheckIcon className="size-5 text-success-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {totalActive}
              </p>
              <p className="text-xs text-muted-foreground">Active credit shells</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning-50 dark:bg-warning-900/20">
              <ClockIcon className="size-5 text-warning-500" />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {data?.total ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">Total credit shells</p>
            </div>
          </div>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by status">
        {STATUS_TABS.map((tab) => {
          const selected = statusFilter === tab.value;
          return (
            <button
              key={tab.value || 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              className={cn(
                'inline-flex h-9 cursor-pointer items-center rounded-lg border px-3 text-xs font-medium transition-colors',
                selected
                  ? 'border-transparent bg-brand-teal-500 text-white shadow-xs hover:bg-brand-teal-600'
                  : 'border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* DataTable */}
      <div className="rounded-2xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Credit shells</h3>
            <p className="text-xs text-muted-foreground">
              {isPending ? 'Loading…' : `${data?.total ?? 0} total`}
              {isFetching && !isPending && (
                <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-brand-teal-500 align-middle" />
              )}
            </p>
          </div>
        </div>

        <div className={cn('transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          {isError ? (
            <div className="flex flex-col items-center py-12">
              <AlertTriangle className="size-10 text-error-300 dark:text-error-700" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">Failed to load credit shells</p>
              <p className="text-xs text-muted-foreground">Something went wrong — check your connection and try again.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <RefreshIcon className="size-4" />
                Retry
              </button>
            </div>
          ) : shells.length === 0 ? (
            <div className="flex flex-col items-center py-12">
              <WalletIcon className="size-10 text-muted-foreground/30" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">No credit shells found</p>
              <p className="text-xs text-muted-foreground">
                {statusFilter ? 'Try adjusting your filters' : 'Credit shells from cancelled bookings will appear here'}
              </p>
            </div>
          ) : (
            <div className="admin-table-viewport overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shell</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Booking</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Amounts</th>
                    <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Expiry</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {shells.map((shell) => {
                    const shellCurrency = shell.currency ?? 'USD';
                    const fmt = (n: number) => formatCurrencyWithCode(n, shellCurrency, decimalsMap);
                    const expiryMs = shell.expiresAt ? new Date(shell.expiresAt).getTime() : null;
                    const isExpired = expiryMs != null && expiryMs <= now;
                    const isExpiringSoon = expiryMs != null && expiryMs - now < 30 * 24 * 60 * 60 * 1000 && expiryMs > now;
                    const usable = (shell.status === 'active' || shell.status === 'partially_used') && !isExpired && shell.remainingAmount > 0;
                    return (
                      <tr key={shell.id} className="transition-colors hover:bg-muted/40">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <span className={cn(
                              'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 dark:ring-white/10',
                              shell.bookingType === 'flight'
                                ? 'bg-brand-teal-50 text-brand-teal-500 dark:bg-brand-teal-900/20'
                                : 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
                            )}>
                              {shell.bookingType === 'flight'
                                ? <PlaneIcon className="size-4" />
                                : <HotelIcon className="size-4" />
                              }
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold capitalize text-foreground">
                                {shell.bookingType} credit
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {new Date(shell.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-medium text-foreground" title={shell.bookingId}>
                            #{shell.bookingId.substring(0, 8)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <p className="text-sm font-bold tabular-nums text-foreground">{fmt(shell.remainingAmount)}</p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">of {fmt(shell.originalAmount)}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          {!shell.expiresAt ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <div>
                              <p className={cn('text-xs', isExpired ? 'font-medium text-error-500' : isExpiringSoon ? 'font-medium text-warning-500' : 'text-muted-foreground')}>
                                {new Date(shell.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {isExpiringSoon && ` (${Math.ceil((expiryMs! - now) / (1000 * 60 * 60 * 24))}d)`}
                              </p>
                              {(isExpiringSoon || isExpired) && (
                                <p className={cn('mt-0.5 text-[11px]', isExpired ? 'text-error-500' : 'text-warning-500')}>
                                  {isExpired ? 'Expired' : 'Expiring soon'}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <CreditShellStatusBadge status={shell.status} />
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => openUse(shell)}
                            disabled={!usable}
                            title={usable ? 'Use this credit' : 'Not usable'}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition-colors hover:bg-brand-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <WalletIcon className="size-3.5" />
                            Use
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div className="border-t border-border px-4 py-3 sm:px-6">
            <Pagination
              currentPage={page}
              totalPages={data.totalPages}
              total={data.total}
              pageSize={15}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Use-shell modal */}
      {useTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => { if (!useShellMutation.isPending) setUseTarget(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal-50 dark:bg-brand-teal-900/20">
                <WalletIcon className="size-5 text-brand-teal-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Use credit shell</h3>
                <p className="text-sm text-muted-foreground">
                  Available: {formatCurrencyWithCode(useTarget.remainingAmount, useTarget.currency ?? 'USD', decimalsMap)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="use-amount" className="text-sm font-medium text-foreground">Amount *</label>
                <input
                  id="use-amount"
                  type="number"
                  min={0}
                  max={useTarget.remainingAmount}
                  step="any"
                  value={useAmount}
                  onChange={(e) => setUseAmount(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm tabular-nums text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="use-booking" className="text-sm font-medium text-foreground">New booking ID <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input
                  id="use-booking"
                  type="text"
                  value={useBookingId}
                  onChange={(e) => setUseBookingId(e.target.value)}
                  placeholder="Booking to apply credit to"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
              </div>
              {useError && <p className="text-sm text-error-500">{useError}</p>}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUseTarget(null)}
                disabled={useShellMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl border border-input bg-card px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUse}
                disabled={useShellMutation.isPending}
                className="flex-1 cursor-pointer rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
              >
                {useShellMutation.isPending ? 'Applying…' : 'Apply credit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
