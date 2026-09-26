"use client";

import { useState, useCallback } from "react";
import {
  testTravelportConnection,
  testDuffleConnection,
  testAmadeusConnection,
  testHotelbedsConnection,
  testRatehawkConnection,
  getProviderMeta,
  type ProviderKey,
  type ProviderConnectionTestResult,
} from "@/features/admin/api/admin-settings";
import { Button } from "@/components/ui/button";

function CheckCircleSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircleSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function AlertCircleSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

interface HealthResult {
  provider: ProviderKey;
  success: boolean;
  summary: string;
  durationMs: number;
}

interface ProviderHealthMonitorProps {
  moduleProviders: ProviderKey[];
  onComplete?: (results: HealthResult[]) => void;
}

export default function ProviderHealthMonitor({
  moduleProviders,
  onComplete,
}: ProviderHealthMonitorProps) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<HealthResult[]>([]);
  const [expanded, setExpanded] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setRunning(true);
    setResults([]);

    const healthResults: HealthResult[] = [];

    for (const pk of moduleProviders) {
      try {
        let res: ProviderConnectionTestResult;
        switch (pk) {
          case "travelport":
            res = await testTravelportConnection();
            break;
          case "duffel":
            res = await testDuffleConnection();
            break;
          case "amadeus":
            res = await testAmadeusConnection();
            break;
          case "hotelbeds":
            res = await testHotelbedsConnection();
            break;
          case "ratehawk":
            res = await testRatehawkConnection();
            break;
          default:
            continue;
        }
        healthResults.push({
          provider: pk,
          success: res.success,
          summary: res.summary,
          durationMs: res.durationMs,
        });
      } catch {
        healthResults.push({
          provider: pk,
          success: false,
          summary: "Connection test failed unexpectedly.",
          durationMs: 0,
        });
      }
    }

    setResults(healthResults);
    setRunning(false);
    onComplete?.(healthResults);
  }, [moduleProviders, onComplete]);

  const allPassed = results.length > 0 && results.every((r) => r.success);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            results.length === 0
              ? "bg-gray-100 text-gray-400 dark:bg-gray-800"
              : allPassed
                ? "bg-success-50 text-success-600 dark:bg-success-900/20"
                : "bg-error-50 text-error-600 dark:bg-error-900/20"
          }`}>
            {results.length === 0 ? (
              <AlertCircleSvg className="size-4" />
            ) : allPassed ? (
              <CheckCircleSvg className="size-4" />
            ) : (
              <XCircleSvg className="size-4" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Provider Health
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {results.length === 0
                ? "Run a health check to verify all provider connections"
                : allPassed
                  ? `All ${results.length} provider(s) connected successfully`
                  : `${results.filter((r) => r.success).length}/${results.length} provider(s) passed`}
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={runHealthCheck}
          loading={running}
          disabled={running}
        >
          {running ? "Checking..." : "Run Health Check"}
        </Button>
      </div>

      {results.length > 0 && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {results.map((r) => {
              const meta = getProviderMeta(r.provider);
              return (
                <div
                  key={r.provider}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                    r.success
                      ? "bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400"
                      : "bg-error-50 text-error-700 dark:bg-error-900/20 dark:text-error-400"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${
                    r.success ? "bg-success-500" : "bg-error-500"
                  }`} />
                  {meta?.label ?? r.provider}
                  <span className="opacity-60">
                    {r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className={`size-3 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {expanded ? "Hide details" : "View details"}
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
              {results.map((r) => {
                const meta = getProviderMeta(r.provider);
                return (
                  <div
                    key={r.provider}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {meta?.label ?? r.provider}
                      </span>
                      <span className={`text-xs ${
                        r.success
                          ? "text-success-600 dark:text-success-400"
                          : "text-error-600 dark:text-error-400"
                      }`}>
                        {r.success ? "Connected" : "Failed"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{r.durationMs > 0 ? `${(r.durationMs / 1000).toFixed(1)}s` : ""}</span>
                      <span className="max-w-[200px] truncate">{r.summary.slice(0, 60)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
