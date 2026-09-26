"use client";

// Reference-2 eCommerce "Customer Insights" — 4 tiles: total, new, returning
// and VIP customers, mapped 1:1 from our customer-insights endpoint.

import { memo } from "react";
import { Crown, UserCheck, UserPlus, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/dashboards/dashboard-card";

export interface CustomerInsightsData {
  period: string;
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  vipCustomers: number;
}

interface CustomerInsightsProps {
  data: CustomerInsightsData | undefined;
  isLoading: boolean;
}

function InsightItem({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  /** Undefined while loading → shimmer block instead of a dash/NaN. */
  value?: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (      <li className="flex gap-x-2">
        <Badge
          style={{ backgroundColor: color }}
          className="aspect-square size-12"
          aria-hidden
        >
          {icon}
        </Badge>
        <div className="overflow-hidden">
          <h4 className="truncate text-sm leading-tight text-muted-foreground">
            {title}
          </h4>
          {value === undefined ? (
            <div className="h-7 w-14 animate-pulse rounded bg-muted" role="status" aria-label="Loading" />
          ) : (
            <p className="text-2xl font-semibold">{value.toLocaleString()}</p>
          )}
        </div>
      </li>
  );
}

export const CustomerInsights = memo(function CustomerInsights({ data, isLoading }: CustomerInsightsProps) {
  return (
    <DashboardCard
      title="Customer Insights"
      period={data?.period ?? "All time"}
      size="xs"
      className="md:col-span-3"
      contentClassName="justify-center px-4 pb-4 sm:px-6 sm:pb-6"
    >
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fit,minmax(165px,1fr))] md:justify-items-center">
        <InsightItem
          title="Total Customers"
          value={isLoading ? undefined : (data?.totalCustomers ?? 0)}
          icon={<Users className="size-full" />}
          color="hsl(var(--chart-1))"
        />
        <InsightItem
          title="New Customers"
          value={isLoading ? undefined : (data?.newCustomers ?? 0)}
          icon={<UserPlus className="size-full" />}
          color="hsl(var(--chart-2))"
        />
        <InsightItem
          title="Returning Customers"
          value={isLoading ? undefined : (data?.returningCustomers ?? 0)}
          icon={<UserCheck className="size-full" />}
          color="hsl(var(--chart-3))"
        />
        <InsightItem
          title="VIP Customers"
          value={isLoading ? undefined : (data?.vipCustomers ?? 0)}
          icon={<Crown className="size-full" />}
          color="hsl(var(--chart-4))"
        />
      </ul>
    </DashboardCard>
  );
});
