"use client";

// Payment Status — Reference-2 "Lead Sources" radial bar chart port. Each
// status is a radial segment; the center shows the total payment count.

import { memo, useMemo } from "react";
import { Label, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import type { ChartConfig } from "@/components/ui/chart";

import { DashboardCard } from "@/components/dashboards/dashboard-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const STATUS_LABELS: Record<string, string> = {
  PAID: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
  REQUIRES_ACTION: "Action",
  AUTHORIZED: "Authorized",
};

const STATUS_FILLS: Record<string, string> = {
  PAID: "hsl(var(--chart-2))",
  PENDING: "hsl(var(--chart-3))",
  FAILED: "hsl(var(--chart-5))",
  CANCELLED: "hsl(220 9% 60%)",
  REFUNDED: "hsl(var(--chart-4))",
  REQUIRES_ACTION: "hsl(30 80% 55%)",
  AUTHORIZED: "hsl(var(--chart-1))",
};

interface PaymentStatusDistributionProps {
  paymentBreakdown: Record<string, number> | undefined;
  isLoading: boolean;
}

export const PaymentStatusDistribution = memo(function PaymentStatusDistribution({
  paymentBreakdown,
  isLoading,
}: PaymentStatusDistributionProps) {
  const { entries, total, rowData, chartConfig } = useMemo(() => {
    const rawEntries = paymentBreakdown
      ? Object.entries(paymentBreakdown).filter(([, count]) => count > 0)
      : [];
    const sum = rawEntries.reduce((s, [, count]) => s + count, 0);
    const data = rawEntries.reduce<Record<string, number>>((acc, [status, count]) => {
      acc[status] = count;
      return acc;
    }, {});
    const config = rawEntries.reduce<ChartConfig>((acc, [status]) => {
      acc[status] = { label: STATUS_LABELS[status] ?? status };
      return acc;
    }, {});
    return { entries: rawEntries, total: sum, rowData: data, chartConfig: config };
  }, [paymentBreakdown]);

  return (
    <DashboardCard
      title="Payment Status"
      contentClassName="min-h-56 justify-center gap-y-3 px-6 pb-6"
      className="md:col-span-1"
    >
      {isLoading ? (
        <div className="flex h-full flex-col items-center justify-center gap-3" aria-busy="true">
          <div className="size-36 animate-pulse rounded-full bg-muted" aria-hidden />
          <div className="h-3 w-20 animate-pulse rounded bg-muted" aria-hidden />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">No payment data</p>
        </div>
      ) : (
        <>
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square w-full max-w-52 h-52 min-h-52"
          >
            <RadialBarChart
              accessibilityLayer
              data={[rowData]}
              innerRadius="80%"
              outerRadius="190%"
              barSize={7}
            >
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-2xl font-semibold"
                          >
                            {total.toLocaleString()}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 20}
                            className="fill-muted-foreground text-sm"
                          >
                            Payments
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }}
                />
              </PolarRadiusAxis>
              {entries.map(([status]) => (
                <RadialBar
                  key={status}
                  dataKey={status}
                  fill={STATUS_FILLS[status] ?? "hsl(var(--chart-3))"}
                  cornerRadius={4}
                  isAnimationActive={false}
                  className="stroke-transparent stroke-2"
                />
              ))}
            </RadialBarChart>
          </ChartContainer>
        </>
      )}
    </DashboardCard>
  );
});
