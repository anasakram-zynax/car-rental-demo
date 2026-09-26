import { adminRequest } from '@/lib/api/admin-client';

// ─── Types ────────────────────────────────────────────────────────

export interface CurrencySummary {
  id: string;
  code: string;
  symbol: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  isBase: boolean;
  exchangeRate: number;
  decimals: number;
  updatedAt: string;
  createdAt: string;
}

export type CurrencyDetail = CurrencySummary;

export interface ExchangeRateAuditEntry {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: 'manual' | 'api' | 'cron';
  createdAt: string;
}

export interface UpdateRatesResult {
  updated: number;
  baseCurrency: string;
}

// ─── API Functions ────────────────────────────────────────────────

export function getCurrencies() {
  return adminRequest<CurrencySummary[]>('/admin/currencies');
}

export function getCurrency(id: string) {
  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}`);
}

export function createCurrency(data: {
  code: string;
  symbol: string;
  name: string;
  decimals?: number;
}) {
  return adminRequest<CurrencyDetail>('/admin/currencies', {
    method: 'POST',
    body: data,
  });
}

export function updateCurrency(
  id: string,
  data: {
    symbol?: string;
    name?: string;
    decimals?: number;
    exchangeRate?: number;
  },
) {
  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}`, {
    method: 'PUT',
    body: data,
  });
}

export function deactivateCurrency(id: string) {  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}/deactivate`, {
    method: 'POST',
    body: {},
  });
}

export function deleteCurrency(id: string) {
  return adminRequest<unknown>(`/admin/currencies/${id}`, { method: 'DELETE' });
}

export function activateCurrency(id: string) {
  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}/activate`, {
    method: 'POST',
    body: {},
  });
}

export function setDefaultCurrency(id: string) {
  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}/set-default`, {
    method: 'POST',
    body: {},
  });
}

export function setBaseCurrency(id: string) {
  return adminRequest<CurrencyDetail>(`/admin/currencies/${id}/set-base`, {
    method: 'POST',
    body: {},
  });
}

export function updateAllExchangeRates() {
  return adminRequest<UpdateRatesResult>('/admin/currencies/update-rates', {
    method: 'POST',
    body: {},
  });
}

export function getExchangeRateAuditTrail() {
  return adminRequest<ExchangeRateAuditEntry[]>('/admin/currencies/audit/trail');
}

// ─── Auto-Update Schedule ────────────────────────────────────────

export interface RateSchedule {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
}

export function getRateSchedule() {
  return adminRequest<RateSchedule>('/admin/currencies/rate-schedule');
}

export function updateRateSchedule(data: {
  enabled?: boolean;
  intervalMinutes?: number;
}) {
  return adminRequest<RateSchedule>('/admin/currencies/rate-schedule', {
    method: 'PATCH',
    body: data,
  });
}

export function enableRateSchedule() {
  return adminRequest<RateSchedule>('/admin/currencies/rate-schedule/enable', {
    method: 'POST',
    body: {},
  });
}

export function disableRateSchedule() {
  return adminRequest<RateSchedule>('/admin/currencies/rate-schedule/disable', {
    method: 'POST',
    body: {},
  });
}

export function runRateScheduleNow() {
  return adminRequest<RateSchedule>('/admin/currencies/rate-schedule/run-now', {
    method: 'POST',
    body: {},
  });
}

export interface RateScheduleRun {
  id: string;
  source: 'manual' | 'scheduled';
  status: 'running' | 'success' | 'failed';
  ratesUpdated: number | null;
  baseCurrency: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export function getRateScheduleHistory() {
  return adminRequest<RateScheduleRun[]>('/admin/currencies/rate-schedule/history');
}

// ─── Metadata ─────────────────────────────────────────────────────

export type CurrencyAction = 'set-default' | 'set-base' | 'deactivate' | 'activate' | 'edit';
