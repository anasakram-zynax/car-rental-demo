'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import enMessages from '../../../../../messages/en.json';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { DeleteConfirm } from '@/components/admin/shared/DeleteConfirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { useToast } from '@/hooks/useToast';
import { useModal } from '@/hooks/useModal';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import {
  getLanguages, createLanguage, updateLanguage, deactivateLanguage, activateLanguage,
  setDefaultLanguage, deleteLanguage, generateTranslations,
  getTranslationConfig, saveTranslationConfig, testTranslationConnection,
  type GeneratedTranslations, type LanguageSummary, type TranslationConfigView,
} from '@/features/admin/api/admin-settings-language';

// ─── Inline SVG Icons ────────────────────────────────────────────
function CloseSvg({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>; }
function StarSvg({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>; }
function EditSvg({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>; }
function PowerSvg({ className }: { className?: string }) { return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></svg>; }

// ─── Language Form Modal (create + edit) ─────────────────────────
function LanguageFormModal({
  language,
  onClose,
  onSaved,
}: {
  language?: LanguageSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toasts = useToast();
  const isEdit = !!language;
  const [code, setCode] = useState(language?.code ?? '');
  const [name, setName] = useState(language?.name ?? '');
  const [direction, setDirection] = useState(language?.direction ?? 'LTR');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!code.trim() || !name.trim()) {
      toasts.error('Validation error', 'Code and name are required.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && language) {
        await updateLanguage(language.id, {
          code: code.trim().toLowerCase(),
          name: name.trim(),
          direction,
        });
        toasts.success('Language updated', `${code} has been updated.`);
      } else {
        await createLanguage({
          code: code.trim().toLowerCase(),
          name: name.trim(),
          direction,
        });
        toasts.success('Language created', `${code} has been created.`);
      }
      onSaved();
      onClose();
    } catch {
      toasts.error('Failed', `Could not ${isEdit ? 'update' : 'create'} language.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{isEdit ? `Edit ${language?.code}` : 'Add Language'}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isEdit ? 'Update language details.' : 'Add a new language.'}
            </p>
          </div>
          <button onClick={onClose} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent">
            <CloseSvg className="size-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Input label="Language Code" placeholder="e.g. en, ar" value={code} onChange={(e) => setCode(e.target.value)} disabled={isEdit} helperText="ISO 639-1 two-letter code" />
          <Input label="Language Name" placeholder="e.g. English, Arabic" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex gap-3">
            <label className="flex-1 flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 cursor-pointer has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal/5 transition-colors">
              <input type="radio" name="direction" value="LTR" checked={direction === 'LTR'} onChange={() => setDirection('LTR')} className="accent-brand-teal" />
              <span className="text-sm font-medium">LTR (Left-to-Right)</span>
            </label>
            <label className="flex-1 flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 cursor-pointer has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal/5 transition-colors">
              <input type="radio" name="direction" value="RTL" checked={direction === 'RTL'} onChange={() => setDirection('RTL')} className="accent-brand-teal" />
              <span className="text-sm font-medium">RTL (Right-to-Left)</span>
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Language'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────
function ConfirmModal({
  title,
  description,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? 'Processing...' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Translation Provider Card (gtx usage, no key needed) ──────
function TranslationProviderCard() {
  const toasts = useToast();
  const [config, setConfig] = useState<TranslationConfigView | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await getTranslationConfig();
      setConfig(data);
      setLimit(String(data.monthlyCharLimit));
    } catch {
      toasts.error('Failed to load', 'Could not fetch translation provider config.');
    } finally {
      setLoading(false);
    }
  }, [toasts]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-once on mount, same pattern as fetchLanguages below
  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = await saveTranslationConfig(limit ? { monthlyCharLimit: Number(limit) } : {});
      setConfig(data);
      toasts.success('Provider saved', 'Monthly limit updated.');
    } catch {
      toasts.error('Save failed', 'Could not save translation provider config.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testTranslationConnection();
      toasts.success('Connection works', `Hello → ${res.translated} (${res.chars} chars).`);
      await fetchConfig();
    } catch {
      toasts.error('Test failed', 'Endpoint unreachable or throttled. Retry in a minute.');
    } finally {
      setTesting(false);
    }
  };

  const pct = config && config.monthlyCharLimit > 0
    ? Math.min(100, Math.round((config.charsUsedThisPeriod / config.monthlyCharLimit) * 100))
    : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold">Auto-translation provider — Google (free, no key)</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Unofficial endpoint, same as legacy system. One request per key + throttle — full file takes ~4 min. Usage resets monthly.
      </p>
      {loading ? (
        <div className="mt-4 h-10 animate-pulse rounded-lg bg-muted" />
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Input label="Monthly limit" type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? 'Testing...' : 'Test connection'}</Button>
          </div>
          {config && (
            <div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{config.charsUsedThisPeriod.toLocaleString()} / {config.monthlyCharLimit.toLocaleString()} chars ({config.periodKey})</span>
                <span>{config.remainingChars.toLocaleString()} left</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Review Modal (stage + approve before file write) ────────────
function ReviewModal({
  langCode,
  langName,
  result,
  saving,
  onApprove,
  onClose,
}: {
  langCode: string;
  langName: string;
  result: GeneratedTranslations;
  saving: boolean;
  onApprove: () => void;
  onClose: () => void;
}) {
  const enNs = enMessages as unknown as Record<string, Record<string, string>>;
  const outNs = result.content as unknown as Record<string, Record<string, string>>;
  let missing = 0;
  let extra = 0;
  for (const ns of Object.keys(enNs)) {
    const enKeys = Object.keys(enNs[ns] ?? {});
    const outKeys = new Set(Object.keys(outNs[ns] ?? {}));
    missing += enKeys.filter((k) => !outKeys.has(k)).length;
  }
  for (const ns of Object.keys(outNs)) {
    const enKeys = new Set(Object.keys(enNs[ns] ?? {}));
    extra += Object.keys(outNs[ns] ?? {}).filter((k) => !enKeys.has(k)).length;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Review {langName} ({langCode})</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {result.keys} keys across {result.fileCount} namespaces · {result.charsUsed.toLocaleString()} chars this run
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-muted/50 p-2"><div className="text-lg font-bold">{missing}</div><div className="text-[11px] text-muted-foreground">missing vs en</div></div>
          <div className="rounded-lg bg-muted/50 p-2"><div className="text-lg font-bold">{extra}</div><div className="text-[11px] text-muted-foreground">extra vs en</div></div>
          <div className="rounded-lg bg-muted/50 p-2"><div className="text-lg font-bold">{result.warnings.length}</div><div className="text-[11px] text-muted-foreground">English fallback</div></div>
        </div>
        {result.warnings.length > 0 && (
          <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-border p-2 text-xs">
            {result.warnings.slice(0, 100).map((w) => (
              <div key={`${w.namespace}.${w.key}`} className="py-0.5 font-mono">
                {w.namespace}.{w.key} — {w.reason} (kept English)
              </div>
            ))}
            {result.warnings.length > 100 && <div className="py-0.5 text-muted-foreground">…{result.warnings.length - 100} more</div>}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">Approve writes messages/{langCode}.json (existing file auto-backed-up). Rebuild needed to serve.</p>
        <div className="mt-4 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Discard</Button>
          <Button onClick={onApprove} disabled={saving}>{saving ? 'Saving...' : 'Approve & Save'}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page Inner ───────────────────────────────────────────────────

function LanguagesPageInner() {
  const toasts = useToast();
  const [languages, setLanguages] = useState<LanguageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const formModal = useModal();
  const confirmModalCtrl = useModal();
  const [editingLanguage, setEditingLanguage] = useState<LanguageSummary | undefined>();
  const [actionLang, setActionLang] = useState<LanguageSummary | null>(null);
  const [deleteLang, setDeleteLang] = useState<LanguageSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ lang: LanguageSummary; result: GeneratedTranslations } | null>(null);
  const [approving, setApproving] = useState(false);

  const fetchLanguages = useCallback(async () => {
    try {
      const data = await getLanguages();
      setLanguages(data);
    } catch {
      toasts.error('Failed to load', 'Could not fetch languages.');
    } finally {
      setLoading(false);
    }
  }, [toasts]);

  useEffect(() => { fetchLanguages(); }, [fetchLanguages]);

  const handleDeleteLang = useCallback(async () => {
    if (!deleteLang) return;
    setDeleting(true);
    try {
      await deleteLanguage(deleteLang.id);
      toasts.success('Language deleted', `${deleteLang.name} has been permanently removed.`);
      setDeleteLang(null);
      await fetchLanguages();
    } catch {
      toasts.error('Delete failed', `Could not delete ${deleteLang.name}.`);
    } finally {
      setDeleting(false);
    }
  }, [deleteLang, toasts, fetchLanguages]);

  const handleApproveStaged = useCallback(async () => {
    if (!staged) return;
    setApproving(true);
    try {
      const res = await fetch('/api/admin/save-translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: staged.lang.code, content: staged.result.content }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      toasts.success('Translations saved', `${staged.result.keys} keys written. Rebuild to serve.`);
      setStaged(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toasts.error('Save failed', msg);
    } finally {
      setApproving(false);
    }
  }, [staged, toasts]);

  const handleAction = async (lang: LanguageSummary, action: string) => {
    setActionLoading((prev) => ({ ...prev, [lang.id]: true }));
    try {
      if (action === 'deactivate') await deactivateLanguage(lang.id);
      else if (action === 'activate') await activateLanguage(lang.id);
      else if (action === 'set-default') await setDefaultLanguage(lang.id);
      else if (action === 'generate') {
        setGeneratingId(lang.id);
        try {
          const result = await generateTranslations(lang.id, enMessages as unknown as Record<string, unknown>);
          setStaged({ lang, result });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          toasts.error('Generation failed', msg);
        } finally {
          setGeneratingId(null);
          setActionLoading((prev) => ({ ...prev, [lang.id]: false }));
        }
        return;
      }
      toasts.success('Done', `${lang.name} ${action === 'set-default' ? 'set as default' : action + 'd'}.`);
      confirmModalCtrl.closeModal();
      setActionLang(null);
      await fetchLanguages();
    } catch {
      toasts.error('Failed', `Could not ${action} ${lang.name}.`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [lang.id]: false }));
    }
  };

  const columns: ColumnDef<LanguageSummary>[] = [
    { id: 'code', header: 'Code', accessorKey: 'code', cell: (info) => <span className="font-mono font-bold text-sm uppercase">{info.getValue<string>()}</span> },
    { id: 'name', header: 'Name', accessorKey: 'name' },
    { id: 'direction', header: 'Direction', accessorKey: 'direction', cell: (info) => {
      const dir = info.getValue<string>();
      return (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${dir === 'RTL' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'}`}>
          {dir === 'RTL' ? '← RTL' : 'LTR →'}
        </span>
      );
    }},
    { id: 'isDefault', header: 'Default', accessorKey: 'isDefault', cell: (info) => info.getValue<boolean>() ? <StarSvg className="size-4 text-amber-500 mx-auto" /> : null },
    { id: 'isActive', header: 'Active', accessorKey: 'isActive', cell: (info) => info.getValue<boolean>() ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active</span> : <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-400"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />Inactive</span> },
    { id: 'actions', header: 'Actions', cell: (info) => {
      const lang = info.row.original;
      return (
        <div className="flex items-center justify-center gap-1">
          <button title="Edit" onClick={() => { setEditingLanguage(lang); formModal.openModal(); }} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-teal"><EditSvg className="size-4" /></button>
          {lang.isActive ? (
            <button title="Deactivate" onClick={() => { if (lang.isDefault) { toasts.warning('Cannot deactivate', 'Set another default first.'); return; } setActionLang(lang); confirmModalCtrl.openModal(); }} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-500"><PowerSvg className="size-4" /></button>
          ) : (
            <button title="Activate" onClick={() => handleAction(lang, 'activate')} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-emerald-500"><PowerSvg className="size-4" /></button>
          )}
          {!lang.isDefault && (
            <button title="Set as default" onClick={() => handleAction(lang, 'set-default')} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-amber-500"><StarSvg className="size-4" /></button>
          )}
          {!lang.isDefault && (
            <button title="Delete language" onClick={() => setDeleteLang(lang)} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-red-500">
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
            </button>
          )}
          <button title="Generate translations via AI" onClick={() => handleAction(lang, 'generate')} disabled={generatingId === lang.id} className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-purple-500 disabled:opacity-50 disabled:cursor-wait">
            {generatingId === lang.id ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            ) : (
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            )}
          </button>
        </div>
      );
    }},
  ];

  const table = useReactTable({
    data: languages,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const defaultLang = languages.find((l) => l.isDefault);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Languages"
        description="Manage the languages available across the platform."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Languages' }]}
      />

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => { setEditingLanguage(undefined); formModal.openModal(); }}>+ Add Language</Button>
      </div>

      <TranslationProviderCard />

      {loading ? (
        <div className="rounded-2xl border border-border p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (<div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />))}
        </div>
      ) : (
        <div className="admin-table-card overflow-hidden rounded-xl border border-border">
          <div className="admin-table-viewport">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableCell isHeader key={h.id} className={h.id === 'isDefault' || h.id === 'isActive' || h.id === 'actions' ? 'text-center' : ''}>
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
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">{languages.length} languages</span>
            <span className="text-xs text-muted-foreground">Default: {defaultLang?.name ?? '—'}</span>
          </div>
        </div>
      )}

      {/* Modals */}
      {formModal.isOpen && (
        <LanguageFormModal
          language={editingLanguage}
          onClose={() => { formModal.closeModal(); setEditingLanguage(undefined); }}
          onSaved={fetchLanguages}
        />
      )}

      {confirmModalCtrl.isOpen && actionLang && (
        <ConfirmModal
          title={`Deactivate ${actionLang.name}?`}
          description="Inactive languages won't appear in the language selector. You can reactivate later."
          confirmLabel="Deactivate"
          loading={actionLoading[actionLang.id] ?? false}
          onConfirm={() => handleAction(actionLang, 'deactivate')}
          onClose={() => { confirmModalCtrl.closeModal(); setActionLang(null); }}
        />
      )}

      {staged && (
        <ReviewModal
          langCode={staged.lang.code}
          langName={staged.lang.name}
          result={staged.result}
          saving={approving}
          onApprove={handleApproveStaged}
          onClose={() => setStaged(null)}
        />
      )}

      {deleteLang && (
        <DeleteConfirm
          open
          count={1}
          noun={`language (${deleteLang.name})`}
          loading={deleting}
          onCancel={() => setDeleteLang(null)}
          onConfirm={handleDeleteLang}
        />
      )}
    </div>
  );
}

export default function AdminLanguagesPage() {
  return (
    <Suspense fallback={<div className="space-y-5"><div className="h-5 w-56 animate-pulse rounded bg-muted" /><div className="h-10 w-64 animate-pulse rounded-xl bg-muted" /><div className="rounded-2xl border border-border p-6">{Array.from({ length: 5 }).map((_, i) => (<div key={i} className="mb-3 h-10 animate-pulse rounded-lg bg-muted" />))}</div></div>}>
      <RequirePagePermission permissions={[PermissionCode.SETTINGS_READ]}>
        <LanguagesPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
