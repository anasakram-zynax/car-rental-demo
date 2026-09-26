'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, XAxis } from 'recharts';
import { CalendarCheck, Clock, HandCoins, Wallet } from 'lucide-react';
import Link from 'next/link';
import { apiRequest } from '@/lib/api/client';
import { useAuth } from '@/hooks/useAuth';
import { getAgentCommissionSummary, type CommissionSummary } from '@/features/commission/api/agent-commission';
import { getTeamStats } from '@/features/agent/api/agent-team';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { useCurrencyData } from '@/context/CurrencyContext';
import { InfoTip } from '@/components/ui/stat-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminCardsSkeleton } from '@/components/admin/shared/AdminSkeletons';
import { DashboardCard, DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

interface AgentDashboardStats {
  walletBalance: number;
  creditLimit: number;
  creditUsed: number;
  commissionRate: number;
  kycStatus: string;
  isApproved: boolean;
  stats: {
    todaysBookings: number;
    pendingBookings: number;
    walletBalance: number;
    creditAvailable: number;
  };
  recentBookings: Array<{
    id: string;
    type: 'flight' | 'hotel';
    status: string;
    amount: number | null;
    currency: string | null;
    ref: string | null;
    createdAt: string;
  }>;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Awaiting payment', cls: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400' },
  booking_in_progress: { label: 'Processing', cls: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-400' },
  held: { label: 'Held', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  booked: { label: 'Booked', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  confirmed: { label: 'Confirmed', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  ticketed: { label: 'Ticketed', cls: 'bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400' },
  cancelled: { label: 'Cancelled', cls: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' },
  failed: { label: 'Failed', cls: 'bg-error-50 text-error-700 dark:bg-error-500/15 dark:text-error-400' },
};

function StatusTag({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), cls: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

// ponytail: module-scope formatters — new fn refs re-arm CountUp mid-count.
const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const trendConfig = {
  flights: { label: 'Flights', color: 'hsl(var(--chart-2))' },
  hotels: { label: 'Hotels', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

interface TrendDay {
  day: string;
  flights: number;
  hotels: number;
}

export default function AgentDashboardPage() {
  const { user, isSubAgent } = useAuth();
  const { decimalsMap } = useCurrencyData();

  const { data, isPending, error } = useQuery<AgentDashboardStats>({
    queryKey: ['agent', 'dashboard', 'stats'],
    queryFn: () => apiRequest<AgentDashboardStats>('/agent/dashboard/stats', { auth: true }),
    refetchInterval: (query) => query.state.data && typeof document !== 'undefined' && document.hidden ? false : 30000,
  });

  // Only fetch when the role grants sub-agent management — the endpoint
  // requires agent:manage_sub_agents (corporate tier) and 403s otherwise.
  const teamQuery = useQuery({
    queryKey: ['agent', 'team', 'stats'],
    queryFn: getTeamStats,
    enabled: !isSubAgent && !!user?.permissions?.includes('agent:manage_sub_agents'),
  });

  const now = new Date();
  const currentMonth = now.toISOString().substring(0, 7);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().substring(0, 7);
  const commissionQuery = useQuery<CommissionSummary>({
    queryKey: ['agent', 'commissions', 'widget', currentMonth],
    queryFn: () => getAgentCommissionSummary(currentMonth, nextMonth),
    refetchInterval: (query) => query.state.data && typeof document !== 'undefined' && document.hidden ? false : 60000,
  });

  // ponytail: daily aggregate from existing recent-bookings feed, no new endpoint.
  // Local-date keys — toISOString is UTC and shifts day buckets in +5 zones.
  const trend = useMemo<TrendDay[]>(() => {
    const feed = data?.recentBookings ?? [];
    if (feed.length === 0) return [];
    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const buckets = new Map<string, TrendDay>();
    for (const b of feed) {
      const d = new Date(b.createdAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = dayKey(d);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const row = buckets.get(key) ?? { day: label, flights: 0, hotels: 0 };
      row.day = label;
      if (b.type === 'flight') row.flights += 1;
      else row.hotels += 1;
      buckets.set(key, row);
    }
    return [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-7).map(([, row]) => row);
  }, [data?.recentBookings]);

  const stats = data?.stats;
  const summary = commissionQuery.data;
  const firstName = user?.firstName ? `, ${user.firstName}` : '';

  if (isPending) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="Agent Dashboard" description="Loading your overview." />
        <AdminCardsSkeleton count={4} />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Agent Dashboard"
        description={`Welcome back${firstName} — bookings, wallet, and commission at a glance.`}
        actions={
          <>
            <Link
              href="/flights/search"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-teal-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-teal-700"
            >
              New Flight
            </Link>
            <Link
              href="/hotels/search"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-card-foreground transition-colors hover:bg-muted"
            >
              New Hotel
            </Link>
          </>
        }
      />

      {error && (
        <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          Failed to load dashboard data. Please refresh.
        </div>
      )}

      {data && !data.isApproved && (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-5 dark:border-warning-800/50 dark:bg-warning-950/20">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning-500" />
            <div>
              <p className="font-semibold text-warning-800 dark:text-warning-300">Account Pending Approval</p>
              <p className="mt-1 text-sm text-warning-600 dark:text-warning-400">
                Your account is awaiting admin approval. You will receive access once approved.
                Some features like booking may be limited until then.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardOverviewCardV2
          title="Today's Bookings"
          period="Bookings created today"
          icon={<CalendarCheck />}
          iconColor="hsl(var(--primary))"
          action={<Link href="/agent/bookings" className="text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">View</Link>}
          data={{ value: stats?.todaysBookings }}
          cacheKey="agent-today-bookings"
          capValue={20}
        />
        <DashboardOverviewCardV2
          title="In Progress"
          period="Awaiting payment or confirmation"
          icon={<Clock />}
          iconColor="hsl(var(--chart-3))"
          action={<InfoTip align="right">Bookings still being processed by the supplier. They confirm automatically — nothing for you to do unless a booking fails.</InfoTip>}
          data={{ value: stats?.pendingBookings }}
          cacheKey="agent-pending-bookings"
          capValue={20}
        />
        <DashboardOverviewCardV2
          title="Wallet Balance"
          period="Prepaid funds ready to spend"
          icon={<Wallet />}
          iconColor="hsl(var(--chart-2))"
          action={<InfoTip align="right">Your wallet is the prepaid balance used first for every booking. Top it up any time from the Wallet page.</InfoTip>}
          data={{ value: stats?.walletBalance, format: fmtUsd }}
          cacheKey="agent-wallet-balance"
          capValue={5000}
        />
        <DashboardOverviewCardV2
          title="Commission Earned"
          period="Payable after supplier confirms"
          icon={<HandCoins />}
          iconColor="hsl(var(--chart-1))"
          action={<Link href="/agent/commission" className="text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">View</Link>}
          data={{ value: summary?.totalCommission, format: fmtUsd }}
          loading={commissionQuery.isPending}
          cacheKey="agent-commission-earned"
          capValue={1000}
        />
      </div>

      {/* Team Activity Widget */}
      {teamQuery.data && teamQuery.data.subAgentCount > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold tracking-tight">Team Activity</h3>
            <Link href="/agent/team" className="text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">Manage Team →</Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">Sub-Agents</p><p className="mt-1 text-2xl font-bold tabular-nums">{teamQuery.data.subAgentCount}</p></div>
            <div><p className="text-xs text-muted-foreground">Team Bookings</p><p className="mt-1 text-2xl font-bold tabular-nums">{teamQuery.data.totalBookings}</p></div>
            {/* Team revenue has no per-item currency in the API response (aggregated
                platform-side) — formatted in the platform's base currency (USD) until
                that's exposed; decimals still come from the live admin config. */}
            <div><p className="text-xs text-muted-foreground">Team Revenue</p><p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrencyWithCode(teamQuery.data.totalRevenue, 'USD', decimalsMap)}</p></div>
          </div>
          {teamQuery.data.topSubAgent && (
            <div className="mt-4 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Top performer: <span className="font-medium text-foreground">{teamQuery.data.topSubAgent.name}</span>
                {' — '}{teamQuery.data.topSubAgent.bookings} bookings, {formatCurrencyWithCode(teamQuery.data.topSubAgent.revenue, 'USD', decimalsMap)} revenue
              </p>
            </div>
          )}
        </div>
      )}

      {/* Trend + recent bookings */}
      <div className="grid gap-4 sm:gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Bookings Trend"
          period="Daily counts from your recent bookings feed"
          contentClassName="justify-start gap-y-4 px-6 pb-6"
        >
          {trend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No bookings yet —{' '}
              <Link href="/flights/search" className="font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">
                make your first booking →
              </Link>
            </p>
          ) : (
            <ChartContainer config={trendConfig} className="h-[260px] w-full">
              <BarChart accessibilityLayer data={trend} margin={{ top: 16, right: 12, left: 12, bottom: 0 }} barCategoryGap="24%">
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} minTickGap={14} interval="preserveStartEnd" />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                <Legend content={<ChartLegendContent />} />
                <Bar dataKey="flights" stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 4, 4]} maxBarSize={28} isAnimationActive={false} />
                <Bar dataKey="hotels" stackId="a" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ChartContainer>
          )}
        </DashboardCard>

        <DashboardCard
          title="Recent Bookings"
          action={<Link href="/agent/bookings" className="text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">View all</Link>}
          contentClassName="justify-start gap-y-0 px-0 pb-2"
        >
          <div className="divide-y divide-border">
            {data?.recentBookings && data.recentBookings.length > 0 ? (
              data.recentBookings.map((booking) => (
                <Link
                  key={booking.id}
                  href="/agent/bookings"
                  className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    booking.type === 'flight'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                  }`}>
                    {booking.type === 'flight' ? (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 2 11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21V3h18v18" /><path d="M3 7h18" /><path d="M3 11h18" /><path d="M3 15h18" /><path d="M7 3v18" /><path d="M11 15h2v6h-2z" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {booking.type === 'flight' ? 'Flight' : 'Hotel'} — {booking.ref ?? `#${booking.id.slice(0, 8).toUpperCase()}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {new Date(booking.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {booking.amount ? formatCurrencyWithCode(booking.amount, booking.currency ?? 'USD', decimalsMap) : '—'}
                    </p>
                    <StatusTag status={booking.status} />
                  </div>
                </Link>
              ))
            ) : (
              <div className="px-6 py-8 text-center">
                <p className="text-sm text-muted-foreground">No bookings yet.</p>
                <Link href="/flights/search" className="mt-2 inline-block text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">
                  Make your first booking →
                </Link>
              </div>
            )}
          </div>
        </DashboardCard>
      </div>

      {/* Quick actions + commission */}
      <div className="grid gap-4 sm:gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Quick Actions"
          period="Jump to the tasks you use most"
          contentClassName="justify-start gap-y-0 px-0 pb-2"
        >
          <div className="divide-y divide-border">
            {[
              {
                href: '/flights/search',
                label: 'Search Flights & Hotels',
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  </svg>
                ),
              },
              {
                href: '/agent/bookings',
                label: 'View My Bookings',
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                ),
              },
              {
                href: '/agent/wallet',
                label: 'Manage Wallet',
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                ),
              },
              {
                href: '/agent/profile',
                label: 'Profile Settings',
                icon: (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                ),
              },
            ].map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 px-6 py-3.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal-500/10 text-brand-teal-600 dark:text-brand-teal-400">
                  {action.icon}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{action.label}</span>
                <svg className="h-4 w-4 shrink-0 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard
          title="Commission This Month"
          period="How your earnings become payable"
          action={<Link href="/agent/commission" className="text-xs font-medium text-brand-teal-600 hover:underline dark:text-brand-teal-400">View all</Link>}
          contentClassName="justify-start gap-y-4 px-6 pb-6"
        >
          <p className="text-xs text-muted-foreground">
            You earn a commission on each confirmed booking. It becomes payable once the supplier confirms — then the team pays it into your wallet.
          </p>
          {commissionQuery.isPending ? (
            <div className="h-16 animate-pulse rounded-xl bg-muted" />
          ) : !summary ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Could not load commission data.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-brand-teal-500/10 p-3">
                <p className="text-[10px] font-medium text-brand-teal-700 dark:text-brand-teal-400">Earned</p>
                <p className="text-lg font-bold tabular-nums text-brand-teal-700 dark:text-brand-teal-400">
                  {formatCurrencyWithCode(summary.totalCommission ?? 0, summary.currency ?? 'USD', decimalsMap)}
                </p>
              </div>
              <div className="rounded-xl bg-warning-50 p-3 dark:bg-warning-500/15">
                <p className="text-[10px] font-medium text-warning-700 dark:text-warning-400">Pending payout</p>
                <p className="text-lg font-bold tabular-nums text-warning-800 dark:text-warning-300">
                  {formatCurrencyWithCode(summary.totalPending ?? 0, summary.currency ?? 'USD', decimalsMap)}
                </p>
              </div>
              <div className="rounded-xl bg-success-50 p-3 dark:bg-success-500/15">
                <p className="text-[10px] font-medium text-success-700 dark:text-success-400">Paid</p>
                <p className="text-lg font-bold tabular-nums text-success-800 dark:text-success-300">
                  {formatCurrencyWithCode(summary.totalPaid ?? 0, summary.currency ?? 'USD', decimalsMap)}
                </p>
              </div>
            </div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
