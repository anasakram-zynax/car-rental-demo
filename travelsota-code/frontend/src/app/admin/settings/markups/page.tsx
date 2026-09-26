'use client';

import { Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { useToast } from '@/hooks/useToast';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { DashboardOverviewCardV2 } from '@/components/dashboards/dashboard-card';
import {
  getMarkupRules,
  createMarkupRule,
  updateMarkupRule,
  deleteMarkupRule,
  toggleMarkupRule,
  reorderMarkupRules,
  previewMarkupPrice,
  type MarkupRule,
  type MarkupRuleInput,
  type PricePreviewResult,
} from '@/features/admin/api/admin-markups';
import dynamic from 'next/dynamic';

const MarkupTemplateManager = dynamic(
  () => import('@/components/admin/settings/MarkupTemplateManager'),
  { ssr: false }
);

// Simple error boundary to prevent the entire page from crashing
import { Component, type ReactNode } from 'react';
class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

// ─── Inline SVGs ──────────────────────────────────────────────────

function PlusSvg() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseSvg() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function EditSvg() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashSvg() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function PowerSvg({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" />
    </svg>
  );
}

function GripSvg() {
  return (
    <svg className="size-4 cursor-grab text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function SearchSvg({ className }: { className?: string }) {
  return (
    <svg className={className ?? 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}



function CalculatorSvg() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" y1="6" x2="16" y2="6" />
      <line x1="8" y1="10" x2="8" y2="10.01" /><line x1="12" y1="10" x2="12" y2="10.01" />
      <line x1="16" y1="10" x2="16" y2="10.01" /><line x1="8" y1="14" x2="8" y2="14.01" />
      <line x1="12" y1="14" x2="12" y2="14.01" /><line x1="16" y1="14" x2="16" y2="14.01" />
      <line x1="8" y1="18" x2="8" y2="18.01" /><line x1="12" y1="18" x2="12" y2="18.01" />
      <line x1="16" y1="18" x2="16" y2="18.01" />
    </svg>
  );
}

// ─── Constants ────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'global', label: 'Global', color: 'bg-primary/10 text-primary dark:bg-primary/10 dark:text-primary' },
  { value: 'agent', label: 'Agent', color: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'supplier', label: 'Supplier', color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { value: 'product', label: 'Product', color: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'route', label: 'Route', color: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
];

const APPLY_TO_OPTIONS = [
  { value: 'all', label: 'All Products' },
  { value: 'flights', label: 'Flights Only' },
  { value: 'hotels', label: 'Hotels Only' },
  { value: 'packages', label: 'Packages Only' },
];

// ─── Markup Rule Form (Add/Edit Modal) ────────────────────────────

function MarkupRuleFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: MarkupRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toasts = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<string>(editing?.type ?? 'global');
  const [applyTo, setApplyTo] = useState<string>(editing?.applyTo ?? 'all');
  const [markupType, setMarkupType] = useState<string>(editing?.markupType ?? 'percentage');
  const [markupValue, setMarkupValue] = useState(String(editing?.markupValue ?? ''));
  const [priority, setPriority] = useState(String(editing?.priority ?? ''));
  const [agentId, setAgentId] = useState(editing?.agentId ?? '');
  const [supplierId, setSupplierId] = useState(editing?.supplierId ?? '');
  const [routeFrom, setRouteFrom] = useState(editing?.routeFrom ?? '');
  const [routeTo, setRouteTo] = useState(editing?.routeTo ?? '');
  const [startDate, setStartDate] = useState(editing?.startDate?.slice(0, 10) ?? '');
  const [endDate, setEndDate] = useState(editing?.endDate?.slice(0, 10) ?? '');

  const handleSave = async () => {
    if (!name.trim() || !markupValue) {
      toasts.error('Validation error', 'Name and markup value are required.');
      return;
    }
    const val = parseFloat(markupValue);
    if (isNaN(val) || val < 0) {
      toasts.error('Validation error', 'Markup value must be a positive number.');
      return;
    }

    const data: Partial<MarkupRuleInput> = {
      name: name.trim(),
      type: type as MarkupRuleInput['type'],
      applyTo: applyTo as MarkupRuleInput['applyTo'],
      markupType: markupType as MarkupRuleInput['markupType'],
      markupValue: val,
      priority: priority ? parseInt(priority, 10) : undefined,
      agentId: type === 'agent' ? agentId || null : null,
      supplierId: type === 'supplier' ? supplierId || null : null,
      routeFrom: type === 'route' ? routeFrom || null : null,
      routeTo: type === 'route' ? routeTo || null : null,
      startDate: startDate || null,
      endDate: endDate || null,
    };

    setSaving(true);
    try {
      if (editing) {
        await updateMarkupRule(editing.id, data);
        toasts.success('Rule updated', `"${data.name}" has been updated.`);
      } else {
        await createMarkupRule(data as MarkupRuleInput);
        toasts.success('Rule created', `"${data.name}" has been created.`);
      }
      onSaved();
      onClose();
    } catch {
      toasts.error('Failed to save', 'Could not save the markup rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {editing ? 'Edit Markup Rule' : 'Create Markup Rule'}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {editing ? 'Update the rule configuration.' : 'Add a new pricing rule.'}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
            <CloseSvg />
          </button>
        </div>

        <div className="space-y-4">
          <Input label="Rule Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard Global Markup" />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none">
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Applies To</label>
              <select value={applyTo} onChange={(e) => setApplyTo(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none">
                {APPLY_TO_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Markup Type</label>
              <select value={markupType} onChange={(e) => setMarkupType(e.target.value)}
                className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </div>
            <Input label={markupType === 'percentage' ? 'Value (%)' : 'Value ($)'} type="number" step="0.01" min="0" value={markupValue} onChange={(e) => setMarkupValue(e.target.value)} />
            <Input label="Priority" type="number" min="0" value={priority} onChange={(e) => setPriority(e.target.value)} helperText="Higher = applied later" />
          </div>

          {/* Conditional fields */}
          {type === 'agent' && (
            <Input label="Agent ID" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="UUID of the agent" />
          )}
          {type === 'supplier' && (
            <Input label="Supplier ID" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="UUID of the supplier" />
          )}
          {type === 'route' && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Route From (IATA)" value={routeFrom} onChange={(e) => setRouteFrom(e.target.value)} placeholder="e.g. JFK" />
              <Input label="Route To (IATA)" value={routeTo} onChange={(e) => setRouteTo(e.target.value)} placeholder="e.g. LHR" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
            {editing ? 'Save Changes' : 'Create Rule'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm Modal ──────────────────────────────────────────

function DeleteConfirmModal({
  rule,
  onClose,
  onDeleted,
}: {
  rule: MarkupRule;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const toasts = useToast();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteMarkupRule(rule.id);
      toasts.success('Rule deleted', `"${rule.name}" has been deleted.`);
      onDeleted();
      onClose();
    } catch {
      toasts.error('Failed to delete', 'Could not delete the rule.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-foreground">Delete Rule</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Are you sure you want to delete <strong>&quot;{rule.name}&quot;</strong>? This action cannot be undone.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Panel ────────────────────────────────────────────────

function PreviewPanel({ onClose }: { onClose: () => void }) {
  const toasts = useToast();
  const { supportedCurrencies, decimalsMap } = useCurrencyData();
  const defaultCode = supportedCurrencies.find((c) => c.isDefault)?.code ?? 'USD';
  const [basePrice, setBasePrice] = useState('1000');
  const [productType, setProductType] = useState('flights');
  const [previewCurrency, setPreviewCurrency] = useState(defaultCode);
  const [previewResult, setPreviewResult] = useState<PricePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fmtPreview = (n: number) => formatCurrencyWithCode(n, previewCurrency, decimalsMap);

  const handlePreview = async () => {
    const price = parseFloat(basePrice);
    if (isNaN(price) || price <= 0) {
      toasts.error('Invalid price', 'Enter a valid base price.');
      return;
    }
    setLoading(true);
    try {
      const result = await previewMarkupPrice({
        basePrice: price,
        productType: productType as 'flights' | 'hotels' | 'packages',
        targetCurrency: previewCurrency,
      });
      setPreviewResult(result);
    } catch {
      toasts.error('Preview failed', 'Could not calculate the preview.');
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalculatorSvg />
          <h3 className="text-sm font-semibold text-foreground">Price Preview Calculator</h3>
        </div>
        <button onClick={onClose} className="cursor-pointer rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
          <CloseSvg />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input label={`Base Price (${previewCurrency})`} type="number" step="0.01" min="0" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Currency</label>
          <select value={previewCurrency} onChange={(e) => setPreviewCurrency(e.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none">
            {supportedCurrencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Product</label>
          <select value={productType} onChange={(e) => setProductType(e.target.value)}
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:border-ring focus:outline-none">
            <option value="flights">Flights</option>
            <option value="hotels">Hotels</option>
            <option value="packages">Packages</option>
          </select>
        </div>
        <Button variant="primary" size="sm" onClick={handlePreview} loading={loading}>
          Calculate
        </Button>
      </div>

      {previewResult && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">Base Price</p>
              <p className="text-lg font-bold text-foreground">{fmtPreview(previewResult.basePrice)}</p>
            </div>
            <div className="rounded-xl bg-primary/10 p-3">
              <p className="text-xs text-primary">Effective Markup</p>
              <p className="text-lg font-bold text-primary">{previewResult.effectiveMarkupPercent}%</p>
            </div>
            <div className="rounded-xl bg-success/10 p-3">
              <p className="text-xs text-success">Final Price</p>
              <p className="text-lg font-bold text-success">{fmtPreview(previewResult.finalPrice)}</p>
            </div>
          </div>

          {previewResult.appliedRules.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/30">
              <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Applied Rules ({previewResult.appliedRules.length})
              </div>
              <div className="divide-y divide-border">
                {previewResult.appliedRules.map((ar) => (
                  <div key={ar.rule.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-foreground">
                      {ar.rule.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({ar.rule.markupType === 'percentage' ? `${ar.rule.markupValue}%` : formatCurrencyWithCode(ar.rule.markupValue, ar.rule.currency ?? previewCurrency, decimalsMap)})
                      </span>
                    </span>
                    <span className="font-medium text-foreground">
                      +{fmtPreview(ar.markupAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

function MarkupsPageInner() {
  const toasts = useToast();
  const { hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  const [localRules, setLocalRules] = useState<MarkupRule[] | null>(null);
  const [search, setSearch] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Modal state
  const [editingRule, setEditingRule] = useState<MarkupRule | null | undefined>(undefined);
  const [deletingRule, setDeletingRule] = useState<MarkupRule | null>(null);

  // Drag reorder state
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const canManage = hasPermission(PermissionCode.CUSTOMER_MARKUP_WRITE);

  const { data: queryRules, isPending: rulesLoading, error: rulesError } = useQuery({
    queryKey: ['admin', 'settings', 'markups'],
    queryFn: getMarkupRules,
    staleTime: 30_000,
  });

  const rules = localRules ?? queryRules ?? [];

  const fetchRules = useCallback(async () => {
    setLocalRules(null);
    await queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'markups'] });
  }, [queryClient]);

  // ─── Toggle active ────────────────────────────────────────────

  const handleToggle = async (rule: MarkupRule) => {
    try {
      const updated = await toggleMarkupRule(rule.id);
      setLocalRules((prev) => (prev ?? rules).map((r) => (r.id === rule.id ? { ...r, isActive: updated.isActive } : r)));
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'markups'] });
      toasts.success(updated.isActive ? 'Rule activated' : 'Rule deactivated', `"${rule.name}" is now ${updated.isActive ? 'active' : 'inactive'}.`);
    } catch {
      toasts.error('Toggle failed', 'Could not toggle the rule.');
    }
  };

  // ─── Drag reorder ─────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleDrop = async (idx: number) => {
    if (draggedIdx === null || draggedIdx === idx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }

    const newRules = [...rules];
    const [moved] = newRules.splice(draggedIdx, 1);
    newRules.splice(idx, 0, moved);

    // Assign priorities at intervals of 10
    const reordered = newRules.map((r, i) => ({ id: r.id, priority: (i + 1) * 10 }));

    setLocalRules(newRules);
    setDraggedIdx(null);
    setDragOverIdx(null);

    try {
      await reorderMarkupRules(reordered);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'markups'] });
      toasts.success('Reordered', 'Markup rule priorities have been updated.');
    } catch {
      toasts.error('Reorder failed', 'Could not save the new order.');
      fetchRules(); // revert
    }
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  // ─── Filter & sort ────────────────────────────────────────────

  const filtered = useMemo(() => {
    if (!search.trim()) return rules;
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        r.applyTo.toLowerCase().includes(q) ||
        r.markupType.toLowerCase().includes(q),
    );
  }, [rules, search]);

  // ─── Derived (hooks must run before any early return — otherwise the
  // hook count changes between loading/error/ready renders → React #310).
  const { activeCount, typeCounts } = useMemo(() => {
    let active = 0;
    const counts: Record<string, number> = {};
    for (const r of rules) {
      if (r.isActive) active++;
      counts[r.type] = (counts[r.type] ?? 0) + 1;
    }
    return {
      activeCount: active,
      typeCounts: TYPE_OPTIONS.map((t) => ({ ...t, count: counts[t.value] ?? 0 })),
    };
  }, [rules]);

  // ─── Render states ────────────────────────────────────────────

  if (rulesLoading) {
    return (
      <div className="space-y-5">
        <div className="h-5 w-56 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
        <div className="rounded-2xl border border-border p-6">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="mb-3 h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      </div>
    );
  }

  if (rulesError) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          title="Markup Rules"
          description="Define pricing rules to control agent and customer markups across products, suppliers, and routes."
          breadcrumbs={[{ label: 'Settings' }, { label: 'Markups' }]}
        />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-destructive/30 bg-destructive/5 py-16 text-center">
          <div className="mb-4 rounded-full bg-destructive/10 p-3">
            <PowerSvg className="size-8 text-destructive/40" />
          </div>
          <p className="text-sm font-medium text-destructive">{rulesError?.message ?? 'Failed to load markup rules.'}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={fetchRules}>Retry</Button>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="Markup Rules"
        description="Define pricing rules to control agent and customer markups across products, suppliers, and routes."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Markups' }]}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setShowPreview(!showPreview); }}>
              <CalculatorSvg /> Preview
            </Button>
            {canManage && (
              <Button variant="primary" size="sm" onClick={() => setEditingRule(null)}>
                <PlusSvg /> Add Rule
              </Button>
            )}
          </>
        }
      />

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <DashboardOverviewCardV2
          data={{ value: rules.length }}
          title="Total Rules"
          period="All markup rules"
          icon={<span className="text-lg font-bold">#</span>}
          iconColor="hsl(var(--primary))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: activeCount }}
          title="Active"
          period="Currently applied"
          icon={<PowerSvg className="size-5" />}
          iconColor="hsl(var(--chart-2))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: rules.length - activeCount }}
          title="Inactive"
          period="Disabled rules"
          icon={<PowerSvg className="size-5" />}
          iconColor="hsl(var(--muted-foreground))"
          action={null}
        />
      </div>

      {/* Type breakdown */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {typeCounts.map((t) => (
          <span key={t.value} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${t.color}`}>
            {t.label}: {t.count}
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <SearchSvg className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search rules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-input bg-background py-2 pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring"
        />
      </div>

      {/* Preview Panel */}
      {showPreview && <PreviewPanel onClose={() => setShowPreview(false)} />}

      {/* Rules List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <CalculatorSvg />
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {search ? 'No rules match your search.' : 'No markup rules defined. Create one to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rule, idx) => {
            const typeInfo = TYPE_OPTIONS.find((t) => t.value === rule.type) ?? { value: rule.type, label: rule.type, color: 'bg-gray-100 text-gray-700' };
            const isDragging = draggedIdx === idx;
            const isOver = dragOverIdx === idx && draggedIdx !== null && draggedIdx !== idx;

            return (
              <div
                key={rule.id}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 rounded-2xl border bg-card p-4 transition-all ${
                  isDragging
                    ? 'border-primary/40 shadow-lg opacity-50'
                    : isOver
                      ? 'border-primary/50 shadow-md'
                      : rule.isActive
                        ? 'border-border'
                        : 'border-border bg-muted/30'
                }`}
              >
                {/* Drag handle */}
                <div className="shrink-0">
                  <GripSvg />
                </div>

                {/* Priority badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                  {rule.priority}
                </div>

                {/* Name + Type */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${rule.isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {rule.name}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeInfo.color}`}>
                      {typeInfo.label}
                    </span>
                    {!rule.isActive && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{APPLY_TO_OPTIONS.find((o) => o.value === rule.applyTo)?.label ?? rule.applyTo}</span>
                    <span>·</span>
                    <span>{rule.markupType === 'percentage' ? `${rule.markupValue}%` : `$${rule.markupValue}`}</span>
                    {rule.startDate && (
                      <>
                        <span>·</span>
                        <span>{new Date(rule.startDate).toLocaleDateString()} – {rule.endDate ? new Date(rule.endDate).toLocaleDateString() : '∞'}</span>
                      </>
                    )}
                    {rule.agentId && (
                      <>
                        <span>·</span>
                        <span className="font-mono text-[10px]">Agent: {rule.agentId.slice(0, 8)}...</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {canManage && (
                    <>
                      <button onClick={() => setEditingRule(rule)}
                        className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-primary">
                        <EditSvg />
                      </button>
                      <button onClick={() => handleToggle(rule)}
                        className={`cursor-pointer rounded-lg p-2 transition-colors ${
                          rule.isActive
                            ? 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                            : 'text-muted-foreground hover:bg-success/10 hover:text-success'
                        }`}>
                        <PowerSvg className="size-4" />
                      </button>
                      <button onClick={() => setDeletingRule(rule)}
                        className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                        <TrashSvg />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {editingRule !== undefined && (
        <MarkupRuleFormModal
          editing={editingRule}
          onClose={() => setEditingRule(undefined)}
          onSaved={fetchRules}
        />
      )}

      {/* Delete Modal */}
      {deletingRule && (
        <DeleteConfirmModal
          rule={deletingRule}
          onClose={() => setDeletingRule(null)}
          onDeleted={() => { setDeletingRule(null); fetchRules(); }}
        />
      )}

      {/* ── Markup Templates ── */}
      <section className="mt-8 border-t border-border/40 pt-8">
        <ErrorBoundary fallback={<p className="text-xs text-muted-foreground">Templates unavailable. Check backend deployment.</p>}>
          <MarkupTemplateManager supplierId={undefined} />
        </ErrorBoundary>
      </section>
    </div>
  );
}

// ─── Wrapper & Export ────────────────────────────────────────────

export default function AdminMarkupsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <div className="h-5 w-56 animate-pulse rounded bg-muted" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
          </div>
          <div className="rounded-2xl border border-border p-6">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="mb-3 h-12 animate-pulse rounded-lg bg-muted" />)}
          </div>
        </div>
      }
    >
      <RequirePagePermission permissions={[PermissionCode.CUSTOMER_MARKUP_READ]}>
        <MarkupsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
