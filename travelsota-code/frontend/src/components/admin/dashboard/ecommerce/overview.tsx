"use client";

// Reference-2 eCommerce "Overview" — 4 KPI cards (DashboardOverviewCardV2)
// mapped to our travel metrics: Total Revenue, Revenue (30d), Total Bookings,
// Avg. Booking Value.
//
// No-loading contract: cards never render a skeleton AND never render a
// "loading" affordance (the old "Syncing" badge is gone — it reintroduced the
// perception of waiting the count-up exists to remove). Each metric passes a
// `cacheKey` (localStorage fallback = last real value) and a `capValue`
// (first-visit counting limit). CountUp counts from 0 immediately, holds at
// the fallback while the API is in flight or down, then snaps to the real
// value the moment it arrives. While `stats` is undefined the card receives
// `value: undefined` → provisional counting mode; a real 0 from the API is
// a real answer and renders as 0.
//
// Animation-stability rules (why formatters live at module scope):
// - CountUp is memoized; ANY changing prop re-arms it and can reset the DOM
//   text mid-count. Formatters are stable module-level references, values
//   are primitives, and transient props (loading/period swaps, badges) were
//   removed from card inputs entirely — so a parent re-render can never
//   restart a running count.

import { BadgePercent, HandCoins, ReceiptText, ShoppingBag } from "lucide-react";
import { memo, useMemo, useState } from "react";

import {
  DashboardCardActionsDropdown,
  DashboardOverviewCardV2,
} from "@/components/dashboards/dashboard-card";
import { useCurrency, useCurrencyData } from "@/context/CurrencyContext";

export interface OverviewStats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  pendingPayments: number;
  bookingBreakdown: { flights: number; hotels: number };
  paymentBreakdown: Record<string, number>;
  newUsers30d: number;
  newBookings30d: number;
  revenue30d: number;
  /** Reporting currency of the revenue aggregates (backend converts). */
  revenueCurrency?: string;
  periods?: {
    all: { totalRevenue: number; totalBookings: number; avgBookingValue: number; totalUsers: number };
    week: { totalRevenue: number; totalBookings: number; avgBookingValue: number; totalUsers: number };
    month: { totalRevenue: number; totalBookings: number; avgBookingValue: number; totalUsers: number };
    year: { totalRevenue: number; totalBookings: number; avgBookingValue: number; totalUsers: number };
  };
}

interface EcommerceOverviewProps {
  stats: OverviewStats | undefined;
  isLoading: boolean;
}

const percentOf = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

// Exact-or-nothing: a percentage badge is only shown when BOTH numbers behind
// it exist. Never fabricate a 0% (or "0/0") trend from half-loaded data.
const trend = (stats: OverviewStats | undefined, part: number | undefined, total: number | undefined) =>
  stats && typeof part === "number" && typeof total === "number" && total > 0
    ? percentOf(part, total)
    : undefined;

type MetricPeriod = "all" | "week" | "month" | "year";

const PERIOD_LABELS: Record<MetricPeriod, string> = {
  all: "All time",
  week: "Last week",
  month: "Last month",
  year: "Last year",
};

