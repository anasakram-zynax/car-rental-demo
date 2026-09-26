/**
 * Provider connection test types.
 * Used by all provider test-connection endpoints (hotels, flights, payments).
 * Never returns secrets in responses.
 */

export type ConnectionTestModule = 'hotels' | 'flights' | 'payments';
export type ConnectionTestEnvironment = 'sandbox' | 'development' | 'production' | 'mtls' | 'unknown' | 'test';
export type CheckStatus = 'success' | 'warning' | 'failed' | 'skipped' | 'info';

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
  module: ConnectionTestModule;
  environment: ConnectionTestEnvironment;
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
  rawDebug?: {
    requestId?: string;
    upstreamTraceId?: string;
  };
}

export interface ProviderConnectionTestResponse {
  ok: boolean;
  data: ProviderConnectionTestResult;
}
