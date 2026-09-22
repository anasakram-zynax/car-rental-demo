import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface BackgroundShellProps {
  children: ReactNode;
  className?: string;
  visual?: ReactNode;
  visualClassName?: string;
}

export function BackgroundShell({
  children,
  className,
  visual,
  visualClassName,
}: BackgroundShellProps) {
  return (
    <div className={cn("relative isolate min-h-svh overflow-x-clip", className)}>
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-0 -z-10", visualClassName)}
      >
        {visual}
      </div>
      <div className="relative min-h-svh">{children}</div>
    </div>
  );
}
