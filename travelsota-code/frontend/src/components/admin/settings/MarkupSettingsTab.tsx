'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import {
  getMarkupRules,
  updateMarkupRule,
  deleteMarkupRule,
  toggleMarkupRule,
  getMarkupTemplates,
  applyMarkupTemplate,
  type MarkupRule,
} from '@/features/admin/api/admin-markups';
import { useToast } from '@/hooks/useToast';
import { Trash2, Copy, Power, Pencil, X, LayoutTemplate, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCurrencyData } from '@/context/CurrencyContext';

interface Props {
  providerKey: string;
  module?: 'flights' | 'hotels';
  displayName?: string;
}

const inputClass =
  'rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors';

export default function MarkupSettingsTab({ providerKey, module, displayName }: Props) {
  const qc = useQueryClient();
  const toasts = useToast();
  const { supportedCurrencies } = useCurrencyData();
  const reducedMotion = useReducedMotion();

  const [editRule, setEditRule] = useState<MarkupRule | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Product type: explicit module wins; legacy fallback infers from provider key.
  const productType = module ?? (providerKey === 'travelport' || providerKey === 'duffel' ? 'flights' : 'hotels');
  const productLabel = productType === 'flights' ? 'Flights' : 'Hotels';

  // Fetch markup rules filtered to this supplier
  const { data: allRules = [], isLoading } = useQuery({
    queryKey: ['admin', 'markups', 'supplier', providerKey],
    queryFn: getMarkupRules,
  });

  // Fetch templates for import
  const { data: templates = [] } = useQuery({
    queryKey: ['admin', 'markup-templates'],
    queryFn: getMarkupTemplates,
  });

  // Filter rules to this supplier
  const rules = allRules.filter(
    (r) => r.type === 'supplier' && r.supplierId === providerKey,
  );

  // Group by provenance: template-sourced vs custom
  const templateNames = new Map(templates.map((t) => [t.id, t.name]));
  const fromTemplates = rules.filter((r) => r.sourceTemplateId);
  const customRules = rules.filter((r) => !r.sourceTemplateId);
  const templateGroups = [...new Set(fromTemplates.map((r) => r.sourceTemplateId!))].map(
    (tid) => ({
      templateId: tid,
      name: templateNames.get(tid) ?? 'Deleted template',
      rules: fromTemplates.filter((r) => r.sourceTemplateId === tid),
    }),
  );

  const updateMut = useMutation({
    mutationFn: (data: Partial<MarkupRule>) => updateMarkupRule(editRule!.id, data),
    onSuccess: () => {
      toasts.success('Rule updated');
      setEditRule(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMarkupRule(id),
    onSuccess: () => {
      toasts.success('Rule deleted');
      setConfirmDeleteId(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => toggleMarkupRule(id),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const applyTemplateMut = useMutation({
    mutationFn: (templateId: string) =>
      applyMarkupTemplate(templateId, { supplierId: providerKey }),
    onSuccess: (res) => {
      const skipped =
        res.rulesSkipped > 0 ? `, ${res.rulesSkipped} skipped (different product)` : '';
      toasts.success(
        'Template applied',
        `${res.rulesCreated} rule${res.rulesCreated !== 1 ? 's' : ''} created${skipped}. Re-applying replaces previous template rules.`,
      );
      setSelectedTemplateId('');
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  function fmtValue(r: Pick<MarkupRule, 'markupType' | 'markupValue' | 'currency'>) {
    return r.markupType === 'percentage'
      ? `${Number(r.markupValue)}%`
      : `${Number(r.markupValue).toFixed(2)} ${r.currency ?? '(currency not set)'}`;
  }

  function RuleRow({ rule }: { rule: MarkupRule }) {
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              rule.isActive ? 'bg-success' : 'bg-muted-foreground/40'
            }`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{rule.name}</p>
            <p className="text-[11px] text-muted-foreground">
              Applies to {rule.applyTo === 'all' ? 'all products' : rule.applyTo}
              {' · '}
              priority {rule.priority}
            </p>
          </div>
          <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold tabular-nums text-primary">
            {fmtValue(rule)}
          </span>
          {!rule.isActive && (
            <span className="hidden rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold text-warning sm:inline">
              Inactive
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => toggleMut.mutate(rule.id)}
            title={rule.isActive ? 'Deactivate' : 'Activate'}
            className={`rounded-lg p-1.5 transition-colors ${
              rule.isActive
                ? 'text-success hover:bg-success/10'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setEditRule(rule)}
            title="Edit rule"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setConfirmDeleteId(rule.id)}
            title="Delete rule"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">
            {displayName ?? providerKey} Markup
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Rules here apply only to <span className="font-medium">{productLabel.toLowerCase()}</span>{' '}
            priced through <span className="font-medium">{displayName ?? providerKey}</span>. Other
            suppliers are unaffected.
          </p>
        </div>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
          {productLabel} supplier
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Total Rules
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{rules.length}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Active
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-success">
            {rules.filter((r) => r.isActive).length}
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-card p-3">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Templates Applied
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {templateGroups.length}
          </div>
        </div>
      </div>

      {/* Apply Template */}
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutTemplate className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Apply a Template</h4>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Only {productLabel.toLowerCase()} rules from the template are copied — re-applying
                replaces its previous rules.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              aria-label="Select template"
              className={`${inputClass} max-w-[220px]`}
            >
              <option value="">Select template…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.rules.length})
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedTemplateId && applyTemplateMut.mutate(selectedTemplateId)}
              disabled={!selectedTemplateId || applyTemplateMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" /> Apply
            </button>
          </div>
        </div>
        <Link
          href="/admin/settings/markups"
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-primary transition-colors hover:text-primary/80"
        >
          Create or manage templates
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Rules — grouped by provenance */}
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">No markup on {providerKey} yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Apply a template above to activate pricing rules for this supplier.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templateGroups.map((g) => (
            <div key={g.templateId}>
              <p className="mb-1.5 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                From “{g.name}” template
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case">
                  re-apply to update
                </span>
              </p>
              <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
                {g.rules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} />
                ))}
              </div>
            </div>
          ))}

          {customRules.length > 0 && (
            <div>
              <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Custom rules
              </p>
              <div className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card">
                {customRules.map((rule) => (
                  <RuleRow key={rule.id} rule={rule} />
                ))}
              </div>
            </div>
          )}

          {/* Inline delete confirm per row */}
          {rules.map((rule) =>
            confirmDeleteId === rule.id ? (
              <div
                key={`del-${rule.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-2.5"
              >
                <p className="text-xs text-foreground">Delete rule “{rule.name}”?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteMut.mutate(rule.id)}
                    disabled={deleteMut.isPending}
                    className="rounded-lg bg-destructive px-2.5 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* Edit Rule modal — applyTo locked to this supplier's product type */}
      {editRule && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={() => !updateMut.isPending && setEditRule(null)}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h4 className="text-sm font-bold text-foreground">Edit Rule</h4>
              <button
                onClick={() => setEditRule(null)}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Name</label>
                <input
                  type="text"
                  value={editRule.name}
                  onChange={(e) => setEditRule({ ...editRule, name: e.target.value })}
                  className={`${inputClass} w-full`}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Applies to</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                  {productLabel} (locked to {providerKey})
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Type</label>
                  <select
                    value={editRule.markupType}
                    onChange={(e) =>
                      setEditRule({ ...editRule, markupType: e.target.value as MarkupRule['markupType'] })
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed amount</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Value</label>
                  <input
                    type="number"
                    value={Number(editRule.markupValue)}
                    onChange={(e) =>
                      setEditRule({ ...editRule, markupValue: Number(e.target.value) })
                    }
                    min="0"
                    step="0.01"
                    className={`${inputClass} w-full font-mono`}
                  />
                </div>
              </div>

              {editRule.markupType === 'fixed' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Currency</label>
                  <select
                    value={editRule.currency ?? ''}
                    onChange={(e) =>
                      setEditRule({ ...editRule, currency: e.target.value || null })
                    }
                    className={`${inputClass} w-full`}
                  >
                    <option value="">Not set (ambiguous — added raw to any offer currency)</option>
                    {supportedCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
              <button
                onClick={() => setEditRule(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => updateMut.mutate(editRule)}
                disabled={updateMut.isPending || editRule.markupValue < 0 || !editRule.name.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {updateMut.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
