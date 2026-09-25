"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  rootClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, error, hint, id, label, rootClassName, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = error || hint ? `${inputId}-description` : undefined;

  return (
    <div className={cn("grid gap-2", rootClassName)}>
      {label ? (
        <label
          className="text-sm font-medium text-foreground"
          htmlFor={inputId}
        >
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={descriptionId}
        aria-invalid={Boolean(error)}
        className={cn(
          "h-11 w-full rounded-control border border-border bg-surface-elevated px-3.5 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted/70 focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:bg-black/[0.04] disabled:opacity-65",
          error && "border-danger focus:border-danger focus:ring-red-900/15",
          className,
        )}
        {...props}
      />
      {error || hint ? (
        <p
          id={descriptionId}
          className={cn("text-xs text-muted", error && "text-danger")}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});
