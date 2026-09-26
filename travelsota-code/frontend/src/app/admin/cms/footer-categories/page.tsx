'use client';
import { confirmDialog } from '@/components/ui/confirm-dialog';

import { Suspense, useCallback, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Modal } from '@/components/ui/modal';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { useFooterCategories, useCreateFooterCategory, useUpdateFooterCategory, useDeleteFooterCategory, useCmsFooter } from '@/features/cms/hooks';
import type { CmsFooterCategory } from '@/features/cms/types';
import { useToast } from '@/hooks/useToast';
import { PlusIcon, PencilIcon, TrashBinIcon, ListIcon } from '@/icons';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';

interface FormState { name: string; slug: string; sortOrder: string; isActive: boolean; }
function emptyForm(): FormState { return { name: '', slug: '', sortOrder: '0', isActive: true }; }

function FooterCategoriesInner() {
  const toasts = useToast();
  const { hasPermission } = usePermissions();
  const { data: categories, isPending } = useFooterCategories();
  const { data: footerPreview } = useCmsFooter();
  const createMutation = useCreateFooterCategory();
  const updateMutation = useUpdateFooterCategory();
  const deleteMutation = useDeleteFooterCategory();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CmsFooterCategory | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const [activeTab, setActiveTab] = useState<'categories' | 'preview'>('categories');

  const cats = categories ?? [];

  const openCreate = useCallback(() => { setEditing(null); setForm(emptyForm()); setFormError(''); setShowModal(true); }, []);
  const openEdit = useCallback((cat: CmsFooterCategory) => { setEditing(cat); setForm({ name: cat.name, slug: cat.slug, sortOrder: String(cat.sortOrder), isActive: cat.isActive }); setFormError(''); setShowModal(true); }, []);
  const handleSave = useCallback(() => { setFormError(''); if (!form.name.trim()) { setFormError('Name is required.'); return; } const input = { name: form.name.trim(), ...(form.slug.trim() ? { slug: form.slug.trim() } : {}), sortOrder: Number(form.sortOrder) || 0, isActive: form.isActive }; const onSuccess = () => { toasts.success(editing ? 'Category updated' : 'Category created'); setShowModal(false); setEditing(null); setForm(emptyForm()); }; const onError = (err: unknown) => toasts.error((err as {message?:string})?.message ?? 'Failed to save'); if (editing) updateMutation.mutate({ id: editing.id, input }, { onSuccess, onError }); else createMutation.mutate(input, { onSuccess, onError }); }, [form, editing, createMutation, updateMutation, toasts]);
  const handleDelete = useCallback(async (id: string, name: string) => { if (!(await confirmDialog({ title: `Delete category "${name}"?`, message: 'All menus in it will be removed.', confirmLabel: 'Delete' }))) return; deleteMutation.mutate(id, { onSuccess: () => toasts.success('Category deleted'), onError: (err) => toasts.error((err as {message?:string})?.message ?? 'Failed to delete') }); }, [deleteMutation, toasts]);

  const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500';

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Footer Categories"
        description="Organize footer menu categories and their menus."
        breadcrumbs={[{ label: 'CMS' }, { label: 'Footer Categories' }]}
      />

      {/* ── Tabs ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-200 px-6 dark:border-gray-700">
          <nav className="-mb-px flex gap-6">
            {([{ key: 'categories' as const, label: 'Categories' }, { key: 'preview' as const, label: 'Live Preview' }]).map((t) => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={`relative whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${activeTab === t.key ? 'border-brand-teal-500 text-brand-teal-600 dark:border-brand-teal-400 dark:text-brand-teal-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400'}`}>{t.label}</button>
            ))}
          </nav>
        </div>

        {activeTab === 'categories' ? (
          <div className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-gray-500 dark:text-gray-400">{cats.length} categor{cats.length === 1 ? 'y' : 'ies'} (max 4 recommended)</p>
              {hasPermission(PermissionCode.CMS_WRITE) && <button onClick={openCreate} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600"><PlusIcon className="size-5"/> New Category</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead><tr className="border-b border-gray-100 dark:border-gray-800"><th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th><th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Slug</th><th className="px-6 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Order</th><th className="px-6 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th><th className="px-6 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Menus</th><th className="w-28 px-6 py-3.5 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th></tr></thead>
                <tbody>
                  {isPending ? <AdminTableSkeleton rows={3} columns={6} shortColumns={[2, 3, 4]} />
                  : cats.length === 0 ? <tr><td colSpan={6} className="px-6 py-16 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"><ListIcon className="size-6 text-gray-400"/></div><p className="text-sm font-medium text-gray-500 dark:text-gray-400">No categories yet</p><p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Create categories to organize your footer menus.</p></td></tr>
                  : cats.map(cat => <tr key={cat.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50"><td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">{cat.name}</td><td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{cat.slug}</td><td className="px-6 py-4 text-center text-sm tabular-nums text-gray-600 dark:text-gray-400">{cat.sortOrder}</td><td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cat.isActive ? 'bg-success-50 text-success-700 dark:bg-success-900/20 dark:text-success-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}><span className={`inline-block h-1.5 w-1.5 rounded-full ${cat.isActive ? 'bg-success-500' : 'bg-gray-400'}`}/>{cat.isActive ? 'Active' : 'Inactive'}</span></td><td className="px-6 py-4 text-center text-sm tabular-nums text-gray-600 dark:text-gray-400">{cat._count.menus}</td><td className="px-6 py-4"><div className="flex items-center justify-center gap-0.5">{hasPermission(PermissionCode.CMS_WRITE) && <button onClick={() => openEdit(cat)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-brand-teal-600 dark:hover:bg-gray-800 dark:hover:text-brand-teal-400" title="Edit"><PencilIcon className="size-5"/></button>}{hasPermission(PermissionCode.CMS_WRITE) && <button onClick={() => handleDelete(cat.id, cat.name)} className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-error-600 dark:hover:bg-gray-800 dark:hover:text-error-400" title="Delete"><TrashBinIcon className="size-5"/></button>}</div></td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">Footer Preview</h3>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Only the first 2 categories are shown in the footer. Menus are grouped by the category you assign them to in CMS Menus.</p>
            <div className="rounded-2xl bg-[#0a1218] p-8">
              <div className="grid gap-6 md:grid-cols-[1.5fr_repeat(var(--preview-gc),1fr)_1.25fr]" style={{ ['--preview-gc' as string]: Math.min((footerPreview ?? []).length, 2) }}>
                <div><span className="text-lg font-bold text-white">Travels OTA</span><p className="mt-2 max-w-[220px] text-xs text-white/40">Flights and hotels for customers, agents and travel teams.</p><p className="mt-2 text-xs text-brand-teal-300">Travel Blog →</p><div className="mt-3 flex gap-1.5"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-[8px] text-white/50">x</span><span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-[8px] text-white/50">in</span><span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/15 text-[8px] text-white/50">ig</span></div></div>
                {(footerPreview ?? []).slice(0, 2).map((cat) => <div key={cat.id}><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-2">{cat.name}</p>{cat.menus.length > 0 ? cat.menus.map((m) => <a key={m.id} className="block py-0.5 text-xs text-white/50 hover:text-white/80">{m.label}</a>) : <span className="block py-0.5 text-xs text-white/25">No menus assigned yet</span>}</div>)}
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-2">Contact Us</p><span className="block py-0.5 text-xs text-white/50">✉ Email</span><span className="block py-0.5 text-xs text-white/50">✆ Phone</span><span className="block py-0.5 text-xs text-white/50">⌖ Address</span></div>
              </div>
              <p className="mt-6 text-center text-[10px] text-white/20">Preview — contact info &amp; social icons come from Settings → Contact &amp; Social</p>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }}>
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{editing ? 'Edit Category' : 'New Category'}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{editing ? `Editing "${editing.name}"` : 'Create a footer column category.'}</p>
          <div className="mt-6 space-y-4">
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Name *</label><input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Slug</label><input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated" className={inputClass} /></div>
            <div><label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Sort Order</label><input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} className={inputClass} /></div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"/> Active</label>
          </div>
          {formError ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{formError}</p> : null}
          {(createMutation.isError || updateMutation.isError) ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{(createMutation.error ?? updateMutation.error as {message?:string}|null)?.message ?? 'Failed to save'}</p> : null}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button onClick={() => { setShowModal(false); setEditing(null); }} className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending} className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50">{createMutation.isPending || updateMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function AdminFooterCategoriesPage() {
  return <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700"/>}><RequirePagePermission permissions={[PermissionCode.CMS_READ]}><FooterCategoriesInner/></RequirePagePermission></Suspense>;
}
