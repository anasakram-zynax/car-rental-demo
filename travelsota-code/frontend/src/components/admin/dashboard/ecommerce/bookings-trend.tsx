"use client";

// Reference-2 eCommerce "Churn Rate" → our "Bookings Trend": stacked bar of
// Flights vs Hotels bookings with a 3-stat summary.
//
// The Monthly / Quarterly / Annually switcher is REAL: it re-queries
// /admin/dashboard/bookings-trend?period=… (owned by the page) and re-labels
// the summary. The previous three-dot menu was a static disabled decoration —
// replaced by the working switcher.

import { memo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import ChartTab, { type TrendPeriod } from "@/components/common/ChartTab";
import { DashboardCard } from "@/components/dashboards/dashboard-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface BookingsTrendMonth {
  month: string;
  flights: number;
  hotels: number;
}

interface BookingsTrendProps {
  months: BookingsTrendMonth[] | undefined;
  isLoading: boolean;
  /** Current period — re-queries the trend endpoint on change. */
  period: TrendPeriod;
  onPeriodChange: (period: TrendPeriod) => void;
}

const chartConfig = {
  flights: { label: "Flights" },
  hotels: { label: "Hotels" },
} satisfies ChartConfig;

const PERIOD_SUBTITLE: Record<TrendPeriod, string> = {
  monthly: "Last 12 months",
  quarterly: "Last 4 quarters",
  annually: "Last 3 years",
};

export const BookingsTrend = memo(function BookingsTrend({ months, isLoading, period, onPeriodChange }: BookingsTrendProps) {
  const data = months ?? [];
  const totalFlights = data.reduce((s, m) => s + m.flights, 0);
  const totalHotels = data.reduce((s, m) => s + m.hotels, 0);
  const fmt = (n: number) => n.toLocaleString();

  const summary = [
    { label: "Total Bookings", value: totalFlights + totalHotels, dot: "bg-chart-1" },
    { label: "Flights", value: totalFlights, dot: "bg-chart-2" },
    { label: "Hotels", value: totalHotels, dot: "border border-border bg-white" },
  ];

  return (
    <DashboardCard
      title="Bookings Trend"
      period={PERIOD_SUBTITLE[period]}
      action={<ChartTab value={period} onChange={onPeriodChange} />}
      size="sm"
      headerClassName="flex-col items-start gap-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between"
      contentClassName="gap-y-4 justify-start px-6 pb-6"
    >
      <div className="grid grid-cols-3 justify-items-center gap-2 sm:gap-3">
        {summary.map((item) => (
          <div key={item.label} className="min-w-0 text-center">
            {isLoading ? (
              <div className="mx-auto h-8 w-14 animate-pulse rounded bg-muted" role="status" aria-label="Loading" />
            ) : (
              <p className="text-xl font-semibold tabular-nums sm:text-2xl">{fmt(item.value)}</p>
            )}
            <h3 className="mt-0.5 inline-flex items-baseline gap-x-1 text-xs text-muted-foreground sm:text-sm">
              <span className={`h-2.5 w-2.5 shrink-0 self-center rounded-sm ${item.dot}`} aria-hidden />
              <span className="truncate">{item.label}</span>
            </h3>
          </div>
        ))}
      </div>
      <ChartContainer config={chartConfig} className="aspect-auto w-full h-[280px]">
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 16, right: 12, left: 12, bottom: 0 }}
          barCategoryGap="24%"
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={14}
            interval="preserveStartEnd"
            tickFormatter={(value) => (typeof value === "string" ? value.slice(0, 6) : value)}
          />
          <Bar
            dataKey="flights"
            stackId="a"
            fill="hsl(var(--chart-2))"
            radius={[0, 0, 4, 4]}
            maxBarSize={28}
            isAnimationActive={false}
          />
          <Bar
            dataKey="hotels"
            stackId="a"
            fill="hsl(var(--chart-1))"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </DashboardCard>
  );
});
