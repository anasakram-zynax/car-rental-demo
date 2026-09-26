"use client";

import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────

export type CheckStatus = "success" | "warning" | "failed" | "skipped" | "info";

export interface ProviderConnectionCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  durationMs?: number;
  endpoint?: string;
  method?: string;
  httpStatus?: number;
  safeDetails?: Record<string, unknown>;
}

export interface ProviderConnectionWarning {
  code: string;
  message: string;
}

export interface ProviderConnectionTestResult {
  provider: string;
  module: "hotels" | "flights" | "payments";
  environment: "sandbox" | "development" | "production" | "mtls" | "test" | "unknown";
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  summary: string;
  detectedAccount?: {
    keyId?: string;
    accountType?: string;
    environmentHint?: string;
  };
  checks: ProviderConnectionCheck[];
  warnings: ProviderConnectionWarning[];
}

// ── Helpers ────────────────────────────────────────────────────

const STATUS_COLORS: Record<CheckStatus, string> = {
  success: "text-emerald-400",
  warning: "text-amber-400",
  failed: "text-red-400",
  skipped: "text-zinc-500",
  info: "text-sky-400",
};

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimestamp(iso: string, offsetMs: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + offsetMs);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  success: "SUCCESS",
  warning: "WARNING",
  failed: "FAILED",
  skipped: "SKIPPED",
  info: "INFO",
};

function getEnvBadgeColor(env: string): string {
  switch (env) {
    case "production":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "sandbox":
    case "development":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "mtls":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

// ── Component ──────────────────────────────────────────────────

interface ConnectionTestTerminalProps {
  result: ProviderConnectionTestResult | null;
  running: boolean;
  onClear?: () => void;
  onRetest?: () => void;
}

export default function ConnectionTestTerminal({
  result,
  running,
  onClear,
  onRetest,
}: ConnectionTestTerminalProps) {
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyDiagnostics = async () => {
    if (!result) return;
    const checks = result.checks ?? [];
    const lines = [
      `Provider: ${result.provider}`,
      `Module: ${result.module}`,
      `Environment: ${result.environment}`,
      `Status: ${result.success ? "SUCCESS" : "FAILED"}`,
      `Duration: ${formatDuration(result.durationMs)}`,
      `Started: ${result.startedAt}`,
      `Completed: ${result.completedAt}`,
      "",
      "── Checks ──",
      ...(() => {
        let cumulativeMs = 0;
        return checks.map((c) => {
          cumulativeMs += c.durationMs ?? 0;
          const ts = formatTimestamp(result.startedAt, cumulativeMs);
          return `${STATUS_LABELS[c.status]} [${ts.slice(-8)}] ${c.message}${c.durationMs ? ` (${formatDuration(c.durationMs)})` : ""}`;
        });
      })(),
      ...(result.warnings.length > 0
        ? ["", "── Warnings ──", ...result.warnings.map((w) => `WARNING [--:--:--] ${w.message} [${w.code}]`)]
        : []),
    ];

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy via textarea
      const textarea = document.createElement("textarea");
      textarea.value = lines.join("\n");
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClear = () => {
    // Clear is handled by the parent via state — this button triggers a callback
    if (onClear) onClear();
  };

  if (!result && !running) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-950">
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>
          <span className="ml-2 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
            Connection Test{result ? " — Results" : " — Running..."}
          </span>
        </div>
        {result && (
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${getEnvBadgeColor(result.environment)}`}>
              {result.environment}
            </span>
            <button
              type="button"
              onClick={copyDiagnostics}
              className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
            {onClear && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
              >
                Clear
              </button>
            )}
            {onRetest && (
              <button
                type="button"
                onClick={onRetest}
                className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-[11px] text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
              >
                Re-test
              </button>
            )}
            <div className="ml-1 flex items-center gap-1">
              {result.success ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                  <span className="text-xs">✓</span>
                  Passed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-medium">
                  <span className="text-xs">✗</span>
                  Failed
                </span>
              )}
              <span className="text-[11px] text-zinc-500">
                {formatDuration(result.durationMs)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Terminal body */}
      <div className="max-h-[400px] overflow-y-auto p-3 font-mono text-[12px] leading-relaxed">
        {running && !result && (
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
            Testing provider connection...
          </div>
        )}

        {result && (
          <div className="space-y-0.5">
            {/* Summary line */}
            <div className="flex items-center gap-2 text-zinc-300 pb-2 border-b border-zinc-800 mb-2">
              <span className="text-zinc-500">[START]</span>
              <span>{result.summary}</span>
            </div>

            {/* Checks */}
            {(result.checks ?? []).reduce((acc, check, idx) => {
              const cumulativeMs = idx === 0
                ? (check.durationMs ?? 0)
                : acc.cumulativeMs + (check.durationMs ?? 0);
              const timestamp = formatTimestamp(result.startedAt, cumulativeMs);
              acc.checks.push(
                <div key={check.id}>
                  <div
                    className={`flex items-start gap-2 py-0.5 ${
                      check.status === "failed" ? "bg-red-950/20 -mx-3 px-3" : ""
                    } ${check.status === "warning" ? "bg-amber-950/10 -mx-3 px-3" : ""}`}
                  >
                    <span
                      className={`shrink-0 text-[10px] ${STATUS_COLORS[check.status]} font-medium w-[64px]`}
                    >
                      {STATUS_LABELS[check.status]}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-600 w-[52px]">
                      [{timestamp.slice(-8)}]
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300 truncate">
                          {check.message}
                        </span>
                        {check.durationMs ? (
                          <span className="shrink-0 text-[10px] text-zinc-500 ml-auto">
                            {formatDuration(check.durationMs)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {(check.endpoint || check.safeDetails) && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(check.id)}
                        className="shrink-0 text-[10px] text-zinc-600 hover:text-zinc-400 mt-0.5"
                      >
                        {expandedChecks.has(check.id) ? "▲" : "▼"}
                      </button>
                    )}
                  </div>
                  {expandedChecks.has(check.id) && (check.endpoint || check.safeDetails) && (
                    <div className="ml-[120px] pb-1 space-y-0.5">
                      {check.endpoint && (
                        <div className="text-[11px] text-zinc-500">
                          <span className="text-zinc-600">Endpoint: </span>
                          {check.method && (
                            <span className="text-zinc-600">
                              [{check.method}]{" "}
                            </span>
                          )}
                          <span className="break-all">{check.endpoint}</span>
                          {check.httpStatus && (
                            <span className="text-zinc-600">
                              {" "}
                              → HTTP {check.httpStatus}
                            </span>
                          )}
                        </div>
                      )}
                      {check.safeDetails && (
                        <div className="text-[11px] text-zinc-500">
                          <span className="text-zinc-600">Details: </span>
                          <span className="break-all">
                            {JSON.stringify(check.safeDetails)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
              return acc;
            }, { checks: [] as React.ReactNode[], cumulativeMs: 0 }).checks}

            {/* Warnings */}
            {(result.warnings ?? []).length > 0 && (
              <>
                <div className="border-t border-zinc-800 my-2 pt-2" />
                {(result.warnings ?? []).map((w) => (
                  <div
                    key={w.code}
                    className="flex items-start gap-2 py-0.5 bg-amber-950/10 -mx-3 px-3"
                  >
                    <span className={`shrink-0 text-[10px] ${STATUS_COLORS.warning} font-medium w-[64px]`}>WARNING</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-amber-300/90">{w.message}</span>
                      <span className="ml-2 text-[10px] text-zinc-600">
                        [{w.code}]
                      </span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
