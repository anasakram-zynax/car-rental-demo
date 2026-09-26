'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from '@/components/ui/modal';
import {
  useAdminCmsMenus,
  useAdminCmsPages,
  useCreateCmsMenu,
  useDeleteCmsMenu,
  useFooterCategories,
  useSaveCmsMenuStructure,
  useUpdateCmsMenu,
} from '../hooks';
import type { CmsAdminMenu, CmsLinkType, CmsPosition, CmsTarget } from '../types';
import { useToast } from '@/hooks/useToast';
import { PlusIcon, PencilIcon, TrashBinIcon } from '@/icons';

const POSITIONS: { key: CmsPosition; label: string; hint: string }[] = [
  { key: 'HEADER', label: 'Header Menu', hint: 'Shown in the site header navigation bar. PAGE type links go to /page/{slug}.' },
  { key: 'FOOTER', label: 'Footer Menu', hint: 'Top-level items = column headings. Their children = links in that column. PAGE type links go to /page/{slug}.' },
  { key: 'BOTH', label: 'Header & Footer', hint: 'Appears in both header and footer. PAGE type links go to /page/{slug}.' },
];

interface FormState {
  label: string;
  linkType: CmsLinkType;
  pageId: string;
  url: string;
  target: CmsTarget;
  position: CmsPosition;
  isActive: boolean;
  footerCategoryId: string;
}

function emptyForm(position: CmsPosition = 'HEADER'): FormState {
  return { label: '', linkType: 'PAGE', pageId: '', url: '', target: 'SELF', position, isActive: true, footerCategoryId: '' };
}

