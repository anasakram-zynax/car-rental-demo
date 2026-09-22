import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const surfaceVariants = {
  default: "border-border bg-surface shadow-card",
  elevated: "border-white/80 bg-surface-elevated shadow-elevated",
  glass: "border-white/70 bg-surface-glass shadow-card backdrop-blur-md",
} as const;

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof surfaceVariants;
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
} as const;

export function Surface({
  className,
  padding = "md",
  variant = "default",
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-card border",
        surfaceVariants[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}

export const Card = Surface;
