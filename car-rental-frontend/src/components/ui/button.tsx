import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = {
  primary:
    "border border-primary bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(21,27,35,0.16)] hover:-translate-y-0.5 hover:bg-[#252d37]",
  secondary:
    "border border-border bg-surface-elevated text-foreground shadow-sm hover:-translate-y-0.5 hover:border-[#c6cdd4] hover:bg-surface",
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
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold transition-[transform,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45",
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
