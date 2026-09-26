"use client";

// Reference-2 eCommerce "Sales Trend" → our "Sales Trend": revenue bars with
// Highest/Lowest/Total/Avg summary (fed by the revenue endpoint).
//
// The Monthly / Quarterly / Annually switcher is REAL — it re-queries
// /admin/dashboard/revenue?range=… (owned by the page; 30d feeds the monthly
// view with day buckets). Labels are intentionally NOT truncated to 3 chars:
// quarterly/annually return "Jun '26"-style labels which are meaningful.

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { memo } from "react";

import ChartTab, { type TrendPeriod } from "@/components/common/ChartTab";
import { DashboardCard } from "@/components/dashboards/dashboard-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useCurrency, useCurrencyData } from "@/context/CurrencyContext";

const EMPTY_CHART_CONFIG = {} satisfies ChartConfig;
const SALES_GRADIENT_ID = "sales-trend-gradient";

export interface RevenuePoint {
  label: string;
  value: number;
}

interface SalesTrendProps {
  data: RevenuePoint[] | undefined;
  isLoading: boolean;
  /** Current period — re-queries the revenue endpoint on change. */
  period: TrendPeriod;
  onPeriodChange: (period: TrendPeriod) => void;
  /** Reporting currency of the revenue aggregates (backend converts). */
  currency?: string;
}

const PERIOD_SUBTITLE: Record<TrendPeriod, string> = {
  monthly: "Last 30 days, daily",
  quarterly: "Last 3 months, monthly",
  annually: "Last 12 months, monthly",
};

function SummaryItem({
  title,
  value,
  description,
}: {
  title: string;
  /** Undefined while loading → renders a shimmer block (never "NaN"). */
  value?: string;
  description?: string;
}) {
  return (
    <li>
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      {value === undefined ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-muted" role="status" aria-label="Loading" />
      ) : (
        <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      )}
      {description && (
        <p className="text-xs font-semibold text-muted-foreground">{description}</p>
      )}
    </li>
  );
}

export const SalesTrend = memo(function SalesTrend({ data, period, onPeriodChange, currency }: SalesTrendProps) {
  // Revenue points arrive in the backend reporting currency — convert into
  // the admin's selected display currency (header switcher).
  const { supportedCurrencies } = useCurrencyData();
  const { formatPrice } = useCurrency();
  const reportingCode = currency ?? supportedCurrencies.find((c) => c.isDefault)?.code ?? "USD";
  const formatCurrency = (n: number) => formatPrice(n, reportingCode);

  const points = data ?? [];
  const values = points.map((p) => p.value);
  const hasData = values.length > 0;
  const total = values.reduce((s, v) => s + v, 0);
  const avg = hasData ? total / values.length : 0;
  const highest = hasData ? Math.max(...values) : 0;
  const lowest = hasData ? Math.min(...values) : 0;
  const highestIdx = values.indexOf(highest);
  const lowestIdx = values.indexOf(lowest);

  return (
    <DashboardCard
      title="Sales Trend"
      period={PERIOD_SUBTITLE[period]}
      action={<ChartTab value={period} onChange={onPeriodChange} />}
      size="lg"
      headerClassName="flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
      contentClassName="gap-y-5 justify-start px-6 pb-6"
    >
      {/* Even vertical rhythm (the old justify-around stretched items to the
          container edges — "values attached to the border"). min-h-0 keeps the
          list compact above the chart. */}
      <ul className="grid min-h-0 grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-row sm:justify-start sm:gap-10">
        <SummaryItem
          title="Highest Sales"
          value={hasData ? formatCurrency(highest) : undefined}
          description={hasData ? `on ${points[highestIdx]?.label ?? ""}` : undefined}
        />
        <SummaryItem
          title="Lowest Sales"
          value={hasData ? formatCurrency(lowest) : undefined}
          description={hasData ? `on ${points[lowestIdx]?.label ?? ""}` : undefined}
        />
        <SummaryItem
          title="Total Sales"
          value={hasData ? formatCurrency(total) : undefined}
          description="for the period"
        />
        <SummaryItem
          title="Avg. Sales"
          value={hasData ? formatCurrency(avg) : undefined}
          description="per period"
        />
      </ul>
      <ChartContainer config={EMPTY_CHART_CONFIG} className="aspect-auto w-full h-[300px]">
        <BarChart
          accessibilityLayer
          data={points}
          margin={{ top: 8, right: 12, left: 12, bottom: 4 }}
        >
          <defs>
            <linearGradient id={SALES_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.9}
              />
              <stop
                offset="100%"
                stopColor="hsl(var(--chart-4))"
                stopOpacity={0.55}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <ChartTooltip
            cursor={{ fill: "hsl(var(--muted))", opacity: 0.35 }}
            content={
              <ChartTooltipContent
                hideIndicator
                hideLabel
                formatter={(value) =>
                  formatCurrency(Number(value ?? 0))
                }
              />
            }
          />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={18}
            interval="preserveStartEnd"
          />
          <Bar
            dataKey="value"
            fill={`url(#${SALES_GRADIENT_ID})`}
            radius={[6, 6, 2, 2]}
            maxBarSize={36}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </DashboardCard>
  );
});
