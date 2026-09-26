"use client";

import type { WorkflowProgress } from "@/lib/schema/workflow";

interface WorkflowProgressBarProps {
  progress: WorkflowProgress;
  /** Show the percentage text next to the bar. Default true. */
  showPercent?: boolean;
  /** Compact mode for embedding in search results. No title/message. */
  compact?: boolean;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "bg-zinc-200",
  running: "bg-brand-teal",
  success: "bg-emerald-500",
  failed: "bg-red-500",
  partial: "bg-amber-500",
};

const STATUS_BG: Record<string, string> = {
  idle: "bg-zinc-100",
  running: "bg-brand-teal-100",
  success: "bg-emerald-100",
  failed: "bg-red-100",
  partial: "bg-amber-100",
};

export function WorkflowProgressBar({
  progress,
  showPercent = true,
  compact = false,
  className = "",
}: WorkflowProgressBarProps) {
  const barColor = STATUS_COLORS[progress.status] ?? "bg-zinc-200";
  const bgColor = STATUS_BG[progress.status] ?? "bg-zinc-100";

  return (
    <div className={`space-y-2 ${className}`}>
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-900">{progress.title}</p>
            {progress.message && (
              <p className="text-xs text-zinc-500 mt-0.5">{progress.message}</p>
            )}
          </div>
          {showPercent && (
            <p className="text-sm font-semibold text-zinc-700 tabular-nums">
              {Math.round(progress.percent)}%
            </p>
          )}
        </div>
      )}

      {/* Progress bar track */}
      <div className={`h-2 w-full overflow-hidden rounded-full ${bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{
            width: `${Math.min(Math.max(progress.percent, 0), 100)}%`,
          }}
        />
      </div>
    </div>
  );
}
