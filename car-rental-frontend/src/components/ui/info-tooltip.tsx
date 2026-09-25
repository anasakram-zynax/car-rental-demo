"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

interface InfoTooltipProps {
  label: string;
  className?: string;
}

export function InfoTooltip({ className, label }: InfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <span
      ref={rootRef}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-label="More information"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="grid size-6 place-items-center rounded-full text-muted outline-none transition-colors hover:bg-black/[0.05] hover:text-foreground focus-visible:ring-4 focus-visible:ring-[var(--ring)]"
      >
        <Info aria-hidden="true" size={15} />
      </button>
      {isOpen ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-[calc(100%+0.55rem)] left-0 z-50 w-[min(16rem,calc(100vw-2rem))] rounded-lg bg-[#101d37] px-3 py-2 text-xs leading-5 font-normal text-white shadow-xl"
        >
          {label}
          <span
            aria-hidden="true"
            className="absolute top-full left-2.5 border-4 border-transparent border-t-[#101d37]"
          />
        </span>
      ) : null}
    </span>
  );
}