export const EcommerceOverview = memo(function EcommerceOverview({ stats }: EcommerceOverviewProps) {
  const [totalRevenuePeriod, setTotalRevenuePeriod] = useState<MetricPeriod>("all");
  const [revenue30dPeriod, setRevenue30dPeriod] = useState<MetricPeriod>("month");
  const [totalBookingsPeriod, setTotalBookingsPeriod] = useState<MetricPeriod>("all");
  const [avgBookingValuePeriod, setAvgBookingValuePeriod] = useState<MetricPeriod>("all");

  // Revenue stats have no per-item currency (aggregated platform-side) —
  // format using the platform's default currency. Memoized on primitives
  // (code + decimals), not the decimalsMap object itself, so the formatter
  // reference stays stable across the 30-min currency refetch cycle and
  // doesn't re-arm the CountUp animation (see file-level comment above).
  const { supportedCurrencies } = useCurrencyData();
  const { formatPrice, selectedCurrency } = useCurrency();
  // Revenue aggregates arrive in the backend reporting currency — convert
  // into the admin's selected display currency (header switcher, synced with
  // the storefront). Memoized on the two codes so the reference stays stable
  // across the 30-min currency refetch cycle and doesn't re-arm the CountUp
  // animation (see file-level comment above).
  const reportingCode = stats?.revenueCurrency ?? supportedCurrencies.find((c) => c.isDefault)?.code ?? "USD";
  const selectedCode = selectedCurrency.code;
  const formatCurrency = useMemo(
    () => (n: number) => formatPrice(n, reportingCode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reportingCode, selectedCode],
  );

  const activeTotalRevenue = stats?.periods
    ? stats.periods[totalRevenuePeriod].totalRevenue
    : totalRevenuePeriod === "month"
      ? stats?.revenue30d
      : stats?.totalRevenue;

  const activeRevenue30d = stats?.periods
    ? stats.periods[revenue30dPeriod].totalRevenue
    : revenue30dPeriod === "all"
      ? stats?.totalRevenue
      : stats?.revenue30d;

  const activeTotalBookings = stats?.periods
    ? stats.periods[totalBookingsPeriod].totalBookings
    : totalBookingsPeriod === "month"
      ? stats?.newBookings30d
      : stats?.totalBookings;

  const fallbackAvgBookingValue =
    stats && stats.totalBookings > 0 && stats.totalRevenue !== undefined
      ? Math.round((stats.totalRevenue / stats.totalBookings) * 100) / 100
      : undefined;

  const activeAvgBookingValue = stats?.periods
    ? stats.periods[avgBookingValuePeriod].avgBookingValue
    : fallbackAvgBookingValue;

  return (
    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 md:col-span-2 md:grid-cols-4">
      <DashboardOverviewCardV2
        cacheKey="admin-dashboard-total-revenue"
        capValue={1_000_000}
        data={{
          value: activeTotalRevenue,
          percentageChange: totalRevenuePeriod === "all" ? trend(stats, stats?.revenue30d, stats?.totalRevenue) : undefined,
          format: formatCurrency,
        }}
        title="Total Revenue"
        period={PERIOD_LABELS[totalRevenuePeriod]}
        action={<DashboardCardActionsDropdown activePeriod={totalRevenuePeriod} onSelectPeriod={setTotalRevenuePeriod} />}
        icon={<BadgePercent className="size-6" />}
        iconColor="hsl(var(--chart-1))"
        contentClassName="min-w-0"
      />
      <DashboardOverviewCardV2
        cacheKey="admin-dashboard-revenue-30d"
        capValue={250_000}
        data={{
          value: activeRevenue30d,
          format: formatCurrency,
        }}
        title={revenue30dPeriod === "month" ? "Revenue (30d)" : "Revenue"}
        period={PERIOD_LABELS[revenue30dPeriod]}
        action={<DashboardCardActionsDropdown activePeriod={revenue30dPeriod} onSelectPeriod={setRevenue30dPeriod} />}
        icon={<HandCoins className="size-6" />}
        iconColor="hsl(var(--chart-2))"
        contentClassName="min-w-0"
      />
      <DashboardOverviewCardV2
        cacheKey="admin-dashboard-total-bookings"
        capValue={10_000}
        data={{
          value: activeTotalBookings,
          percentageChange: totalBookingsPeriod === "all" ? trend(stats, stats?.newBookings30d, stats?.totalBookings) : undefined,
        }}
        title="Total Bookings"
        period={PERIOD_LABELS[totalBookingsPeriod]}
        action={<DashboardCardActionsDropdown activePeriod={totalBookingsPeriod} onSelectPeriod={setTotalBookingsPeriod} />}
        icon={<ShoppingBag className="size-6" />}
        iconColor="hsl(var(--chart-3))"
        contentClassName="min-w-0"
      />
      <DashboardOverviewCardV2
        cacheKey="admin-dashboard-avg-booking-value"
        capValue={2_500}
        data={{
          value: activeAvgBookingValue,
          format: formatCurrency,
        }}
        title="Avg. Booking Value"
        period={PERIOD_LABELS[avgBookingValuePeriod]}
        action={<DashboardCardActionsDropdown activePeriod={avgBookingValuePeriod} onSelectPeriod={setAvgBookingValuePeriod} />}
        icon={<ReceiptText className="size-6" />}
        iconColor="hsl(var(--chart-4))"
        contentClassName="min-w-0"
      />
    </div>
  );
});
