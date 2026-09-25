import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const badgeVariants = {
  neutral: "border-border bg-surface text-muted",
  accent: "border-amber-900/10 bg-amber-900/[0.08] text-[#72522d]",
  success: "border-emerald-900/10 bg-emerald-900/[0.08] text-success",
  warning: "border-orange-900/10 bg-orange-900/[0.08] text-warning",
  danger: "border-red-900/10 bg-red-900/[0.08] text-danger",
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof badgeVariants;
}

export function Badge({
  className,
  variant = "neutral",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  );
}
