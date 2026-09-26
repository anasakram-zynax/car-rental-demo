"use client";

// Reference-2 (Shadboard) PercentageChangeBadge — adapted to our Badge
// primitive with semantic success/error tokens so it follows the admin theme.

import { TrendingDown, TrendingUp } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

interface PercentageChangeBadgeProps extends ComponentProps<"span"> {
  value: number;
  /** "default" = filled pill; "ghost" = plain text (used inside cards) */
  variant?: "default" | "ghost";
}

const percentFmt = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});

function formatPercent(value: number) {
  return percentFmt.format(value / 100);
}

export function PercentageChangeBadge({
  value,
  className,
  variant = "default",
  ...props
}: PercentageChangeBadgeProps) {
  const isNonNegativeChange = value >= 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        variant === "default" &&
          cn(
            "rounded-full px-2.5 py-0.5",
            isNonNegativeChange
              ? "bg-success-100 text-success-700 dark:bg-success-900/20 dark:text-success-400"
              : "bg-error-100 text-error-700 dark:bg-error-900/20 dark:text-error-400"
          ),
        variant === "ghost" &&
          cn(
            "bg-transparent text-sm text-foreground",
            isNonNegativeChange
              ? "text-success-600 dark:text-success-400"
              : "text-error-600 dark:text-error-400"
          ),
        className
      )}
      data-non-negative-change={isNonNegativeChange}
      {...props}
    >
      {isNonNegativeChange && <span>+</span>}
      <span>{formatPercent(value)}</span>
      <span className="ms-0.5" aria-hidden>
        {isNonNegativeChange ? (
          <TrendingUp className="size-3.5" />
        ) : (
          <TrendingDown className="size-3.5" />
        )}
      </span>
    </span>
  );
}
