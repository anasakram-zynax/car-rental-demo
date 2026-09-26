"use client";

import { cn } from "@/lib/cn";

// ─── Bold status color palette (Reference-2 style) ────────
export const STATUS_COLORS = {
  // Booking statuses
  CONFIRMED: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  HELD: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  PENDING: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  PROCESSING: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  FAILED: "border-destructive/30 bg-destructive/10 text-destructive",
  CANCELLED: "border-border bg-muted text-muted-foreground",
  EXPIRED: "border-border bg-muted text-muted-foreground",
  ARCHIVED: "border-border bg-muted text-muted-foreground",

  // Payment statuses
  PAID: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  AUTHORIZED: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  REFUNDED: "border-chart-4/30 bg-chart-4/10 text-chart-4",

  // Generic
  ACTIVE: "border-chart-2/30 bg-chart-2/10 text-chart-2",
  INACTIVE: "border-border bg-muted text-muted-foreground",
  DRAFT: "border-border bg-muted text-muted-foreground",
  PAUSED: "border-chart-3/30 bg-chart-3/10 text-chart-3",
  SUSPENDED: "border-destructive/30 bg-destructive/10 text-destructive",

  // Module types
  FLIGHT: "border-chart-1/30 bg-chart-1/10 text-chart-1",
  HOTEL: "border-chart-2/30 bg-chart-2/10 text-chart-2",
} as const;

// ─── Status dot colors (for the dot inside badges) ───────
export const STATUS_DOT_COLORS: Record<string, string> = {
  CONFIRMED: "bg-chart-2",
  HELD: "bg-chart-1",
  PENDING: "bg-chart-3",
  PROCESSING: "bg-chart-1",
  FAILED: "bg-destructive",
  CANCELLED: "bg-muted-foreground",
  EXPIRED: "bg-muted-foreground",
  ARCHIVED: "bg-muted-foreground",
  PAID: "bg-chart-2",
  AUTHORIZED: "bg-chart-1",
  REFUNDED: "bg-chart-4",
  ACTIVE: "bg-chart-2",
  INACTIVE: "bg-muted-foreground",
  DRAFT: "bg-muted-foreground",
  PAUSED: "bg-chart-3",
  SUSPENDED: "bg-destructive",
  FLIGHT: "bg-chart-1",
  HOTEL: "bg-chart-2",
};

// ─── Shared Status Badge Component ───────────────────────
interface StatusBadgeProps {
  status: string;
  label?: string;
  /** Override the color mapping */
  colorMap?: Record<string, string>;
  /** Show colored dot */
  dot?: boolean;
  className?: string;
}

export function StatusBadge({ status, label, colorMap, dot = true, className }: StatusBadgeProps) {
  const colors: Record<string, string> = colorMap ?? STATUS_COLORS;
  const colorClass = colors[status] ?? "border-border bg-muted text-muted-foreground";
  const displayLabel = label ?? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", colorClass, className)}>
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT_COLORS[status] ?? "bg-zinc-400")} />
      )}
      {displayLabel}
    </span>
  );
}
