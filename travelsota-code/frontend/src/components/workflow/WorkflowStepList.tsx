"use client";

import type { WorkflowStep } from "@/lib/schema/workflow";

interface WorkflowStepListProps {
  steps: WorkflowStep[];
  /** Compact mode hides descriptions and durations. */
  compact?: boolean;
  className?: string;
}

const STATUS_ICON: Record<string, string> = {
  pending: "○",
  running: "◌",
  success: "✓",
  warning: "⚠",
  failed: "✗",
  skipped: "–",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-300",
  running: "text-brand-teal-500",
  success: "text-emerald-600",
  warning: "text-amber-600",
  failed: "text-red-600",
  skipped: "text-zinc-400",
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-zinc-50 border-zinc-200",
  running: "bg-brand-teal-50/60 border-brand-teal-200",
  success: "bg-emerald-50/60 border-emerald-200",
  warning: "bg-amber-50/60 border-amber-200",
  failed: "bg-red-50/60 border-red-200",
  skipped: "bg-zinc-50 border-zinc-100",
};

const PROVIDER_BADGE: Record<string, string> = {
  hotelbeds: "bg-blue-100 text-blue-700",
  ratehawk: "bg-purple-100 text-purple-700",
  travelport: "bg-cyan-100 text-cyan-700",
  payment: "bg-zinc-100 text-zinc-700",
  system: "bg-zinc-100 text-zinc-500",
};

function formatDuration(ms?: number): string {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-teal-200 border-t-brand-teal-600" />
  );
}

export function WorkflowStepList({
  steps,
  compact = false,
  className = "",
}: WorkflowStepListProps) {
  if (steps.length === 0) return null;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {steps.map((step) => {
        const isRunning = step.status === "running";
        const bgColor = STATUS_BG[step.status] ?? STATUS_BG.pending;
        const iconColor = STATUS_COLORS[step.status] ?? STATUS_COLORS.pending;

        return (
          <div
            key={step.id}
            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${bgColor} ${
              isRunning ? "animate-pulse" : ""
            }`}
          >
            {/* Status icon */}
            <div className={`mt-0.5 shrink-0 text-sm font-bold ${iconColor}`}>
              {isRunning ? <Spinner /> : STATUS_ICON[step.status] ?? "○"}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`font-medium text-sm ${
                    step.status === "skipped"
                      ? "text-zinc-400 line-through"
                      : step.status === "pending"
                        ? "text-zinc-400"
                        : "text-zinc-800"
                  }`}
                >
                  {step.label}
                </span>

                {/* Provider badge */}
                {step.provider && step.provider !== "system" && (
                  <span
                    className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                      PROVIDER_BADGE[step.provider] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {step.provider}
                  </span>
                )}
              </div>

              {/* Description (non-compact only) */}
              {!compact && step.description && (
                <p className="mt-0.5 text-xs text-zinc-500">{step.description}</p>
              )}

              {/* Message (for failure/warning) */}
              {step.message && (
                <p className="mt-0.5 text-xs font-medium text-zinc-600">{step.message}</p>
              )}

              {/* Timing (non-compact only) */}
              {!compact && step.durationMs != null && (
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  {formatDuration(step.durationMs)}
                </p>
              )}
            </div>

            {/* Duration badge (compact) */}
            {compact && step.durationMs != null && (
              <span className="shrink-0 text-[11px] text-zinc-400 tabular-nums">
                {formatDuration(step.durationMs)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
