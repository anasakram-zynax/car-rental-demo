"use client";

import type { WorkflowStep } from "@/lib/schema/workflow";

interface ProviderProgressGridProps {
  steps: WorkflowStep[];
  /** Provider-specific results from the backend (e.g. providerResults from hotel search) */
  providerResults?: Array<{
    provider: string;
    status: "ok" | "failed" | "timeout";
    hotelCount?: number;
    elapsedMs?: number;
    errorCode?: string;
    errorMessage?: string;
  }>;
  className?: string;
}

const PROVIDER_META: Record<
  string,
  { label: string; color: string; dotColor: string }
> = {
  hotelbeds: {
    label: "Provider A",
    color: "border-blue-200 bg-blue-50",
    dotColor: "bg-blue-500",
  },
  ratehawk: {
    label: "Provider B",
    color: "border-purple-200 bg-purple-50",
    dotColor: "bg-purple-500",
  },
  travelport: {
    label: "Provider C",
    color: "border-cyan-200 bg-cyan-50",
    dotColor: "bg-cyan-500",
  },
  payment: {
    label: "Payment",
    color: "border-zinc-200 bg-zinc-50",
    dotColor: "bg-zinc-500",
  },
};

function Dot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      aria-hidden
    />
  );
}

function getStepForProvider(
  steps: WorkflowStep[],
  provider: string,
): WorkflowStep | undefined {
  return steps.find(
    (s) =>
      s.provider === provider &&
      (s.status === "running" || s.status === "success" || s.status === "failed"),
  );
}

function getResultForProvider(
  results: Array<{
    provider: string;
    status: "ok" | "failed" | "timeout";
    hotelCount?: number;
    elapsedMs?: number;
  }>,
  provider: string,
) {
  return results.find((r) => r.provider === provider);
}

export function ProviderProgressGrid({
  steps,
  providerResults,
  className = "",
}: ProviderProgressGridProps) {
  // Collect unique providers from steps + results
  const providerSet = new Set<string>();
  steps.forEach((s) => {
    if (s.provider && s.provider !== "system") providerSet.add(s.provider);
  });
  providerResults?.forEach((r) => providerSet.add(r.provider));

  const providers = Array.from(providerSet);

  if (providers.length === 0) return null;

  return (
    <div className={`grid gap-2 sm:grid-cols-2 ${className}`}>
      {providers.map((provider) => {
        const meta = PROVIDER_META[provider] ?? {
          label: provider,
          color: "border-zinc-200 bg-zinc-50",
          dotColor: "bg-zinc-400",
        };
        const step = getStepForProvider(steps, provider);
        const result = providerResults
          ? getResultForProvider(providerResults, provider)
          : undefined;

        const isRunning = step?.status === "running";
        const isSuccess =
          result?.status === "ok" || step?.status === "success";
        const isFailed =
          result?.status === "failed" ||
          result?.status === "timeout" ||
          step?.status === "failed";

        return (
          <div
            key={provider}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all ${
              meta.color
            } ${isRunning ? "animate-pulse" : ""}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Dot color={meta.dotColor} />
              <span className="font-medium text-zinc-800 truncate">
                {meta.label}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Hotel count from results */}
              {result?.hotelCount != null && (
                <span className="text-xs font-medium text-zinc-600 tabular-nums">
                  {result.hotelCount} hotel{result.hotelCount !== 1 ? "s" : ""}
                </span>
              )}

              {/* Duration */}
              {(result?.elapsedMs ?? step?.durationMs) != null && (
                <span className="text-[11px] text-zinc-400 tabular-nums">
                  {(result?.elapsedMs ?? step?.durationMs)! < 1000
                    ? `${result?.elapsedMs ?? step?.durationMs}ms`
                    : `${((result?.elapsedMs ?? step?.durationMs)! / 1000).toFixed(1)}s`}
                </span>
              )}

              {/* Status icon */}
              {isRunning ? (
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent text-brand-teal-500" />
              ) : isSuccess ? (
                <span className="text-emerald-600 text-sm font-bold">✓</span>
              ) : isFailed ? (
                <span className="text-red-500 text-sm font-bold">✗</span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Compact summary row shown after search completes — placed above results.
 * Shows one line per provider with status.
 */
export function ProviderResultSummary({
  providerResults,
  className = "",
}: {
  providerResults: Array<{
    provider: string;
    status: "ok" | "failed" | "timeout";
    hotelCount?: number;
    errorMessage?: string;
  }>;
  className?: string;
}) {
  if (!providerResults || providerResults.length === 0) return null;

  return (
    <div className={`space-y-1 ${className}`}>
      {providerResults.map((r) => {
        const meta = PROVIDER_META[r.provider] ?? {
          label: r.provider,
          color: "",
          dotColor: "",
        };
        const isOk = r.status === "ok";
        const isFailed = r.status === "failed" || r.status === "timeout";
        return (
          <div
            key={r.provider}
            className="flex items-center gap-2 text-xs text-zinc-500"
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isOk ? "bg-emerald-500" : isFailed ? "bg-red-400" : "bg-zinc-300"
              }`}
            />
            <span className="font-medium">{meta.label}:</span>
            {isOk && r.hotelCount != null && (
              <span>
                {r.hotelCount} hotel{r.hotelCount !== 1 ? "s" : ""} found
              </span>
            )}
            {isFailed && (
              <span className="text-red-500">
                {r.errorMessage ?? r.status}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
