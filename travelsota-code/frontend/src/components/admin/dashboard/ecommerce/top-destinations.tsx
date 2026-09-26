"use client";

// Reference-2 eCommerce "Top Products" → our "Top Destinations": top flight
// routes + top hotels ranked by booking count with revenue.

import { memo } from "react";
import { Building2, Plane } from "lucide-react";

import { DashboardCard, DashboardCardActionsDropdown } from "@/components/dashboards/dashboard-card";
import { useCurrency, useCurrencyData } from "@/context/CurrencyContext";

export interface TopDestination {
  name: string;
  type: "flight" | "hotel";
  sales: number;
  revenue: number;
  order: number;
}

interface TopDestinationsProps {
  /** Period label reported by the backend (e.g. "All time"). */
  period?: string;
  products: TopDestination[] | undefined;
  isLoading: boolean;
  /** Reporting currency of the revenue aggregates (backend converts). */
  currency?: string;
}

export const TopDestinations = memo(function TopDestinations({ period, products, isLoading, currency }: TopDestinationsProps) {
  const { supportedCurrencies } = useCurrencyData();
  const { formatPrice } = useCurrency();
  const reportingCode = currency ?? supportedCurrencies.find((c) => c.isDefault)?.code ?? "USD";
  const formatCurrency = (n: number) => formatPrice(n, reportingCode);
  // Show only the top 5 flight routes (destinations). Hotels are excluded to
  // keep the widget focused on one category, per the product decision.
  const data = (products ?? [])
    .filter((p) => p.type === "flight" && p.name !== "Flight")
    .slice(0, 5);
  const maxSales = data.reduce((m, p) => Math.max(m, p.sales), 0);

  return (
    <DashboardCard
      title="Top Destinations"
      period={period ?? "All time"}
      action={<DashboardCardActionsDropdown />}
      size="lg"
      contentClassName="px-6 pb-6"
    >
      {isLoading ? (
        <ul className="space-y-2" aria-busy="true" role="status" aria-label="Loading destinations">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2.5"
              aria-hidden
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="size-10 shrink-0 animate-pulse rounded-md bg-muted" />
                <div className="min-w-0 space-y-1.5">
                  <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-1.5 w-32 animate-pulse rounded-full bg-muted" />
                </div>
              </div>
              <div className="shrink-0 space-y-1.5 text-right">
                <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-3 w-12 animate-pulse rounded bg-muted" />
              </div>
            </li>
          ))}
        </ul>
      ) : data.length === 0 ? (
        <div className="flex h-40 items-center justify-center">
          <p className="text-sm text-muted-foreground">No destination bookings yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((product) => {
            const Icon = product.type === "flight" ? Plane : Building2;
            const share = maxSales > 0 ? (product.sales / maxSales) * 100 : 0;
            return (
              <li
                key={`${product.type}-${product.name}`}
                className="group/row flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:border-ring/30 hover:bg-muted/30 hover:shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-transform duration-200 ease-out group-hover/row:scale-105">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      <span className="text-muted-foreground">#{product.order}</span>{" "}
                      {product.name}
                    </h3>
                    <p className="text-sm capitalize text-muted-foreground">
                      {product.type} · {product.sales.toLocaleString()} bookings
                    </p>
                    <div className="mt-1.5 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${share}%`,
                          backgroundColor:
                            product.type === "flight"
                              ? "hsl(var(--chart-2))"
                              : "hsl(var(--chart-1))",
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{formatCurrency(product.revenue)}</p>
                  <p className="text-sm text-muted-foreground">Revenue</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
});
