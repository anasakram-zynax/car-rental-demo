'use client';

import { Suspense, useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Plus, RefreshCw, Pencil, Star, Globe, Power, X, Check, ChevronDown, Trash2 } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { useToast } from '@/hooks/useToast';
import { DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getSortedRowModel, getFilteredRowModel, useReactTable,
} from '@tanstack/react-table';
import {
  getCurrencies, createCurrency, updateCurrency, deactivateCurrency, activateCurrency,
  setDefaultCurrency, setBaseCurrency, updateAllExchangeRates, deleteCurrency,
  getRateSchedule, updateRateSchedule, enableRateSchedule, disableRateSchedule,
  runRateScheduleNow, getRateScheduleHistory,
  type CurrencySummary, type RateSchedule, type RateScheduleRun,
} from '@/features/admin/api/admin-settings-currency';
import { cn } from '@/lib/cn';

// ─── Currency flag emoji resolver ───────────────────────────────

const FLAG_MAP: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', KWD: '🇰🇼', BHD: '🇧🇭',
  AED: '🇦🇪', SAR: '🇸🇦', JPY: '🇯🇵', CNY: '🇨🇳', INR: '🇮🇳',
  PKR: '🇵🇰', TRY: '🇹🇷', OMR: '🇴🇲', QAR: '🇶🇦', JOD: '🇯🇴',
  KRW: '🇰🇷', SGD: '🇸🇬', HKD: '🇭🇰', THB: '🇹🇭', MYR: '🇲🇾',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NOK: '🇳🇴', SEK: '🇸🇪',
  DKK: '🇩🇰', NZD: '🇳🇿', ZAR: '🇿🇦', BRL: '🇧🇷', MXN: '🇲🇽',
};
function currencyFlag(code: string): string { return FLAG_MAP[code] ?? '💱'; }

