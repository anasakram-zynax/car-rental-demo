'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { confirmDialog } from '@/components/ui/confirm-dialog';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DashboardCard, DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import {
  getAgentCommissions,
  getAgentCommissionSummary,
  transferCommissionToWallet,
  listCommissionWithdrawals,
  type PaginatedCommissions,
  type CommissionSummary,
} from '@/features/commission/api/agent-commission';
import { WithdrawModal } from '@/features/wallet/components/WithdrawModal';
import { ModalErrorBoundary } from '@/features/wallet/components/ModalErrorBoundary';
import { getWalletBalance } from '@/features/wallet/api/agent-wallet';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminCommissionStatusBadge } from '@/components/admin/shared/admin-badges';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import {
  DollarSign,
  Clock,
  CheckCircle2,
  RefreshCw,
  Download,
  Search,
} from 'lucide-react';

// ─── Monthly chart (Recharts, same system as dashboard + reports) ───

function MonthlyChart({ data }: { data: CommissionSummary['byPeriod'] }) {
  const { decimalsMap } = useCurrencyData();
  const chartData = data.map((d) => ({
    month: d.period.length === 7
      ? new Date(Number(d.period.slice(0, 4)), Number(d.period.slice(5)) - 1, 1).toLocaleDateString('en-US', { month: 'short' })
      : d.period,
    earnings: Math.round(d.amount * 100) / 100,
  }));
  const config = { earnings: { label: 'Earnings' } } satisfies ChartConfig;
  return (
    <DashboardCard title="Monthly Earnings" contentClassName="justify-start gap-y-4 px-6 pb-6">
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <BarChart accessibilityLayer data={chartData} margin={{ top: 16, right: 12, left: 12, bottom: 0 }} barCategoryGap="24%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={14} interval="preserveStartEnd" />
          <ChartTooltip
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
            content={<ChartTooltipContent hideIndicator hideLabel formatter={(value) => formatCurrencyWithCode(Number(value ?? 0), 'USD', decimalsMap)} />}
          />
          <Bar dataKey="earnings" fill="var(--color-brand-teal-500)" radius={[6, 6, 2, 2]} maxBarSize={36} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </DashboardCard>
  );
}

// ─── Main Page ───

type Tab = 'earnings' | 'withdrawals' | 'history';

