"use client";

// Reference-2 (Shadboard) dashboard card components — adapted to our
// primitives. Uses semantic tokens (bg-card, border-border, text-*) so the
// cards follow the scoped admin theme from the Customizer.

import { EllipsisVertical } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { CountUp } from "./count-up";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PercentageChangeBadge } from "./percentage-change-badge";

interface DashboardCardProps extends ComponentProps<"div"> {
  title: string;
  period?: string;
  action?: ReactNode;
  /** Content height variant (matches Reference-2 cardContentVariants). */
  size?: "xs" | "sm" | "default" | "lg";
  /** Extra classes for the header row — used for responsive header layouts. */
  headerClassName?: string;
  contentClassName?: string;
}

const cardContentSizes = {
  // Use minimum heights rather than fixed heights so data tables can grow
  // naturally without creating a nested vertical scrollbar inside the card.
  xs: "min-h-32",
  sm: "min-h-64",
  default: "min-h-96",
  lg: "min-h-[29rem]",
} as const;

export function DashboardCard({
  title,
  period,
  action,
  children,
  size,
  headerClassName,
  contentClassName,
  className,
  ...props
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "transition-[border-color,box-shadow] duration-200 ease-out",
        "hover:border-ring/40 hover:shadow-[0_12px_40px_-16px_hsl(var(--ring)/0.25)]",
        className
      )}
      {...props}
    >
      <div className={cn("flex justify-between p-6", headerClassName)}>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight">{title}</h3>
          {period && (
            <p className="mt-0.5 text-sm text-muted-foreground">{period}</p>
          )}
        </div>
        {action}
      </div>
      <div
        className={cn(
          "flex flex-col justify-between gap-y-6",
          size && cardContentSizes[size],
          contentClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface DashboardOverviewCardV2Props extends ComponentProps<"div"> {
  data: {
    /**
     * Real value from the API. `undefined` = not known yet — the card then
     * renders CountUp in provisional mode (0 → cached fallback/cap) instead
     * of a skeleton. A real `0` is a real answer and renders as 0.
     */
    value: number | string | undefined;
    /** Optional — omit to hide the trend badge. */
    percentageChange?: number;
    /** Optional formatter — enables count-up animation for numeric values. */
    format?: (n: number) => string;
  };
  /**
   * Kept for API compatibility — loading no longer swaps the value for a
   * shimmer: cards ALWAYS render a live count (0 → cached fallback → real
   * value). See CountUp.
   */
  loading?: boolean;
  title: string;
  period: string;
  action?: ReactNode;
  icon: ReactNode;
  iconColor?: string;
  /** Compact single-row presentation for dense admin summaries. */
  compact?: boolean;
  /**
   * Stable metric name for the localStorage fallback cache — repeat visits
   * count up to the last real value instead of an arbitrary cap.
   */
  cacheKey?: string;
  /**
   * Counting limit on the first visit (no cache yet) while the real value
   * is unknown — the count stops here if the backend is slow/down.
   */
  capValue?: number;
  contentClassName?: string;
}

export function DashboardOverviewCardV2({
  data,
  title,
  period,
  action,
  icon,
  iconColor = "var(--primary)",
  compact = false,
  loading = false,
  cacheKey,
  capValue,
  className,
  contentClassName,
  ...props
}: DashboardOverviewCardV2Props) {
  // Reference-2 defines --primary as a complete hsl(...) value, while chart
  // tokens are channel values. Normalize the legacy hsl(var(--primary)) form
  // so icon surfaces never silently fall back to transparent/white.
  const resolvedIconColor = iconColor === "hsl(var(--primary))" ? "var(--primary)" : iconColor;

  // NaN guard: non-finite coercions and non-numeric strings must NEVER reach
  // CountUp/formatters — Number("—") is NaN and used to render literally
  // "NaN" in revenue cards. Deliberate strings still render as-is, and
  // `undefined` (value not known yet) flows into CountUp's provisional mode.
  const isRealNumber = typeof data.value === "number" && Number.isFinite(data.value);

  if (compact) {
    return (
      <div
        data-dashboard-overview-card="true"
        data-loading={loading ? "true" : undefined}
        data-dashboard-overview-card-compact="true"
        className={cn(
          "group flex min-h-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-card-foreground shadow-sm",
          "transition-[border-color,box-shadow] duration-200 ease-out",
          "hover:border-ring/40 hover:shadow-[0_8px_24px_-14px_hsl(var(--ring)/0.3)]",
          className
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            style={{ backgroundColor: resolvedIconColor }}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:size-4"
            aria-hidden
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-foreground">{title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{period}</p>
          </div>
        </div>
        <p className="shrink-0 text-lg font-semibold tracking-tight tabular-nums text-foreground">
          {typeof data.value === "string" ? (
            // Deliberate string values ("Error", "—", "12%") from other pages render as-is.
            data.value
          ) : (
            // NEVER a skeleton: counts from 0 toward the cached fallback (or
            // capValue on first visit) and snaps to the real value the moment
            // the API responds.
            data.format ? (
              <CountUp value={isRealNumber ? data.value : undefined} format={data.format} cacheKey={cacheKey} capValue={capValue} />
            ) : (
              <CountUp value={isRealNumber ? data.value : undefined} cacheKey={cacheKey} capValue={capValue} />
            )
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      data-dashboard-overview-card="true"
      data-loading={loading ? "true" : undefined}
      className={cn(
        "group flex flex-col justify-between rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        "transition-[border-color,box-shadow] duration-200 ease-out",
        "hover:border-ring/40 hover:shadow-[0_12px_40px_-16px_hsl(var(--ring)/0.25)]",
        className
      )}
      {...props}
    >
      <div className="flex justify-between p-5">
        <div className="flex items-center gap-x-2">
          <span
            style={{
              backgroundColor: iconColor,
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-white transition-transform duration-200 ease-out group-hover:-translate-y-0.5 group-hover:scale-105"
            aria-hidden
          >
            {icon}
          </span>
          <div>
            <p className="text-sm text-muted-foreground">{period}</p>
            {data.percentageChange !== undefined && (
              <PercentageChangeBadge
                variant="ghost"
                value={data.percentageChange}
                className="p-0"
              />
            )}
          </div>
        </div>
        {action}
      </div>
      <div className={cn("space-y-1 px-5 pb-5", contentClassName)}>
        <h3 className="font-normal text-sm text-muted-foreground">{title}</h3>
        {typeof data.value === "string" ? (
          // Deliberate string values ("Error", "—", "12%") from other pages render as-is.
          <p className="break-all text-xl font-semibold tracking-tight tabular-nums">{data.value}</p>
        ) : (
          // NEVER a skeleton: counts from 0 toward the cached fallback (or
          // capValue on first visit) and snaps to the real value the moment
          // the API responds.
          <p className="break-all text-xl font-semibold tracking-tight tabular-nums">
            {data.format ? (
              <CountUp value={isRealNumber ? data.value : undefined} format={data.format} cacheKey={cacheKey} capValue={capValue} />
            ) : (
              <CountUp value={isRealNumber ? data.value : undefined} cacheKey={cacheKey} capValue={capValue} />
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export interface DashboardCardActionsDropdownProps
  extends ComponentProps<typeof DropdownMenu> {
  activePeriod?: "all" | "week" | "month" | "year";
  onSelectPeriod?: (period: "all" | "week" | "month" | "year") => void;
}

export function DashboardCardActionsDropdown({
  children,
  activePeriod,
  onSelectPeriod,
  ...props
}: DashboardCardActionsDropdownProps) {
  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="-me-2 -mt-2 text-muted-foreground"
          aria-label="More actions"
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="admin-dropdown-content">
        {children ? (
          children
        ) : onSelectPeriod ? (
          <>
            <DropdownMenuItem
              onClick={() => onSelectPeriod("all")}
              className={cn("cursor-pointer", activePeriod === "all" && "font-semibold text-primary")}
            >
              All time
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSelectPeriod("week")}
              className={cn("cursor-pointer", activePeriod === "week" && "font-semibold text-primary")}
            >
              Last week
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSelectPeriod("month")}
              className={cn("cursor-pointer", activePeriod === "month" && "font-semibold text-primary")}
            >
              Last month
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSelectPeriod("year")}
              className={cn("cursor-pointer", activePeriod === "year" && "font-semibold text-primary")}
            >
              Last year
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem>Last week</DropdownMenuItem>
            <DropdownMenuItem disabled>Last month</DropdownMenuItem>
            <DropdownMenuItem disabled>Last year</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
