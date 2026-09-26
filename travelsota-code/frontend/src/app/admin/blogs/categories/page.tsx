'use client';
import { confirmDialog } from '@/components/ui/confirm-dialog';

import { Suspense, useState, useMemo, useCallback } from 'react';
import { Plus, Pencil, Trash2, FolderTree } from 'lucide-react';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { PermissionCode } from '@/lib/permissions';
import { useAdminBlogCategories, useCreateBlogCategory, useDeleteBlogCategory, useUpdateBlogCategory } from '@/features/blog/hooks';
import type { BlogAdminCategory } from '@/features/blog/types';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { useToast } from '@/hooks/useToast';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

interface FormState { name: string; slug: string; description: string; }
function emptyForm(): FormState { return { name: '', slug: '', description: '' }; }

function CategoriesPageInner() {
  const toasts = useToast();
  const { hasPermission } = usePermissions();
  const { data: categories, isPending } = useAdminBlogCategories();
  const createMutation = useCreateBlogCategory();
  const updateMutation = useUpdateBlogCategory();
  const deleteMutation = useDeleteBlogCategory();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BlogAdminCategory | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState('');
  const cats = useMemo(() => categories ?? [], [categories]);

  const openCreate = useCallback(() => { setEditing(null); setForm(emptyForm()); setFormError(''); setShowModal(true); }, []);
  const openEdit = useCallback((cat: BlogAdminCategory) => { setEditing(cat); setForm({ name: cat.name, slug: cat.slug, description: cat.description ?? '' }); setFormError(''); setShowModal(true); }, []);
  const handleSave = useCallback(() => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    const input = { name: form.name.trim(), ...(form.slug.trim() ? { slug: form.slug.trim() } : {}), ...(form.description.trim() ? { description: form.description.trim() } : {}) };
    const onSuccess = () => { toasts.success(editing ? 'Category updated' : 'Category created'); setShowModal(false); setEditing(null); setForm(emptyForm()); };
    const onError = (err: unknown) => { toasts.error((err as { message?: string })?.message ?? 'Failed to save category'); };
    if (editing) updateMutation.mutate({ id: editing.id, input }, { onSuccess, onError });
    else createMutation.mutate(input, { onSuccess, onError });
  }, [form, editing, createMutation, updateMutation, toasts]);
  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Delete category "${name}"?`, message: 'Categories with posts cannot be deleted.', confirmLabel: 'Delete' }))) return;
    deleteMutation.mutate(id, { onSuccess: () => toasts.success('Category deleted'), onError: (err) => toasts.error((err as { message?: string })?.message ?? 'Failed to delete category') });
  }, [deleteMutation, toasts]);

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10';

  const columns = useMemo((): ColumnDef<BlogAdminCategory>[] => [
    {
      id: 'name',
      header: 'Name',
      accessorKey: 'name',
      cell: ({ getValue }) => <span className="text-sm font-semibold text-foreground">{getValue<string>()}</span>,
    },
    {
      id: 'slug',
      header: 'Slug',
      accessorKey: 'slug',
      cell: ({ getValue }) => <code className="text-xs text-muted-foreground">/{getValue<string>()}</code>,
      enableSorting: false,
    },
    {
      id: 'description',
      header: 'Description',
      accessorKey: 'description',
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>() ?? '—'}</span>,
      enableSorting: false,
    },
    {
      id: 'postCount',
      header: 'Posts',
      accessorKey: '_count.posts',
      cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground">{row.original._count.posts}</span>,
      enableSorting: false,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5">
          {hasPermission(PermissionCode.BLOGS_WRITE) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(row.original)} title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {hasPermission(PermissionCode.BLOGS_WRITE) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(row.original.id, row.original.name)} title="Delete">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
      enableSorting: false,
    },
  ], [hasPermission, openEdit, handleDelete]);

  const table = useReactTable({
    data: cats,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Blog Categories"
        description="Manage blog post categories."
        breadcrumbs={[{ label: 'Blog' }, { label: 'Categories' }]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{cats.length} categor{cats.length === 1 ? 'y' : 'ies'}</p>
        {hasPermission(PermissionCode.BLOGS_WRITE) && (
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Category
          </Button>
        )}
      </div>

      <DashboardCard
        title="All Categories"
        period={cats.length ? `${cats.length} categories` : undefined}
        action={<DashboardCardActionsDropdown />}
        size="lg"
        className="admin-table-card"
        contentClassName="gap-y-0"
      >
        <div className="admin-table-viewport">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableCell isHeader key={h.id}>
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 140 : j === 1 ? 100 : j === 2 ? 240 : j === 3 ? 50 : 80 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : cats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FolderTree className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No categories found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DashboardCard>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowModal(false); setEditing(null); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground">{editing ? 'Edit Category' : 'New Category'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{editing ? `Editing "${editing.name}"` : 'Add a new blog category.'}</p>
            <div className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Travel Tips" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Slug</label>
                <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated from name" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className={inputClass} />
              </div>
            </div>
            {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            {(createMutation.isError || updateMutation.isError) && (
              <p className="mt-3 text-sm text-destructive">{(createMutation.error ?? updateMutation.error as { message?: string } | null)?.message ?? 'Failed to save category'}</p>
            )}
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditing(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving} className="gap-1.5">
                {isSaving ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminBlogCategoriesPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <RequirePagePermission permissions={[PermissionCode.BLOGS_READ]}>
        <CategoriesPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
