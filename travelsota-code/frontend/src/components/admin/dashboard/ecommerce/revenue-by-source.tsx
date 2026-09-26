"use client";

// Revenue by Source — Flights vs Hotels split. Uses a hand-rolled CSS stacked
// bar (flexbox percentage widths) because the recharts stacked-vertical-bar
// version only rendered one segment in practice. Reliable + premium.

import { memo } from "react";
import {
  DashboardCard,
  DashboardCardActionsDropdown,
} from "@/components/dashboards/dashboard-card";
import { PercentageChangeBadge } from "@/components/dashboards/percentage-change-badge";
import { Badge } from "@/components/ui/badge";
import { formatPercent } from "@/lib/format";
import { useCurrency, useCurrencyData } from "@/context/CurrencyContext";

export interface RevenueSource {
  name: string;
  value: number;
  percentage: number;
  fill: string;
}

interface RevenueBySourceProps {
  /** Period label reported by the backend (e.g. "All time"). */
  period?: string;
  sources: RevenueSource[] | undefined;
  totalRevenue: number | undefined;
  percentageChange: number | undefined;
  isLoading: boolean;
  /** Reporting currency of the revenue aggregates (backend converts). */
  currency?: string;
}

export const RevenueBySource = memo(function RevenueBySource({
  period,
  sources,
  totalRevenue,
  percentageChange,
  isLoading,
  currency,
}: RevenueBySourceProps) {
  const { supportedCurrencies } = useCurrencyData();
  const { formatPrice } = useCurrency();
  const reportingCode = currency ?? supportedCurrencies.find((c) => c.isDefault)?.code ?? "USD";
  const formatCurrency = (n: number) => formatPrice(n, reportingCode);
  const data = sources ?? [];

  return (
    <DashboardCard
      title="Revenue by Source"
      period={period ?? "All time"}
      action={<DashboardCardActionsDropdown />}
      size="sm"
      contentClassName="gap-y-3 px-6 pb-6"
    >
      <div className="flex items-end gap-x-1">
        {isLoading ? (
          <div className="h-8 w-32 animate-pulse rounded bg-muted" role="status" aria-label="Loading" />
        ) : (
          <p className="text-2xl font-semibold">{formatCurrency(totalRevenue ?? 0)}</p>
        )}
        {!isLoading && percentageChange !== undefined && (
          <PercentageChangeBadge
            value={percentageChange}
            variant="ghost"
            className="p-0"
          />
        )}
      </div>

      {/* CSS stacked bar — segments sized by percentage share. */}
      <div
        className="flex h-9 w-full overflow-hidden rounded-lg ring-1 ring-border/60"
        role="img"
        aria-label="Revenue by source split"
      >
        {data.map((item, i) => (
          <div
            key={item.name}
            className="group relative flex h-full items-center justify-center transition-[width] duration-500"
            style={{
              width: `${Math.max(item.percentage * 100, item.value > 0 ? 2 : 0)}%`,
              backgroundColor: item.fill,
              borderLeft: i > 0 ? "2px solid hsl(var(--card))" : undefined,
            }}
            title={`${item.name}: ${formatCurrency(item.value)}`}
          >
            {item.percentage >= 0.12 && (
              <span className="px-1 text-xs font-semibold text-foreground drop-shadow-sm">
                {formatPercent(item.percentage)}
              </span>
            )}
          </div>
        ))}
      </div>

      <ul className="space-y-2">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
                aria-hidden
              >
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-sm bg-muted" />
                  <span className="h-4 w-16 animate-pulse rounded bg-muted" />
                </span>
                <span className="flex items-center gap-3">
                  <span className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <span className="h-6 w-14 animate-pulse rounded-md bg-muted" />
                </span>
              </li>
            ))
          : data.map((item) => (
          <li
            key={item.name}
            className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 transition-[background-color,border-color] duration-150 ease-out hover:border-ring/30 hover:bg-muted/50"
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: item.fill }}
                aria-hidden
              />
              {item.name}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">
                {formatCurrency(item.value)}
              </span>
              <Badge
                style={{ backgroundColor: item.fill }}
                className="w-14 justify-center text-foreground"
              >
                {formatPercent(item.percentage)}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </DashboardCard>
  );
});
