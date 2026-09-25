import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = {
  primary:
    "border border-primary bg-primary text-primary-foreground shadow-[0_7px_18px_rgba(18,91,196,0.18)] hover:-translate-y-px hover:brightness-95",
  secondary:
    "border border-border bg-surface-elevated text-foreground shadow-sm hover:-translate-y-px hover:border-[#c6cdd4] hover:bg-surface",
  ghost:
    "border border-transparent bg-transparent text-foreground hover:bg-black/[0.045]",
} as const;

const buttonSizes = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
}

export function buttonStyles({
  className,
  size = "md",
  variant = "primary",
}: Pick<ButtonProps, "className" | "size" | "variant"> = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold transition-[transform,filter,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, type = "button", variant = "primary", size = "md", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonStyles({ className, size, variant })}
        {...props}
      />
    );
  },
);
