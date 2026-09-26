'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'motion/react';
import {
  getMarkupTemplates,
  createMarkupTemplate,
  updateMarkupTemplate,
  deleteMarkupTemplate,
  applyMarkupTemplate,
  type MarkupTemplate,
} from '@/features/admin/api/admin-markups';
import { useToast } from '@/hooks/useToast';
import { Plus, Trash2, Copy, X, ChevronDown, ChevronUp, Check, Pencil, LayoutTemplate, AlertCircle } from 'lucide-react';
import { useCurrencyData } from '@/context/CurrencyContext';

interface TemplateRule {
  name: string;
  applyTo: 'flights' | 'hotels' | 'packages' | 'all';
  markupType: 'percentage' | 'fixed';
  markupValue: number;
  /** Only meaningful for markupType 'fixed' — '' means not set. */
  currency?: string;
}

const EMPTY_RULE: TemplateRule = { name: '', applyTo: 'all', markupType: 'percentage', markupValue: 0, currency: '' };

const APPLY_TO_LABEL: Record<TemplateRule['applyTo'], string> = {
  all: 'All products',
  flights: 'Flights',
  hotels: 'Hotels',
  packages: 'Packages',
};

export default function MarkupTemplateManager({ supplierId }: { supplierId?: string }) {
  const qc = useQueryClient();
  const toasts = useToast();
  const reducedMotion = useReducedMotion();
  const { supportedCurrencies } = useCurrencyData();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['admin', 'markup-templates'],
    queryFn: getMarkupTemplates,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRules, setFormRules] = useState<TemplateRule[]>([{ ...EMPTY_RULE }]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Per-rule validity — name required, value must be > 0.
  const ruleErrors = formRules.map((r) => ({
    name: attemptedSubmit && !r.name.trim() ? 'Name is required' : null,
    value:
      attemptedSubmit && (Number.isNaN(r.markupValue) || r.markupValue <= 0)
        ? 'Must be greater than 0'
        : null,
    duplicate:
      attemptedSubmit &&
      formRules.filter((o) => o.name.trim() === r.name.trim()).length > 1
        ? 'Duplicate rule name'
        : null,
  }));
  const formValid =
    formName.trim().length > 0 &&
    formRules.length > 0 &&
    formRules.every((r, i) => r.name.trim() && r.markupValue > 0 && ruleErrors[i].duplicate === null);

  // '' (unset) must become null, not the literal string '' — the backend's
  // `rule.currency ?? null` only treats null/undefined as "unset".
  const rulesForSubmit = () =>
    formRules
      .filter((r) => r.name.trim())
      .map((r) => ({ ...r, currency: r.currency ? r.currency : null }));

  const createMut = useMutation({
    mutationFn: () =>
      createMarkupTemplate({
        name: formName,
        description: formDesc,
        rules: rulesForSubmit(),
      }),
    onSuccess: () => {
      toasts.success('Template created');
      closeForm();
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updateMarkupTemplate(editId!, {
        name: formName,
        description: formDesc,
        rules: rulesForSubmit(),
      }),
    onSuccess: () => {
      toasts.success('Template updated');
      closeForm();
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMarkupTemplate(id),
    onSuccess: () => {
      toasts.success('Template deleted', 'Rules already applied to suppliers are unaffected.');
      setConfirmDeleteId(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  const applyMut = useMutation({
    mutationFn: (templateId: string) => applyMarkupTemplate(templateId, { supplierId }),
    onSuccess: (res, id) => {
      const skipped =
        res.rulesSkipped > 0 ? `, ${res.rulesSkipped} skipped (different product)` : '';
      toasts.success(
        'Template applied',
        `${res.rulesCreated} rule${res.rulesCreated !== 1 ? 's' : ''} created${skipped}.`,
      );
      setAppliedId(id);
      setTimeout(() => setAppliedId(null), 2000);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toasts.error('Failed', e.message),
  });

  function closeForm() {
    setFormOpen(false);
    setEditId(null);
    setAttemptedSubmit(false);
    resetForm();
  }

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormRules([{ ...EMPTY_RULE }]);
  }

  function openCreate() {
    resetForm();
    setEditId(null);
    setFormOpen(true);
  }

  function startEdit(t: MarkupTemplate) {
    setEditId(t.id);
    setFormName(t.name);
    setFormDesc(t.description ?? '');
    setAttemptedSubmit(false);
    setFormRules(
      t.rules.length > 0
        ? t.rules.map((r) => ({
            name: r.name ?? '',
            applyTo: (r.applyTo ?? 'all') as TemplateRule['applyTo'],
            markupType: (r.markupType ?? 'percentage') as TemplateRule['markupType'],
            markupValue: Number(r.markupValue ?? 0),
            currency: r.currency ?? '',
          }))
        : [{ ...EMPTY_RULE }],
    );
    setFormOpen(true);
  }

  function addRule() {
    setFormRules((prev) => [...prev, { ...EMPTY_RULE }]);
  }
  function removeRule(idx: number) {
    setFormRules((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateRule(idx: number, field: keyof TemplateRule, value: string | number) {
    setFormRules((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  function submitForm() {
    setAttemptedSubmit(true);
    if (!formValid) return;
    if (editId) updateMut.mutate();
    else createMut.mutate();
  }

  const totalRules = templates.reduce((s, t) => s + t.rules.length, 0);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LayoutTemplate className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Markup Templates</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Reusable rule sets — apply one template to any compatible supplier.
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          New Template
        </button>
      </div>

      {/* Stats */}
      {templates.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div className="rounded-xl border border-border/60 bg-card p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Templates
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
              {templates.length}
            </div>
          </div>
          <div className="rounded-xl border border-border/60 bg-card p-3">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Rules across templates
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{totalRules}</div>
          </div>
        </div>
      )}

      {/* Template list */}
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <LayoutTemplate className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-semibold text-foreground">No templates yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            A template bundles one or more markup rules (e.g. “Hotels 15%”). Apply it to any
            supplier — only rules matching that supplier&apos;s product type are copied.
          </p>
          <button
            onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Create First Template
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {templates.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div key={t.id} className="overflow-hidden rounded-xl border border-border/60 bg-card">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedId(expanded ? null : t.id)}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{t.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {t.rules.length} rule{t.rules.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {t.description && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.description}</p>
                    )}
                    {/* Rule chips — scannable summary */}
                    {!expanded && t.rules.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {t.rules.slice(0, 4).map((r, i) => (
                          <span
                            key={i}
                            className="rounded-md border border-border/50 bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-foreground"
                          >
                            {APPLY_TO_LABEL[(r.applyTo ?? 'all') as TemplateRule['applyTo']]}{' '}
                            <span className="font-mono font-semibold">
                              {r.markupType === 'percentage'
                              ? `${Number(r.markupValue ?? 0).toFixed(Number(r.markupValue ?? 0) % 1 === 0 ? 0 : 2)}%`
                              : `${Number(r.markupValue ?? 0).toFixed(2)} ${r.currency ?? '(no currency)'}`}
                            </span>
                          </span>
                        ))}
                        {t.rules.length > 4 && (
                          <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground">
                            +{t.rules.length - 4} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {supplierId && (
                      <button
                        onClick={() => applyMut.mutate(t.id)}
                        disabled={applyMut.isPending}
                        title={`Apply these rules to ${supplierId}`}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                          appliedId === t.id
                            ? 'border border-success/20 bg-success/10 text-success'
                            : 'border border-primary/25 bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        {appliedId === t.id ? (
                          <>
                            <Check className="h-3 w-3" /> Applied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Apply
                          </>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(t)}
                      title="Edit template"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      title="Delete template"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Collapse details' : 'Expand details'}
                    >
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Expanded rule detail */}
                {expanded && (
                  <motion.div
                    initial={reducedMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-border/40"
                  >
                    <div className="space-y-1.5 px-4 py-3">
                      {t.rules.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No rules in this template yet — edit it to add some.
                        </p>
                      ) : (
                        t.rules.map((r, i) => (
                          <div
                            key={i}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-muted/30 px-3 py-2 text-xs"
                          >
                            <span className="w-36 truncate font-medium text-foreground">
                              {r.name || 'Unnamed'}
                            </span>
                            <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {APPLY_TO_LABEL[(r.applyTo ?? 'all') as TemplateRule['applyTo']] ?? String(r.applyTo)}
                            </span>
                            <span className="font-mono font-semibold text-foreground">
                              {r.markupType === 'percentage'
                                ? `${Number(r.markupValue)}%`
                                : `${Number(r.markupValue)} ${r.currency ?? '(no currency)'}`}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Delete confirmation */}
                {confirmDeleteId === t.id && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-destructive/20 bg-destructive/5 px-4 py-3">
                    <p className="flex items-center gap-2 text-xs text-foreground">
                      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                      Delete “{t.name}”? Suppliers already applying it keep their copied rules.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteMut.mutate(t.id)}
                        disabled={deleteMut.isPending}
                        className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {deleteMut.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !createMut.isPending && !updateMut.isPending && closeForm()}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="my-auto w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <div>
                <h4 className="text-sm font-bold text-foreground">
                  {editId ? 'Edit Template' : 'New Markup Template'}
                </h4>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Each rule names a product scope and a markup. On apply, only rules matching the
                  supplier&apos;s product type are copied.
                </p>
              </div>
              <button
                onClick={closeForm}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Standard 15%"
                    autoFocus
                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                      attemptedSubmit && !formName.trim()
                        ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                        : 'border-border focus:border-primary focus:ring-primary/20'
                    }`}
                  />
                  {attemptedSubmit && !formName.trim() && (
                    <p className="text-[11px] text-destructive">Name is required</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Description</label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="Optional note for other admins"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>

              {/* Rules */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-foreground">
                    Rules <span className="text-destructive">*</span>
                  </label>
                  <button
                    onClick={addRule}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add rule
                  </button>
                </div>

                {formRules.map((rule, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <input
                        type="text"
                        value={rule.name}
                        onChange={(e) => updateRule(i, 'name', e.target.value)}
                        placeholder="Rule name (e.g. Hotel standard)"
                        className={`flex-1 rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 transition-colors ${
                          ruleErrors[i].name || ruleErrors[i].duplicate
                            ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                            : 'border-border focus:border-primary focus:ring-primary/20'
                        }`}
                      />
                      {formRules.length > 1 && (
                        <button
                          onClick={() => removeRule(i)}
                          className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Remove rule ${i + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {(ruleErrors[i].name || ruleErrors[i].duplicate) && (
                      <p className="pl-7 text-[11px] text-destructive">
                        {ruleErrors[i].duplicate ?? ruleErrors[i].name}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      <select
                        value={rule.applyTo}
                        onChange={(e) => updateRule(i, 'applyTo', e.target.value)}
                        aria-label="Applies to"
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
                      >
                        <option value="all">All products</option>
                        <option value="flights">Flights</option>
                        <option value="hotels">Hotels</option>
                        <option value="packages">Packages</option>
                      </select>
                      <select
                        value={rule.markupType}
                        onChange={(e) => updateRule(i, 'markupType', e.target.value)}
                        aria-label="Markup type"
                        className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                      <div className="relative">
                        <input
                          type="number"
                          value={rule.markupValue}
                          onChange={(e) => updateRule(i, 'markupValue', Number(e.target.value))}
                          min="0"
                          step="0.01"
                          aria-label="Markup value"
                          className={`w-28 rounded-lg border bg-background py-1.5 pl-7 pr-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 transition-colors ${
                            ruleErrors[i].value
                              ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                              : 'border-border focus:border-primary focus:ring-primary/20'
                          }`}
                        />
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                          {rule.markupType === 'percentage' ? '%' : ''}
                        </span>
                      </div>
                      {rule.markupType === 'fixed' && (
                        <select
                          value={rule.currency ?? ''}
                          onChange={(e) => updateRule(i, 'currency', e.target.value)}
                          aria-label="Markup currency"
                          className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors focus:border-primary focus:outline-none"
                        >
                          <option value="">Currency…</option>
                          {supportedCurrencies.map((c) => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                          ))}
                        </select>
                      )}
                      {/* Live preview */}
                      {rule.name.trim() && rule.markupValue > 0 && (
                        <span className="ml-auto hidden rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:inline dark:bg-emerald-900/20 dark:text-emerald-400">
                          {APPLY_TO_LABEL[rule.applyTo]} ·{' '}
                          {rule.markupType === 'percentage'
                            ? `+${rule.markupValue}%`
                            : `+${rule.markupValue.toFixed(2)} ${rule.currency || '(no currency)'}`}
                        </span>
                      )}
                    </div>
                    {ruleErrors[i].value && (
                      <p className="pl-7 text-[11px] text-destructive">{ruleErrors[i].value}</p>
                    )}
                  </div>
                ))}

                {attemptedSubmit && formRules.length === 0 && (
                  <p className="text-center text-[11px] text-destructive">
                    Add at least one rule.
                  </p>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
              <button
                onClick={closeForm}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={submitForm}
                disabled={!formValid && attemptedSubmit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {createMut.isPending || updateMut.isPending
                  ? 'Saving…'
                  : editId
                    ? 'Update Template'
                    : 'Create Template'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
