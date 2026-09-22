import type { ReactNode } from "react";
import { BackgroundShell } from "./background-shell";

interface GhostFibersBackgroundProps {
  children: ReactNode;
  className?: string;
}

export function GhostFibersBackground({
  children,
  className,
}: GhostFibersBackgroundProps) {
  // Integration seam: replace only the visual layer with the official React Bits
  // Ghost Fibers source when it is added; route layouts stay unchanged.
  return (
    <BackgroundShell
      className={className}
      visualClassName="ghost-fibers-visual"
    >
      {children}
    </BackgroundShell>
  );
}