export default function AgentCommissionPage() {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();

  const [activeTab, setActiveTab] = useState<Tab>('earnings');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);

  const { data: summary } = useQuery<CommissionSummary>({
    queryKey: ['agent', 'commissions', 'summary', dateFrom, dateTo],
    queryFn: () => getAgentCommissionSummary(dateFrom || undefined, dateTo || undefined),
  });

  const { data: commissions, isPending: commissionsLoading, refetch } = useQuery<PaginatedCommissions>({
    queryKey: ['agent', 'commissions', page, statusFilter, bookingTypeFilter, dateFrom, dateTo],
    queryFn: () =>
      getAgentCommissions({
        page,
        limit: 15,
        status: statusFilter || undefined,
        bookingType: bookingTypeFilter || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      }),
  });

  const { data: wallet } = useQuery({
    queryKey: ['agent', 'wallet', 'balance'],
    queryFn: getWalletBalance,
  });

  const { data: withdrawalRequests, isPending: withdrawalsLoading, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['agent', 'commissions', 'withdrawals'],
    queryFn: listCommissionWithdrawals,
  });

  const transferMutation = useMutation({
    mutationFn: transferCommissionToWallet,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['agent', 'commissions'] });
      queryClient.invalidateQueries({ queryKey: ['agent', 'wallet'] });
      toasts.success('Transferred to wallet', `${res.count} commission(s) moved to wallet instantly.`);
    },
    onError: () => toasts.error('Transfer failed', 'Could not move commissions to wallet.'),
  });

  const filteredItems = useMemo(() => {
    if (!commissions?.items) return [];
    if (!search.trim()) return commissions.items;
    const q = search.toLowerCase();
    return commissions.items.filter(
      (c) =>
        c.bookingId.toLowerCase().includes(q) ||
        c.bookingType.toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q),
    );
  }, [commissions, search]);

  const exportCSV = useCallback(() => {
    if (!filteredItems.length) {
      toasts.warning('No data to export');
      return;
    }
    const headers = ['Booking ID', 'Type', 'Booking Amount', 'Commission', 'Currency', 'Rate', 'Rate Type', 'Status', 'Date'];
    const rows = filteredItems.map((c) => [
      c.bookingId,
      c.bookingType,
      c.bookingAmount.toFixed(2),
      c.commissionAmount.toFixed(2),
      c.currency,
      c.rateType === 'percentage' ? `${c.rate}%` : formatCurrencyWithCode(c.rate, c.currency, decimalsMap),
      c.rateType,
      c.status,
      new Date(c.createdAt).toISOString().split('T')[0],
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toasts.success('Exported', `${filteredItems.length} commission records exported.`);
  }, [filteredItems, toasts, decimalsMap]);

  const summaryCurrency = summary?.currency ?? 'USD';
  const fmt = (n: number) => formatCurrencyWithCode(n, summaryCurrency, decimalsMap);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="My Commissions"
        description="Track your earnings from bookings."
        actions={
          <>
            <button
              onClick={() => refetch()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
            <button
              onClick={exportCSV}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-teal-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-brand-teal-600"
            >
              <Download className="size-4" />
              Export CSV
            </button>
          </>
        }
      />

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardOverviewCardV2
          title="Total Earned"
          period={`${summary?.bookingCount ?? 0} ${(summary?.bookingCount ?? 0) === 1 ? 'booking' : 'bookings'}`}
          icon={<DollarSign className="size-5" />}
          iconColor="var(--color-brand-teal-500)"
          data={{ value: summary?.totalCommission, format: fmt }}
          cacheKey="agent-commission-total"
          capValue={1000}
        />
        <DashboardOverviewCardV2
          title="Pending Payout"
          period="Awaiting payout"
          icon={<Clock className="size-5" />}
          iconColor="hsl(var(--chart-3))"
          data={{ value: summary?.totalPending, format: fmt }}
          cacheKey="agent-commission-pending"
          capValue={1000}
        />
        <DashboardOverviewCardV2
          title="Paid This Period"
          period="Already paid out"
          icon={<CheckCircle2 className="size-5" />}
          iconColor="hsl(var(--chart-2))"
          data={{ value: summary?.totalPaid, format: fmt }}
          cacheKey="agent-commission-paid"
          capValue={1000}
        />
      </div>

      {/* ── Pending actions ── */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={async () => {
            if (
              await confirmDialog({
                title: 'Transfer to wallet?',
                message: `Move full pending balance (${fmt(summary?.totalPending ?? 0)}) to wallet instantly?`,
                confirmLabel: 'Transfer',
                destructive: false,
              })
            ) {
              transferMutation.mutate();
            }
          }}
          disabled={transferMutation.isPending || !summary?.totalPending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-brand-teal-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-teal-600 disabled:opacity-50"
        >
          {transferMutation.isPending ? 'Transferring…' : 'Transfer to wallet'}
        </button>
        <button
          onClick={() => setShowWithdraw(true)}
          disabled={!summary?.totalPending}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          Withdraw commission
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800">
        {(['earnings', 'withdrawals', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'earnings' ? 'Earnings' : tab === 'withdrawals' ? 'Withdrawals' : 'History'}
          </button>
        ))}
      </div>

      {/* ── TAB: Earnings ── */}
      {activeTab === 'earnings' && summary?.byPeriod && summary.byPeriod.length > 0 && (
        <MonthlyChart data={summary.byPeriod} />
      )}

      {/* ── TAB: Withdrawals ── */}
      {activeTab === 'withdrawals' && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Commission withdrawal requests</h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Approval pays your current pending balance at that time.
            </p>
          </div>
          {withdrawalsLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : !withdrawalRequests?.length ? (
            <p className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No withdrawal requests yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {withdrawalRequests.slice(0, 10).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {r.amount != null ? formatCurrencyWithCode(r.amount, r.currency ?? summaryCurrency, decimalsMap) : r.reference}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400" title={r.description ?? r.reference ?? undefined}>
                      {r.reference}{r.description ? ` · ${r.description}` : ''}{r.paymentId ? ` · ref ${r.paymentId}` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${r.status === 'pending' ? 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400' : r.status === 'approved' ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : 'bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400'}`}>
                    {r.status === 'pending' ? 'Pending' : r.status === 'approved' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: History ── */}
      {activeTab === 'history' && (
        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Commission History
              {commissions && (
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {commissions.total}
                </span>
              )}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="reversed">Reversed</option>
              </select>
              <select
                value={bookingTypeFilter}
                onChange={(e) => { setBookingTypeFilter(e.target.value); setPage(1); }}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              >
                <option value="">All Types</option>
                <option value="flight">Flights</option>
                <option value="hotel">Hotels</option>
                <option value="package">Packages</option>
              </select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              />
              <span className="text-xs text-gray-400">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
              />
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-32 rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {commissionsLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center py-12">
                <DollarSign className="size-10 text-gray-200 dark:text-gray-700" />
                <p className="mt-3 text-sm font-medium text-gray-500 dark:text-gray-400">No commissions found</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {statusFilter || dateFrom || search ? 'Try adjusting your filters' : 'Commissions will appear here after bookings are confirmed'}
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-50 dark:border-gray-800/50">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Booking</th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Booking Amt</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Commission</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Rate</th>
                    <th className="px-5 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-400">Status</th>
                    <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                  {filteredItems.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                      <td className="px-5 py-3.5 font-mono text-xs text-gray-600 dark:text-gray-400">
                        #{c.bookingId.substring(0, 8)}
                      </td>
                      <td className="px-5 py-3.5 capitalize text-gray-700 dark:text-gray-300">{c.bookingType}</td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-gray-700 dark:text-gray-300">
                        {formatCurrencyWithCode(c.bookingAmount, c.currency, decimalsMap)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium tabular-nums text-brand-teal-600 dark:text-brand-teal-400">
                        {formatCurrencyWithCode(c.commissionAmount, c.currency, decimalsMap)}
                      </td>
                      <td className="px-5 py-3.5 text-right tabular-nums text-gray-600 dark:text-gray-400">
                        {c.rateType === 'percentage' ? `${c.rate}%` : formatCurrencyWithCode(c.rate, c.currency, decimalsMap)}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <AdminCommissionStatusBadge status={c.status} />
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right text-xs text-gray-400">
                        {new Date(c.createdAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {commissions && commissions.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 dark:border-gray-800">
              <p className="text-xs text-gray-400">
                Page {page} of {commissions.totalPages} ({commissions.total} records)
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(5, commissions.totalPages) }, (_, i) => {
                  const start = Math.max(1, page - 2);
                  const p = start + i;
                  if (p > commissions.totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        p === page
                          ? 'border-brand-teal-200 bg-brand-teal-50 text-brand-teal-700 dark:border-brand-teal-700 dark:bg-brand-teal-900/20 dark:text-brand-teal-400'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(commissions.totalPages, p + 1))}
                  disabled={page >= commissions.totalPages}
                  className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ModalErrorBoundary>
        <WithdrawModal
          open={showWithdraw}
          onClose={() => setShowWithdraw(false)}
          mode="agent"
          pool="commission"
          walletBalance={wallet?.walletBalance ?? 0}
          walletCurrency={wallet?.currency ?? 'USD'}
          commissionPending={summary?.totalPending ?? 0}
          commissionCurrency={summaryCurrency}
          onSuccess={() => refetchWithdrawals()}
        />
      </ModalErrorBoundary>
    </div>
  );
}