const PRESET_INTERVALS = [
  { label: '6 hours', value: 360 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
  { label: '36 hours', value: 2160 },
  { label: '7 days', value: 10080 },
];

function formatInterval(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${minutes / 60}h`;
  return `${minutes / 1440}d`;
}
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

const modalOverlay = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm';
const modalPanel = 'relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_25px_60px_rgba(0,0,0,0.15)]';
const modalEase = [0.16, 1, 0.3, 1] as const;

// ─── Create currency modal ──────────────────────────────────────

function CreateCurrencyModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toasts = useToast();
  const [code, setCode] = useState('');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [decimals, setDecimals] = useState('2');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!code.trim() || !symbol.trim() || !name.trim()) {
      toasts.error('Missing fields', 'Code, symbol, and name are required.');
      return;
    }
    const dec = parseInt(decimals, 10);
    if (isNaN(dec) || dec < 0 || dec > 8) {
      toasts.error('Invalid decimals', 'Must be between 0 and 8.');
      return;
    }
    setSaving(true);
    try {
      await createCurrency({ code: code.trim().toUpperCase(), symbol: symbol.trim(), name: name.trim(), decimals: dec });
      toasts.success('Currency created', `${code.toUpperCase()} added.`);
      onSaved(); onClose();
    } catch {
      toasts.error('Failed', 'Currency may already exist.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlay} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.2, ease: modalEase }}
        className={modalPanel} onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Add Currency</h3>
            <p className="mt-0.5 text-sm text-zinc-500">Create a new currency for customers to use.</p>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Input label="Currency Code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))} placeholder="USD" helperText="3-letter ISO 4217 code" />
          <Input label="Currency Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="US Dollar" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" helperText="Display symbol" />
            <Input label="Decimal Places" type="number" min={0} max={8} value={decimals} onChange={(e) => setDecimals(e.target.value)} helperText="2 = cents, 3 = KWD" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleCreate} loading={saving}>Create Currency</Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Edit currency modal ────────────────────────────────────────

function EditCurrencyModal({ currency, onClose, onSaved }: { currency: CurrencySummary; onClose: () => void; onSaved: () => void }) {
  const toasts = useToast();
  const [symbol, setSymbol] = useState(currency.symbol);
  const [name, setName] = useState(currency.name);
  const [decimals, setDecimals] = useState(String(currency.decimals));
  const [exchangeRate, setExchangeRate] = useState(String(currency.exchangeRate));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!symbol.trim() || !name.trim()) {
      toasts.error('Missing fields', 'Symbol and name are required.');
      return;
    }
    const dec = parseInt(decimals, 10);
    if (isNaN(dec) || dec < 0 || dec > 8) {
      toasts.error('Invalid decimals', 'Must be between 0 and 8.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { symbol: symbol.trim(), name: name.trim(), decimals: dec };
      if (!currency.isBase) {
        const rate = parseFloat(exchangeRate);
        if (isNaN(rate) || rate <= 0) {
          toasts.error('Invalid rate', 'Exchange rate must be positive.');
          setSaving(false); return;
        }
        body.exchangeRate = rate;
      }
      await updateCurrency(currency.id, body);
      toasts.success('Updated', `${currency.code} saved.`);
      onSaved(); onClose();
    } catch {
      toasts.error('Failed', `Could not update ${currency.code}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlay} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.2, ease: modalEase }}
        className={modalPanel} onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-lg">
              {currencyFlag(currency.code)}
            </span>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Edit {currency.code}</h3>
              <p className="mt-0.5 text-sm text-zinc-500">{currency.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Input label="Currency Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="US Dollar" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
            <Input label="Decimal Places" type="number" min={0} max={8} value={decimals} onChange={(e) => setDecimals(e.target.value)} helperText={`e.g. 2 = cents`} />
          </div>
          {currency.isBase ? (
            <div className="rounded-xl bg-brand-teal/8 border border-brand-teal/20 px-4 py-3 text-sm text-brand-teal font-medium">
              {currency.code} is the base currency — its exchange rate is always 1.0
            </div>
          ) : (
            <Input label="Exchange Rate" type="number" step="0.000001" min="0.000001" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} helperText={`1 ${currency.code} = ? base units`} />
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>Save Changes</Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Confirmation modal ─────────────────────────────────────────

function ConfirmModal({ title, description, confirmLabel, variant = 'primary', loading, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string;
  variant?: 'primary' | 'danger'; loading: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <div className={modalOverlay} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }} transition={{ duration: 0.2, ease: modalEase }}
        className="relative w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_25px_60px_rgba(0,0,0,0.15)]" onClick={(e) => e.stopPropagation()}
      >
        <div className={cn('mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full', variant === 'danger' ? 'bg-red-50 text-red-600' : 'bg-brand-teal/10 text-brand-teal')}>
          {variant === 'danger' ? <Power className="size-6" /> : <Check className="size-6" />}
        </div>
        <h3 className="text-center text-lg font-bold text-zinc-900">{title}</h3>
        <p className="mt-2 text-center text-sm text-zinc-500">{description}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Schedule card ──────────────────────────────────────────────

function ScheduleCard({
  schedule, isEnabled, editInterval, loading, toggling, saving, running,
  onToggle, onSave, onRunNow, onIntervalChange,
}: {
  schedule: RateSchedule | null;
  isEnabled: boolean; editInterval: string;
  loading: boolean; toggling: boolean; saving: boolean; running: boolean;
  onToggle: (enable: boolean) => void;
  onSave: (interval?: number) => void;
  onRunNow: () => void;
  onIntervalChange: (v: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <Skeleton variant="text" width="40%" className="mb-4" />
        <div className="flex gap-3 mb-4">
          <Skeleton variant="rect" width={60} height={28} />
          <Skeleton variant="rect" width={80} height={28} />
          <Skeleton variant="rect" width={90} height={28} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton variant="text" />
          <Skeleton variant="text" />
          <Skeleton variant="text" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onToggle(!isEnabled)}
            disabled={toggling}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
              isEnabled ? 'bg-emerald-500' : 'bg-zinc-200',
              toggling && 'opacity-50',
            )}
            role="switch" aria-checked={isEnabled}
          >
            <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200', isEnabled ? 'translate-x-5' : 'translate-x-0')} />
          </button>
          <div>
            <h3 className="text-sm font-bold text-zinc-900">Auto-Update Exchange Rates</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {isEnabled && schedule ? `Runs every ${formatInterval(schedule.intervalMinutes)}` : 'Scheduled updates are turned off'}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onRunNow} loading={running} disabled={running}>
          <RefreshCw className={cn('size-3.5', running && 'animate-spin')} />
          Run Now
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-zinc-500">Update Interval</label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="number" min={5} max={10080}
              value={editInterval}
              onChange={(e) => onIntervalChange(e.target.value)}
              className="w-24 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-sm font-mono outline-none focus:border-brand-teal/40 focus:ring-2 focus:ring-brand-teal/10"
              disabled={saving}
            />
            <span className="text-xs text-zinc-400">minutes</span>
            <Button variant="primary" size="sm" onClick={() => onSave()} loading={saving} disabled={saving}>Save</Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESET_INTERVALS.map((p) => (
              <button
                key={p.value}
                onClick={() => { onIntervalChange(String(p.value)); onSave(p.value); }}
                disabled={saving}
                className={cn(
                  'cursor-pointer rounded-full px-3 py-1 text-[11px] font-medium transition-colors disabled:opacity-50',
                  parseInt(editInterval) === p.value ? 'bg-brand-teal/10 text-brand-teal ring-1 ring-brand-teal/20' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 border-t border-zinc-100 pt-4">
          <div>
            <span className="text-xs text-zinc-400">Last Run</span>
            <p className="mt-0.5 text-sm font-medium text-zinc-700">{schedule ? formatDate(schedule.lastRunAt) : '—'}</p>
          </div>
          <div>
            <span className="text-xs text-zinc-400">Next Run</span>
            <p className="mt-0.5 text-sm font-medium text-zinc-700">
              {!isEnabled ? <span className="text-zinc-400">Disabled</span> : formatDate(schedule?.nextRunAt ?? null)}
            </p>
          </div>
          <div>
            <span className="text-xs text-zinc-400">Last Status</span>
            <div className="mt-0.5">
              {!schedule?.lastStatus ? (
                <span className="text-sm text-zinc-400">—</span>
              ) : schedule.lastStatus === 'success' ? (
                <Badge variant="success">Success</Badge>
              ) : schedule.lastStatus === 'failed' ? (
                <Badge variant="error">Failed</Badge>
              ) : (
                <Badge variant="warning">Running</Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Run history section ────────────────────────────────────────

function RunHistoryTable({ history }: { history: RateScheduleRun[] }) {
  if (history.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200">
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
        <RefreshCw className="size-3.5 text-zinc-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Update History</span>
        <span className="ml-auto text-xs text-zinc-300">{history.length} runs</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Started</th>
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Source</th>
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Status</th>
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Rates</th>
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Base</th>
              <th className="px-4 py-2.5 font-semibold text-zinc-400">Error</th>
            </tr>
          </thead>
          <tbody>
            {history.map((run) => (
              <tr key={run.id} className="border-b border-zinc-50 transition-colors hover:bg-zinc-50/50">
                <td className="px-4 py-2.5 whitespace-nowrap text-zinc-600">{new Date(run.startedAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 capitalize text-zinc-400">{run.source}</td>
                <td className="px-4 py-2.5">
                  {run.status === 'success' ? <Badge variant="success">Success</Badge>
                   : run.status === 'failed' ? <Badge variant="error">Failed</Badge>
                   : <Badge variant="warning">Running</Badge>}
                </td>
                <td className="px-4 py-2.5 font-mono text-zinc-600">{run.ratesUpdated ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-zinc-600">{run.baseCurrency ?? '—'}</td>
                <td className="px-4 py-2.5 max-w-[200px] truncate text-zinc-400" title={run.error ?? ''}>{run.error ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────

function CurrenciesPageInner() {
  const queryClient = useQueryClient();
  const toasts = useToast();
  const { hasPermission } = usePermissions();

  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CurrencySummary | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ currency: CurrencySummary; action: string } | null>(null);

  // Schedule state
  const [editInterval, setEditInterval] = useState('1440');
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);

  // ─── Queries ─────────────────────────────────────────────────

  const currenciesQuery = useQuery({
    queryKey: ['admin', 'currencies'],
    queryFn: () => getCurrencies().then((data) => data.map((c) => ({ ...c, exchangeRate: Number(c.exchangeRate) }))),
    staleTime: 30_000,
  });

  const scheduleQuery = useQuery({
    queryKey: ['admin', 'currencies', 'schedule'],
    queryFn: getRateSchedule,
    staleTime: 10_000,
  });

  const historyQuery = useQuery({
    queryKey: ['admin', 'currencies', 'history'],
    queryFn: getRateScheduleHistory,
    staleTime: 15_000,
  });

  // Sync schedule state from query
  const schedule = scheduleQuery.data ?? null;
  useMemo(() => {
    if (schedule) {
      setEditInterval(String(schedule.intervalMinutes));
      setIsScheduleEnabled(schedule.enabled);
    }
  }, [schedule]);

  // ─── Mutations ───────────────────────────────────────────────

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] });
  }, [queryClient]);

  const invalidateSchedule = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'currencies', 'schedule'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'currencies', 'history'] });
  }, [queryClient]);

  const updateRatesMutation = useMutation({
    mutationFn: updateAllExchangeRates,
    onSuccess: () => { toasts.success('Rates updated'); invalidate(); },
    onError: () => toasts.error('Update failed'),
  });

  const setDefaultMutation = useMutation({
    mutationFn: setDefaultCurrency,
    onSuccess: () => { toasts.success('Default currency updated'); invalidate(); },
    onError: () => toasts.error('Failed to set default'),
  });

  const setBaseMutation = useMutation({
    mutationFn: setBaseCurrency,
    onSuccess: () => { toasts.success('Base currency updated'); invalidate(); },
    onError: () => toasts.error('Failed to set base'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      active ? activateCurrency(id) : deactivateCurrency(id),
    onSuccess: (_, vars) => {
      toasts.success(vars.active ? 'Currency activated' : 'Currency deactivated');
      invalidate();
    },
    onError: () => toasts.error('Action failed'),
  });

  const toggleScheduleMutation = useMutation({
    mutationFn: (enable: boolean) => enable ? enableRateSchedule() : disableRateSchedule(),
    onSuccess: (updated) => {
      setIsScheduleEnabled(updated.enabled);
      toasts.success(updated.enabled ? 'Schedule enabled' : 'Schedule disabled');
      invalidateSchedule();
    },
    onError: () => toasts.error('Failed to toggle schedule'),
  });

  const saveScheduleMutation = useMutation({
    mutationFn: (interval: number) => updateRateSchedule({ intervalMinutes: interval, enabled: isScheduleEnabled }),
    onSuccess: (updated) => {
      setEditInterval(String(updated.intervalMinutes));
      setIsScheduleEnabled(updated.enabled);
      toasts.success('Schedule saved');
      invalidateSchedule();
    },
    onError: () => toasts.error('Failed to save schedule'),
  });

  const runNowMutation = useMutation({
    mutationFn: runRateScheduleNow,
    onSuccess: (updated) => {
      setIsScheduleEnabled(updated.enabled);
      toasts.success('Rates updated via schedule');
      invalidate();
      invalidateSchedule();
    },
    onError: () => toasts.error('Run failed'),
  });

  // ─── Permissions ─────────────────────────────────────────────

  const canManage = hasPermission(PermissionCode.SETTINGS_MANAGE_CURRENCIES);
  const canUpdateRates = hasPermission(PermissionCode.SETTINGS_UPDATE_RATES);

  const currencies = currenciesQuery.data ?? [];
  const defaultCurrency = currencies.find((c) => c.isDefault);
  const baseCurrency = currencies.find((c) => c.isBase);

  // ─── Columns ─────────────────────────────────────────────────

  const columns = useMemo((): ColumnDef<CurrencySummary>[] => [
    {
      id: 'currency', header: 'Currency', accessorKey: 'code',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-base ring-1 ring-zinc-200/60">
            {currencyFlag(row.original.code)}
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-zinc-900">{row.original.code}</span>
              <span className="text-xs text-zinc-400">{row.original.symbol}</span>
            </div>
            <span className="text-xs text-zinc-400">{row.original.name}</span>
          </div>
        </div>
      ),
      enableSorting: true,
    },
    {
      id: 'exchangeRate', header: 'Rate', accessorKey: 'exchangeRate',
      cell: ({ row }) => row.original.isBase
        ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/8 px-2.5 py-0.5 text-xs font-semibold text-brand-teal ring-1 ring-brand-teal/20">1.0000</span>
        : <span className="font-mono text-sm text-zinc-600">{row.original.exchangeRate.toFixed(4)}</span>,
    },
    {
      id: 'decimals', header: 'Decimals', accessorKey: 'decimals',
      cell: ({ getValue }) => <span className="text-sm text-zinc-400">{getValue<number>()}</span>,
      enableSorting: false,
    },
    {
      id: 'status', header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          {row.original.isBase && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              <Globe className="size-3" />Base
            </span>
          )}
          {row.original.isDefault && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              <Star className="size-3" />Default
            </span>
          )}
          <Badge variant={row.original.isActive ? 'success' : 'default'}>
            {row.original.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {canManage && (
              <button onClick={() => setEditTarget(c)} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors" title="Edit">
                <Pencil className="size-4" />
              </button>
            )}
            {canManage && !c.isDefault && c.isActive && (
              <button onClick={() => setConfirmAction({ currency: c, action: 'set-default' })} className="cursor-pointer rounded-lg p-1.5 text-amber-500 hover:bg-amber-50 hover:text-amber-600 transition-colors" title="Set as default">
                <Star className="size-4" />
              </button>
            )}
            {canManage && !c.isBase && (
              <button onClick={() => setConfirmAction({ currency: c, action: 'set-base' })} className="cursor-pointer rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Set as base">
                <Globe className="size-4" />
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setConfirmAction({ currency: c, action: c.isActive ? 'deactivate' : 'activate' })}
                className={cn('cursor-pointer rounded-lg p-1.5 transition-colors', c.isActive ? 'text-zinc-400 hover:bg-red-50 hover:text-red-600' : 'text-zinc-400 hover:bg-emerald-50 hover:text-emerald-600')}
                title={c.isActive ? 'Deactivate' : 'Activate'}
              >
                <Power className="size-4" />
              </button>
            )}
            {canManage && !c.isBase && !c.isDefault && (
              <button onClick={() => setConfirmAction({ currency: c, action: 'delete' })} className="cursor-pointer rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete currency">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        );
      },
      enableSorting: false,
    },
  ], [canManage]);

  const table = useReactTable({
    data: currencies, columns,
    state: { sorting, globalFilter: search },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _col, filter: string) => {
      if (!filter.trim()) return true;
      const q = filter.toLowerCase();
      const c = row.original;
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    },
  });

  const confirmMeta = confirmAction
    ? (() => {
      const c = confirmAction.currency;
      switch (confirmAction.action) {
        case 'set-default': return { title: 'Set Default Currency', description: `Make ${c.code} the default display currency for all customers.`, label: 'Set as Default', variant: 'primary' as const };
        case 'set-base': return { title: 'Set Base Currency', description: `Make ${c.code} the base currency (rate = 1). All other exchange rates will be recalculated.`, label: 'Set as Base', variant: 'primary' as const };
        case 'deactivate': return { title: 'Deactivate Currency', description: `${c.code} will no longer be available for customers.`, label: 'Deactivate', variant: 'danger' as const };
        case 'activate': return { title: 'Activate Currency', description: `${c.code} will become available for customers again.`, label: 'Activate', variant: 'primary' as const };
        case 'delete': return { title: 'Delete Currency', description: `${c.code} will be permanently removed. This cannot be undone.`, label: 'Delete', variant: 'danger' as const };
        default: return null;
      }
    })()
    : null;

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { currency, action } = confirmAction;
    try {
      switch (action) {
        case 'set-default': await setDefaultMutation.mutateAsync(currency.id); break;
        case 'set-base': await setBaseMutation.mutateAsync(currency.id); break;
        case 'deactivate':
        case 'activate':
          await toggleActiveMutation.mutateAsync({ id: currency.id, active: action === 'activate' }); break;
        case 'delete':
          try {
            await deleteCurrency(currency.id);
            toasts.success('Currency deleted', `${currency.code} has been permanently removed.`);
            queryClient.invalidateQueries({ queryKey: ['admin', 'currencies'] });
          } catch {
            toasts.error('Delete failed', `Could not delete ${currency.code}.`);
          }
          break;
      }
    } catch { /* error handled in mutation */ }
    finally { setConfirmAction(null); }
  };

  const handleSaveSchedule = (interval?: number) => {
    const value = interval ?? parseInt(editInterval, 10);
    if (isNaN(value) || value < 5 || value > 10080) {
      toasts.error('Invalid interval', 'Must be between 5 and 10080 minutes.');
      return;
    }
    saveScheduleMutation.mutate(value);
  };

  // ─── Loading state ───────────────────────────────────────────

  if (currenciesQuery.isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Currencies"
          description="Manage available currencies, swap base and default, and keep exchange rates current."
          breadcrumbs={[{ label: 'Settings' }, { label: 'Currencies' }]}
        />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <Skeleton variant="text" width="40%" className="mb-2" />
              <Skeleton variant="text" width="60%" height={24} />
              <Skeleton variant="text" width="30%" className="mt-1" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex gap-4 mb-6"><Skeleton variant="rect" width={200} height={36} /><Skeleton variant="rect" width={120} height={36} /></div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (<Skeleton key={i} variant="text" className="mb-3 h-11" />))}
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────

  if (currenciesQuery.isError) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Currencies"
          description="Manage available currencies, swap base and default, and keep exchange rates current."
          breadcrumbs={[{ label: 'Settings' }, { label: 'Currencies' }]}
        />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-red-200 bg-red-50/50 py-16 text-center">
          <div className="mb-4 rounded-full bg-red-100 p-3">
            <Power className="size-8 text-red-400" />
          </div>
          <p className="text-sm font-medium text-red-600">Failed to load currencies</p>
          <p className="mt-1 text-xs text-red-400">Check your connection and try again.</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => currenciesQuery.refetch()}>
            <RefreshCw className="size-3.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  // ─── Empty state (unlikely but handled) ──────────────────────

  if (currencies.length === 0) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Currencies"
          description="Manage available currencies, swap base and default, and keep exchange rates current."
          breadcrumbs={[{ label: 'Settings' }, { label: 'Currencies' }]}
        />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
          <div className="mb-4 rounded-full bg-zinc-100 p-3">
            <Globe className="size-8 text-zinc-300" />
          </div>
          <p className="text-sm font-medium text-zinc-600">No currencies configured</p>
          <p className="mt-1 text-xs text-zinc-400">Add your first currency to get started.</p>
          {canManage && (
            <Button variant="primary" size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" /> Add Currency
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="Currencies"
        description="Manage available currencies, swap base and default, and keep exchange rates current."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Currencies' }]}
        actions={
          <>
            {canUpdateRates && (
              <Button variant="secondary" size="sm" onClick={() => updateRatesMutation.mutate()} loading={updateRatesMutation.isPending}>
                <RefreshCw className={cn('size-3.5', updateRatesMutation.isPending && 'animate-spin')} />
                Update Rates
              </Button>
            )}
            {canManage && (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                Add Currency
              </Button>
            )}
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DashboardOverviewCardV2
          data={{ value: defaultCurrency?.code ?? '—' }}
          title="Default Currency"
          period={defaultCurrency?.name ?? ''}
          icon={<Star className="size-5" />}
          iconColor="hsl(var(--chart-3))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: baseCurrency?.code ?? '—' }}
          title="Base Currency"
          period="Exchange rate anchor"
          icon={<Globe className="size-5" />}
          iconColor="hsl(var(--primary))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: currencies.filter((c) => c.isActive).length }}
          title="Active"
          period={`of ${currencies.length} total`}
          icon={<Power className="size-5" />}
          iconColor="hsl(var(--chart-2))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: isScheduleEnabled ? 'Auto' : 'Manual' }}
          title="Rate Updates"
          period={isScheduleEnabled && schedule ? `Every ${formatInterval(schedule.intervalMinutes)}` : 'On demand'}
          icon={<RefreshCw className="size-5" />}
          iconColor="hsl(var(--chart-1))"
          action={null}
        />
      </div>

      {/* Schedule */}
      <ScheduleCard
        schedule={schedule}
        isEnabled={isScheduleEnabled}
        editInterval={editInterval}
        loading={scheduleQuery.isLoading}
        toggling={toggleScheduleMutation.isPending}
        saving={saveScheduleMutation.isPending}
        running={runNowMutation.isPending}
        onToggle={(enable) => toggleScheduleMutation.mutate(enable)}
        onSave={handleSaveSchedule}
        onRunNow={() => runNowMutation.mutate()}
        onIntervalChange={setEditInterval}
      />

      {/* Search + table */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text" placeholder="Search by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-10 pr-3 text-sm outline-none placeholder:text-zinc-400 focus:border-brand-teal/40 focus:ring-2 focus:ring-brand-teal/10"
          />
        </div>

        {table.getRowModel().rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
            <Search className="mb-3 size-8 text-zinc-200" />
            <p className="text-sm font-medium text-zinc-500">No currencies match &quot;{search}&quot;</p>
            <p className="mt-1 text-xs text-zinc-400">Try a different search term.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id}>
                      {hg.headers.map((h) => (
                        <TableCell isHeader key={h.id} className={cn(h.id === 'decimals' || h.id === 'status' || h.id === 'actions' ? 'text-center' : '')}>
                          {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/50 px-4 py-2.5">
              <span className="text-xs text-zinc-400">{table.getRowModel().rows.length} of {currencies.length} currencies</span>
              <span className="text-xs text-zinc-400">Base: {baseCurrency?.code ?? '—'} · Default: {defaultCurrency?.code ?? '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Run history */}
      {historyQuery.data && historyQuery.data.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left transition-colors hover:bg-zinc-50"
          >
            <div className="flex items-center gap-2.5">
              <RefreshCw className="size-4 text-zinc-400" />
              <span className="text-sm font-semibold text-zinc-700">Update History</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">{historyQuery.data.length} runs</span>
            </div>
            <ChevronDown className={cn('size-4 text-zinc-400 transition-transform duration-200', historyOpen && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: modalEase }}
                className="overflow-hidden mt-3"
              >
                <RunHistoryTable history={historyQuery.data} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {createOpen && <CreateCurrencyModal key="create" onClose={() => setCreateOpen(false)} onSaved={invalidate} />}
      </AnimatePresence>
      <AnimatePresence>
        {editTarget && <EditCurrencyModal key={editTarget.id} currency={editTarget} onClose={() => setEditTarget(null)} onSaved={invalidate} />}
      </AnimatePresence>
      <AnimatePresence>
        {confirmMeta && confirmAction && (
          <ConfirmModal
            title={confirmMeta.title} description={confirmMeta.description}
            confirmLabel={confirmMeta.label} variant={confirmMeta.variant}
            loading={
              confirmAction.action === 'set-default' ? setDefaultMutation.isPending :
              confirmAction.action === 'set-base' ? setBaseMutation.isPending :
              toggleActiveMutation.isPending
            }
            onConfirm={handleConfirm}
            onClose={() => setConfirmAction(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AdminCurrenciesPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="h-5 w-56 animate-pulse rounded bg-zinc-200" />
        <div className="grid gap-4 sm:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => (<div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100" />))}</div>
        <div className="rounded-2xl border border-zinc-200 p-6">{Array.from({ length: 8 }).map((_, i) => (<div key={i} className="mb-3 h-10 animate-pulse rounded-lg bg-zinc-100" />))}</div>
      </div>
    }>
      <RequirePagePermission permissions={[PermissionCode.SETTINGS_READ]}>
        <CurrenciesPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
