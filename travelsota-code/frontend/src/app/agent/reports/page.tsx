'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { getAgentBookings } from '@/features/agent/api/agent-bookings';
import { getAgentCommissionSummary, type CommissionSummary } from '@/features/commission/api/agent-commission';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { DashboardCard, DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import {
  BookingsTableSkeleton,
  BookingsTrendSkeleton,
  KpiCardSkeleton,
  SalesTrendSkeleton,
  TopDestinationsSkeleton,
} from '@/components/admin/dashboard/ecommerce/widget-skeleton';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { BarChartIcon, DollarSignIcon, DownloadIcon, HotelIcon, PlaneIcon, TrendingUpIcon } from '@/components/agent/AgentIcons';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

// ─── Types ────────────────────────────────────────────────

type Period = '3m' | '6m' | '12m';

const PERIOD_MONTHS: Record<Period, number> = { '3m': 3, '6m': 6, '12m': 12 };

interface MonthlyTrend {
  month: string;
  label: string;
  bookings: number;
  flights: number;
  hotels: number;
  revenue: number;
}

interface Destination {
  name: string;
  bookings: number;
  revenue: number;
}

const BOOKINGS_CHART_CONFIG = {
  flights: { label: 'Flights' },
  hotels: { label: 'Hotels' },
} satisfies ChartConfig;

const EMPTY_CHART_CONFIG = {} satisfies ChartConfig;

// ─── Main Page ────────────────────────────────────────────

export default function AgentReportsPage() {
  const [period, setPeriod] = useState<Period>('6m');
  const { convertAmount, selectedCurrency } = useCurrency();
  const { decimalsMap } = useCurrencyData();
  const formatCurrency = (n: number) => formatCurrencyWithCode(n, selectedCurrency.code, decimalsMap);

  const currentMonth = new Date().toISOString().substring(0, 7);

  // ── Commission Data ────────────────────────────────────
  const { data: commissionData, isPending: commissionLoading } = useQuery<CommissionSummary>({
    queryKey: ['agent', 'commission-summary', currentMonth],
    queryFn: () => getAgentCommissionSummary(currentMonth),
  });

  // ── Bookings Data ──────────────────────────────────────
  // Aggregates need the full set: walk server pages (100/page, max 10)
  // instead of one giant fetch — the feed clamps limit at 100.
  const { data: bookingsData, isPending: bookingsLoading } = useQuery({
    queryKey: ['agent', 'bookings-all-reports'],
    queryFn: async () => {
      const first = await getAgentBookings({ page: 1, limit: 100 });
      const pages = [first];
      const totalPages = Math.min(first.totalPages, 10);
      for (let p = 2; p <= totalPages; p++) {
        pages.push(await getAgentBookings({ page: p, limit: 100 }));
      }
      return { items: pages.flatMap((pg) => pg.items) };
    },
    staleTime: 60_000,
  });

  // Commission summary totals arrive in the backend reporting currency (USD)
  // — convert into the selected display currency before formatting.
  const commissionCurrency = commissionData?.currency ?? 'USD';
  const formatCommission = (n: number) =>
    formatCurrencyWithCode(
      commissionCurrency === selectedCurrency.code ? n : convertAmount(n, commissionCurrency),
      selectedCurrency.code,
      decimalsMap,
    );

  // ── Derived Metrics (client-side aggregates only) ──────
  const metrics = useMemo(() => {
    const now = new Date();
    const monthsCount = PERIOD_MONTHS[period];
    const items = bookingsData?.items ?? [];
    const amountInSelected = (b: { amount: number | null; currency: string | null }) =>
      b.amount != null ? convertAmount(b.amount, b.currency ?? 'USD') : 0;

    // ponytail: local-date month keys — toISOString is UTC and shifts every
    // bucket a month back in +5 timezones (all-zero charts).
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthMap = new Map<string, MonthlyTrend>();
    for (let i = 0; i < monthsCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = monthKey(d);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      monthMap.set(key, { month: key, label, bookings: 0, flights: 0, hotels: 0, revenue: 0 });
    }

    let flightRevenue = 0;
    let hotelRevenue = 0;
    const destMap = new Map<string, Destination>();

    for (const b of items) {
      const revenue = amountInSelected(b);
      if (b.type === 'flight') flightRevenue += revenue;
      if (b.type === 'hotel') hotelRevenue += revenue;
      const created = new Date(b.createdAt);
      const m = Number.isNaN(created.getTime()) ? '' : monthKey(created);
      const entry = monthMap.get(m);
      if (entry) {
        entry.bookings += 1;
        entry.revenue += revenue;
        if (b.type === 'flight') entry.flights += 1;
        if (b.type === 'hotel') entry.hotels += 1;
      }
      // Top destinations from flight routes only — hotel items carry no
      // destination field on AgentBookingItem.
      if (b.type === 'flight' && b.to) {
        const name = b.to.trim();
        if (name) {
          const d = destMap.get(name) ?? { name, bookings: 0, revenue: 0 };
          d.bookings += 1;
          d.revenue += revenue;
          destMap.set(name, d);
        }
      }
    }

    const monthlyTrends = Array.from(monthMap.values()).reverse();
    const totalBookings = monthlyTrends.reduce((s, t) => s + t.bookings, 0);
    const totalRevenue = monthlyTrends.reduce((s, t) => s + t.revenue, 0);
    const flightCount = monthlyTrends.reduce((s, t) => s + t.flights, 0);
    const hotelCount = monthlyTrends.reduce((s, t) => s + t.hotels, 0);
    const completedBookings = items.filter((b) => ['CONFIRMED', 'booked', 'completed'].includes(b.status)).length;
    const cancelledBookings = items.filter((b) => ['cancelled', 'CANCELLED'].includes(b.status)).length;

    const prev = monthlyTrends.length >= 2 ? monthlyTrends[monthlyTrends.length - 2] : null;
    const current = monthlyTrends[monthlyTrends.length - 1];
    const hasPrevRevenue = !!prev && prev.revenue > 0;
    const revenueChange = hasPrevRevenue
      ? ((current.revenue - prev.revenue) / prev.revenue) * 100
      : 0;

    const destinations = Array.from(destMap.values())
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
    const maxDestBookings = destinations.reduce((m, d) => Math.max(m, d.bookings), 0);

    return {
      monthsCount,
      totalBookings,
      totalRevenue,
      flightCount,
      hotelCount,
      flightRevenue,
      hotelRevenue,
      hasPrevRevenue,
      completedBookings,
      cancelledBookings,
      monthlyTrends,
      revenueChange,
      bookingSuccessRate: totalBookings > 0 ? (completedBookings / totalBookings) * 100 : 0,
      destinations,
      maxDestBookings,
    };
  }, [bookingsData, convertAmount, period]);

  const isLoading = commissionLoading || bookingsLoading;
  const periodLabel = `Last ${metrics.monthsCount} months`;
  const bookingsChart = metrics.monthlyTrends.map((t) => ({ month: t.label, flights: t.flights, hotels: t.hotels }));
  const revenueChart = metrics.monthlyTrends.map((t) => ({ label: t.label, value: Math.round(t.revenue) }));
  const revenueValues = revenueChart.map((p) => p.value);
  const hasRevenue = revenueValues.length > 0 && revenueValues.some((v) => v > 0);
  const totalFlightHotel = metrics.flightRevenue + metrics.hotelRevenue;
  const flightShare = totalFlightHotel > 0 ? (metrics.flightRevenue / totalFlightHotel) * 100 : 0;
  const hotelShare = totalFlightHotel > 0 ? (metrics.hotelRevenue / totalFlightHotel) * 100 : 0;

  if (isLoading) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
          <BookingsTrendSkeleton />
          <SalesTrendSkeleton />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
          <TopDestinationsSkeleton />
          <TopDestinationsSkeleton />
        </div>
        <BookingsTableSkeleton />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4">
      <AdminPageHeader
        title="Reports"
        description="Sales performance, commission earnings, and booking trends"
        actions={
          <>
            <div className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Report period">
              {(Object.keys(PERIOD_MONTHS) as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                    period === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <DownloadIcon className="size-4" />
              Export
            </button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <DashboardOverviewCardV2
          title="Total Bookings"
          period={periodLabel}
          icon={<BarChartIcon className="size-5" />}
          iconColor="var(--color-brand-teal-500)"
          cacheKey="agent-reports-bookings"
          capValue={50}
          data={{ value: metrics.totalBookings }}
        />
        <DashboardOverviewCardV2
          title="Total Revenue"
          period={periodLabel}
          icon={<DollarSignIcon className="size-5" />}
          iconColor="hsl(var(--chart-2))"
          cacheKey="agent-reports-revenue"
          capValue={10000}
          data={{ value: metrics.totalRevenue, percentageChange: metrics.hasPrevRevenue ? metrics.revenueChange : undefined, format: formatCurrency }}
        />
        <DashboardOverviewCardV2
          title="Commission Earned"
          period="Current month"
          icon={<TrendingUpIcon className="size-5" />}
          iconColor="hsl(var(--chart-4))"
          cacheKey="agent-reports-commission"
          capValue={1000}
          data={{ value: commissionData?.totalCommission ?? 0, format: formatCommission }}
        />
        <DashboardOverviewCardV2
          title="Success Rate"
          period={periodLabel}
          icon={<PlaneIcon className="size-5" />}
          iconColor="hsl(var(--chart-1))"
          data={{ value: `${metrics.bookingSuccessRate.toFixed(0)}%` }}
        />
      </div>

      {/* Analytics charts */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
        <DashboardCard
          title="Bookings Trend"
          period={periodLabel}
          size="sm"
          contentClassName="justify-start gap-y-4 px-6 pb-6"
        >
          <div className="grid grid-cols-3 justify-items-center gap-2">
            {[
              { label: 'Total', value: metrics.totalBookings },
              { label: 'Flights', value: metrics.flightCount },
              { label: 'Hotels', value: metrics.hotelCount },
            ].map((s) => (
              <div key={s.label} className="min-w-0 text-center">
                <p className="text-xl font-semibold tabular-nums sm:text-2xl">{s.value.toLocaleString()}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
          <ChartContainer config={BOOKINGS_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={bookingsChart} margin={{ top: 16, right: 12, left: 12, bottom: 0 }} barCategoryGap="24%">
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} minTickGap={14} interval="preserveStartEnd" />
              <Bar dataKey="flights" stackId="a" fill="hsl(var(--chart-2))" radius={[0, 0, 4, 4]} maxBarSize={28} isAnimationActive={false} />
              <Bar dataKey="hotels" stackId="a" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </DashboardCard>

        <DashboardCard
          title="Revenue Trend"
          period={periodLabel}
          size="sm"
          contentClassName="justify-start gap-y-4 px-6 pb-6"
        >
          <div className="grid grid-cols-3 justify-items-center gap-2">
            {[
              { label: 'Total', value: formatCurrency(metrics.totalRevenue) },
              { label: 'Highest', value: formatCurrency(Math.max(...revenueValues, 0)) },
              {
                label: 'Avg / mo',
                value: formatCurrency(metrics.monthlyTrends.length > 0 ? metrics.totalRevenue / metrics.monthlyTrends.length : 0),
              },
            ].map((s) => (
              <div key={s.label} className="min-w-0 text-center">
                <p className="truncate text-base font-semibold tabular-nums sm:text-xl">{s.value}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">{s.label}</p>
              </div>
            ))}
          </div>
          <ChartContainer config={EMPTY_CHART_CONFIG} className="aspect-auto h-[280px] w-full">
            <BarChart accessibilityLayer data={revenueChart} margin={{ top: 8, right: 12, left: 12, bottom: 4 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <ChartTooltip
                cursor={{ fill: 'hsl(var(--muted))', opacity: 0.35 }}
                content={<ChartTooltipContent hideIndicator hideLabel formatter={(value) => formatCurrency(Number(value ?? 0))} />}
              />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} interval="preserveStartEnd" />
              <Bar dataKey="value" fill="var(--color-brand-teal-500)" radius={[6, 6, 2, 2]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          {!hasRevenue ? (
            <p className="text-sm text-muted-foreground">No revenue in this period yet.</p>
          ) : (
            <ul className="space-y-2">
              <li className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <PlaneIcon className="size-4 text-brand-teal-700 dark:text-brand-teal-400" /> Flights
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(metrics.flightRevenue)} · {flightShare.toFixed(0)}%
                </span>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <HotelIcon className="size-4 text-brand-teal-700 dark:text-brand-teal-400" /> Hotels
                </span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(metrics.hotelRevenue)} · {hotelShare.toFixed(0)}%
                </span>
              </li>
            </ul>
          )}
        </DashboardCard>
      </div>

      {/* Destinations + commission */}
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
        <DashboardCard title="Top Destinations" period={periodLabel} size="sm" contentClassName="px-6 pb-6">
          {metrics.destinations.length === 0 ? (
            <div className="flex h-40 items-center justify-center">
              <p className="text-sm text-muted-foreground">No destination bookings yet.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {metrics.destinations.map((d, i) => (
                <li
                  key={d.name}
                  className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <PlaneIcon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold">
                        <span className="text-muted-foreground">#{i + 1}</span> {d.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">{d.bookings.toLocaleString()} {d.bookings === 1 ? 'booking' : 'bookings'}</p>
                      <div className="mt-1.5 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-brand-teal-500"
                          style={{ width: `${metrics.maxDestBookings > 0 ? (d.bookings / metrics.maxDestBookings) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums">{formatCurrency(d.revenue)}</p>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DashboardCard>

        <DashboardCard title="Commission Breakdown" period="Current month" size="sm" contentClassName="gap-y-3 px-6 pb-6">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Earned</span>
            <span className="font-semibold tabular-nums text-brand-teal-700 dark:text-brand-teal-400">
              {formatCommission(commissionData?.totalCommission ?? 0)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Pending</span>
            <span className="font-semibold tabular-nums">{formatCommission(commissionData?.totalPending ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Paid out</span>
            <span className="font-semibold tabular-nums">{formatCommission(commissionData?.totalPaid ?? 0)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics.completedBookings.toLocaleString()} completed · {metrics.cancelledBookings.toLocaleString()} cancelled in period.
          </p>
        </DashboardCard>
      </div>

      {/* Summary table */}
      <DashboardCard title="Monthly Summary" period={periodLabel} contentClassName="px-0 pb-0">
        <div className="overflow-x-auto px-6 pb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase text-muted-foreground">Month</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Bookings</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Flights</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Hotels</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Revenue</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium uppercase text-muted-foreground">Avg / booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {metrics.monthlyTrends.map((t) => (
                <tr key={t.month} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{t.label}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.bookings}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.flights}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{t.hotels}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{formatCurrency(t.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {t.bookings > 0 ? formatCurrency(t.revenue / t.bookings) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  );
}