export function MenuBuilder() {
  const toasts = useToast();
  const { data: menus, isPending } = useAdminCmsMenus();
  const { data: pagesData } = useAdminCmsPages({ limit: 100 });
  const { data: footerCategories } = useFooterCategories();

  const activeFooterCategories = useMemo(
    () => (footerCategories ?? []).filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [footerCategories],
  );

  const createMutation = useCreateCmsMenu();
  const updateMutation = useUpdateCmsMenu();
  const deleteMutation = useDeleteCmsMenu();
  const saveStructure = useSaveCmsMenuStructure();

  const [items, setItems] = useState<CmsAdminMenu[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CmsAdminMenu | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (menus && !loaded) {
      setItems(menus); // eslint-disable-line react-hooks/set-state-in-effect
      setLoaded(true);
    }
  }, [menus, loaded]);

  const pages = useMemo(() => pagesData?.data ?? [], [pagesData]);

  const byPosition = useCallback(
    (position: CmsPosition) =>
      items
        .filter((i) => i.position === position)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const childrenOf = useCallback(
    (position: CmsPosition, parentId: string | null) =>
      byPosition(position)
        .filter((i) => (i.parentId ?? null) === parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [byPosition],
  );

  const handleDrop = useCallback(
    (position: CmsPosition, targetId: string) => {
      const draggedId = draggingId;
      if (!draggedId || draggedId === targetId) return;

      let newItems: CmsAdminMenu[] = [];
      setItems((prev) => {
        const dragged = prev.find((i) => i.id === draggedId);
        const target = prev.find((i) => i.id === targetId);
        if (!dragged || !target || dragged.position !== position) return prev;
        if ((dragged.parentId ?? null) !== (target.parentId ?? null)) return prev;

        const siblings = prev
          .filter((i) => i.position === position && (i.parentId ?? null) === (dragged.parentId ?? null))
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const fromIdx = siblings.findIndex((i) => i.id === draggedId);
        const toIdx = siblings.findIndex((i) => i.id === targetId);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;

        const [moved] = siblings.splice(fromIdx, 1);
        siblings.splice(toIdx, 0, moved);
        const renumbered = siblings.map((s, idx) => ({ ...s, sortOrder: idx }));
        newItems = prev.map((i) => renumbered.find((r) => r.id === i.id) ?? i);
        return newItems;
      });

      setDraggingId(null);
      setDropTargetId(null);

      // Persist after state settles — use the computed newItems
      const section = newItems.length > 0
        ? newItems.filter((i) => i.position === position).map((i) => ({ id: i.id, position: i.position, parentId: i.parentId, sortOrder: i.sortOrder }))
        : items.filter((i) => i.position === position).map((i) => ({ id: i.id, position: i.position, parentId: i.parentId, sortOrder: i.sortOrder }));

      if (section.length > 0) {
        saveStructure.mutate(section, {
          onSuccess: () => {},
          onError: () => toasts.error('Failed to save menu order'),
        });
      }
    },
    [draggingId, items, saveStructure, toasts],
  );

  const handleIndent = useCallback(
    (position: CmsPosition, item: CmsAdminMenu) => {
      if (item.parentId) return;
      const topLevel = childrenOf(position, null);
      const idx = topLevel.findIndex((i) => i.id === item.id);
      const prev = idx > 0 ? topLevel[idx - 1] : null;
      if (!prev) return;

      let newItems: CmsAdminMenu[] = [];
      setItems((prevItems) => {
        newItems = prevItems.map((i) =>
          i.id === item.id ? { ...i, parentId: prev.id, sortOrder: childrenOf(position, prev.id).length } : i,
        );
        return newItems;
      });

      const section = newItems.filter((i) => i.position === position).map((i) => ({ id: i.id, position: i.position, parentId: i.parentId, sortOrder: i.sortOrder }));
      saveStructure.mutate(section, { onError: () => toasts.error('Failed to save menu') });
    },
    [childrenOf, saveStructure, toasts],
  );

  const handleOutdent = useCallback(
    (position: CmsPosition, item: CmsAdminMenu) => {
      if (!item.parentId) return;
      let newItems: CmsAdminMenu[] = [];
      setItems((prevItems) => {
        newItems = prevItems.map((i) => (i.id === item.id ? { ...i, parentId: null, sortOrder: childrenOf(position, null).length } : i));
        return newItems;
      });

      const section = newItems.filter((i) => i.position === position).map((i) => ({ id: i.id, position: i.position, parentId: i.parentId, sortOrder: i.sortOrder }));
      saveStructure.mutate(section, { onError: () => toasts.error('Failed to save menu') });
    },
    [childrenOf, saveStructure, toasts],
  );

  const openAdd = useCallback((position: CmsPosition) => {
    setEditing(null);
    setForm(emptyForm(position));
    setFormError('');
    setShowModal(true);
  }, []);

  const openEdit = useCallback(async (item: CmsAdminMenu) => {
    setEditing(item);
    setForm({
      label: item.label,
      linkType: item.linkType,
      pageId: item.pageId ?? '',
      url: item.url ?? '',
      target: item.target,
      position: item.position,
      isActive: item.isActive,
      footerCategoryId: item.footerCategoryId ?? '',
    });
    setFormError('');
    setShowModal(true);
  }, []);

  const handleSave = useCallback(() => {
    setFormError('');
    if (!form.label.trim()) {
      setFormError('Label is required.');
      return;
    }
    if (form.linkType === 'PAGE' && !form.pageId) {
      setFormError('Select a page to link to.');
      return;
    }
    if (form.linkType === 'EXTERNAL' && !form.url.trim()) {
      setFormError('Enter a URL.');
      return;
    }

    const input = {
      label: form.label.trim(),
      linkType: form.linkType,
      pageId: form.linkType === 'PAGE' ? form.pageId : undefined,
      url: form.linkType === 'EXTERNAL' ? form.url.trim() : undefined,
      target: form.target,
      position: form.position,
      isActive: form.isActive,
      footerCategoryId: form.position === 'HEADER' ? undefined : (form.footerCategoryId || undefined),
    };

    const onSuccess = () => {
      toasts.success(editing ? 'Menu item updated' : 'Menu item added');
      setShowModal(false);
      setEditing(null);
    };
    const onError = (err: unknown) => {
      toasts.error((err as { message?: string })?.message ?? 'Failed to save menu item');
    };

    if (editing) {
      updateMutation.mutate({ id: editing.id, input }, { onSuccess, onError });
    } else {
      createMutation.mutate(input, { onSuccess, onError });
    }
  }, [form, editing, createMutation, updateMutation, toasts]);

  const handleDelete = useCallback(
    async (item: CmsAdminMenu) => {
      if (!(await confirmDialog({ title: `Delete menu item "${item.label}"?`, message: 'Children will be removed too.', confirmLabel: 'Delete' }))) return;
      deleteMutation.mutate(item.id, {
        onSuccess: () => toasts.success('Menu item deleted'),
        onError: (err) => toasts.error((err as { message?: string })?.message ?? 'Failed to delete menu item'),
      });
    },
    [deleteMutation, toasts],
  );

  const renderItem = (item: CmsAdminMenu, position: CmsPosition, isChild: boolean) => {
    const children = childrenOf(position, item.id);
    const targetHref =
      item.linkType === 'PAGE'
        ? item.cmsPage
          ? `/page/${item.cmsPage.slug}`
          : null
        : item.url;

    return (
      <div key={item.id}>
        <div
          draggable
          onDragStart={() => setDraggingId(item.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTargetId(item.id);
          }}
          onDragLeave={() => setDropTargetId((cur) => (cur === item.id ? null : cur))}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(position, item.id);
          }}
          className={`group flex cursor-grab items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm transition-all active:cursor-grabbing dark:bg-gray-800 ${
            draggingId === item.id
              ? 'scale-[0.98] border-brand-teal-400 bg-brand-teal-50/50 shadow-sm dark:bg-brand-teal-900/10'
              : dropTargetId === item.id
                ? 'border-brand-teal-400 ring-2 ring-brand-teal-200 dark:ring-brand-teal-900/40'
                : 'border-gray-200 hover:border-brand-teal-300 dark:border-gray-700'
          }`}
        >
          <svg className="h-4 w-4 shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
          </svg>
          {isChild ? (
            <svg className="h-3 w-3 shrink-0 text-brand-teal/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l6 7-6 7" />
            </svg>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">{item.label}</span>
            {targetHref ? (
              <span className="ml-2 truncate text-xs text-gray-400 dark:text-gray-500">{targetHref}</span>
            ) : null}
          </span>
          {item.position !== 'HEADER' && item.footerCategoryId ? (
            <span className="shrink-0 rounded-full bg-brand-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-teal-600 dark:bg-brand-teal-900/20 dark:text-brand-teal-300">
              {item.footerCategory?.name ?? activeFooterCategories.find((c) => c.id === item.footerCategoryId)?.name ?? 'Category'}
            </span>
          ) : null}
          {!item.isActive ? (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700 dark:text-gray-400">
              Off
            </span>
          ) : null}
          {item.linkType === 'EXTERNAL' ? (
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              Ext
            </span>
          ) : null}
          <span className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => handleIndent(position, item)}
              title="Nest under the item above (make submenu)"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-teal-600 dark:hover:bg-gray-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16M14 9l-3 3 3 3" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => handleOutdent(position, item)}
              disabled={!item.parentId}
              title="Promote to top level (remove from submenu)"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-teal-600 disabled:opacity-25 dark:hover:bg-gray-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16M16 9l3 3-3 3" />
              </svg>
            </button>
            <div className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-700" />
            <button
              type="button"
              onClick={() => openEdit(item)}
              title="Edit menu item"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-brand-teal-600 dark:hover:bg-gray-700"
            >
              <PencilIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDelete(item)}
              title="Delete menu item"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-error-600 dark:hover:bg-gray-700"
            >
              <TrashBinIcon className="size-4" />
            </button>
          </span>
        </div>
        {children.length > 0 ? (
          <div className="ml-8 border-l-2 border-brand-teal/15 pl-4">
            {children.map((child) => renderItem(child, position, true))}
          </div>
        ) : null}
      </div>
    );
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30';

  return (
    <div className="space-y-6">
      {isPending && items.length === 0 ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gray-200 dark:bg-gray-700" />
      ) : (
        POSITIONS.map((pos) => {
          const topLevel = childrenOf(pos.key, null);
          return (
            <div key={pos.key} className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{pos.label}</h3>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{pos.hint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => openAdd(pos.key)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-teal-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal-600"
                >
                  <PlusIcon className="size-4" /> Add Item
                </button>
              </div>
              <div className="space-y-2 p-4">
                {topLevel.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400 dark:border-gray-700 dark:text-gray-500">
                    {pos.key === 'FOOTER'
                      ? 'No items yet. Top-level items become column headings and their children become links. Assign each footer menu to a Footer Category (from the Footer Categories page) so it shows in the right column.'
                      : 'No items yet. Drag to reorder — use the indentation buttons to nest a submenu.'}
                  </p>
                ) : (
                  topLevel.map((item) => renderItem(item, pos.key, false))
                )}
              </div>
            </div>
          );
        })
      )}

      {/* Visual preview */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="border-b border-gray-100 px-6 py-3 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Site Preview</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500">How your menus will appear on the public site.</p>
        </div>
        <div className="p-6 space-y-6">
          {/* Header preview */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Header</span>
            <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-r from-brand-teal to-brand-teal-600 px-4 py-3 dark:border-gray-700">
              <div className="flex items-center gap-4 text-xs font-semibold text-white/80">
                <span className="text-white">Flights</span>
                <span className="text-white">Hotels</span>
                <span className="text-white">Blog</span>
                {childrenOf('HEADER', null)
                  .slice(0, 3)
                  .map((item) => (
                    <span key={item.id} className="text-white/60">{item.label}</span>
                  ))}
                {childrenOf('HEADER', null).length > 3 ? (
                  <span className="text-white/40">More…</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Footer preview */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Footer</span>
            <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-[#0a1218] px-5 py-4 dark:border-gray-700">
              <div className="flex gap-10 text-xs">
                {childrenOf('FOOTER', null).length > 0 ? (
                  childrenOf('FOOTER', null).slice(0, 4).map((item) => (
                    <div key={item.id}>
                      <span className="font-bold uppercase text-white/30">{item.label}</span>
                      {childrenOf('FOOTER', item.id).length > 0 ? (
                        <div className="mt-1.5 space-y-1">
                          {childrenOf('FOOTER', item.id).slice(0, 3).map((child) => (
                            <div key={child.id} className="text-white/50">{child.label}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-1.5 text-white/40">—</div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex gap-10">
                    <div>
                      <span className="font-bold uppercase text-white/30">Explore</span>
                      <div className="mt-1.5 space-y-1">
                        <div className="text-white/50">Home</div>
                        <div className="text-white/50">Flights</div>
                        <div className="text-white/50">Hotels</div>
                      </div>
                    </div>
                    <div>
                      <span className="font-bold uppercase text-white/30">Support</span>
                      <div className="mt-1.5 space-y-1">
                        <div className="text-white/50">My Bookings</div>
                        <div className="text-white/50">Help Center</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditing(null); }}>
        <div className="p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {editing ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {editing ? `Editing "${editing.label}"` : 'Link to a CMS page or an external URL.'}
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Label *</label>
              <input type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Link Type</label>
                <select
                  value={form.linkType}
                  onChange={(e) => setForm({ ...form, linkType: e.target.value as CmsLinkType })}
                  className={inputClass}
                >
                  <option value="PAGE">CMS Page</option>
                  <option value="EXTERNAL">External URL</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Open In</label>
                <select
                  value={form.target}
                  onChange={(e) => setForm({ ...form, target: e.target.value as CmsTarget })}
                  className={inputClass}
                >
                  <option value="SELF">Same window</option>
                  <option value="BLANK">New window</option>
                </select>
              </div>
            </div>

            {form.linkType === 'PAGE' ? (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Select Page *</label>
                <select
                  value={form.pageId}
                  onChange={(e) => setForm({ ...form, pageId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">— Select a page —</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} (/page/{p.slug})</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">URL *</label>
                <input type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" className={inputClass} />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Position</label>
                <select
                  value={form.position}
                  onChange={(e) => setForm({ ...form, position: e.target.value as CmsPosition })}
                  className={inputClass}
                >
                  {POSITIONS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </div>
              {form.position !== 'HEADER' ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Footer Category
                  </label>
                  <select
                    value={form.footerCategoryId}
                    onChange={(e) => setForm({ ...form, footerCategoryId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">— No category —</option>
                    {activeFooterCategories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Groups this menu under a footer column. Only shown in the footer.
                  </p>
                </div>
              ) : null}
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-brand-teal-500 focus:ring-brand-teal-500"
              />
              Active
            </label>
          </div>

          {formError ? <p className="mt-3 text-sm text-error-600 dark:text-error-400">{formError}</p> : null}
          {(createMutation.isError || updateMutation.isError) ? (
            <p className="mt-3 text-sm text-error-600 dark:text-error-400">
              {(createMutation.error ?? updateMutation.error as { message?: string } | null)?.message ?? 'Failed to save menu item'}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditing(null); }}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-teal-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 disabled:opacity-50"
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Item'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
