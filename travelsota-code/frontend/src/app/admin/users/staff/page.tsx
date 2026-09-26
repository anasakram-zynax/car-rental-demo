'use client';
import { suppressDuplicateSuccess } from '@/features/notifications/lib/actor-event-dedupe';

import { Suspense, useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getStaffUsers, getRoles, deleteUser, createUser, updateUser, type UserListItem, type RoleEntity } from '@/features/admin/api/admin-users';
import { useToast } from '@/hooks/useToast';
import { usePersistentTableState } from '@/hooks/usePersistentTableState';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { DeleteConfirm } from '@/components/admin/shared/DeleteConfirm';
import { DataTableViewOptions } from '@/components/admin/shared/DataTableViewOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel, getPaginationRowModel,
  getSortedRowModel, getFilteredRowModel, useReactTable,
} from '@tanstack/react-table';

const PAGE_SIZE = 20;

function StaffPageInner() {
  const router = useRouter(); const queryClient = useQueryClient(); const { hasPermission } = usePermissions(); const toasts = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const { columnVisibility, setColumnVisibility, pageSize, setPageSize } = usePersistentTableState('admin-staff', PAGE_SIZE);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', roleId: '' });
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  const { data: users, isPending } = useQuery<UserListItem[]>({ queryKey: ['admin', 'staff'], queryFn: () => getStaffUsers() });
  const { data: roles } = useQuery<RoleEntity[]>({ queryKey: ['admin', 'roles'], queryFn: () => getRoles() });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onMutate: async (id) => { await queryClient.cancelQueries({ queryKey: ['admin', 'staff'] }); const prev = queryClient.getQueryData<UserListItem[]>(['admin', 'staff']); if (prev) queryClient.setQueryData(['admin', 'staff'], (old: UserListItem[] | undefined) => old?.filter((u) => u.id !== id) ?? []); return { prev }; },
    onError: (_e, _id, ctx: any) => { if (ctx?.prev) queryClient.setQueryData(['admin', 'staff'], ctx.prev); toasts.error('Failed to delete staff user'); },
    onSuccess: (_data, staffId) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
      // Backend emits 'user.staff.deleted' for this action — the live
      // notification is the single source. Suppress the local toast.
      suppressDuplicateSuccess('user.staff.deleted', staffId);
    },
  });
  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string; email: string; password?: string; firstName?: string; lastName?: string; roleId: string }) =>
      data.id ? updateUser(data.id, { firstName: data.firstName, lastName: data.lastName, roleId: data.roleId }) : createUser(data as any),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
      setShowCreateModal(false);
      setEditingUser(null);
      setFormData({ email: '', password: '', firstName: '', lastName: '', roleId: '' });
      if (editingUser) {
        toasts.success('Updated');
      } else {
        // Backend emits 'user.staff.created' — live notification only.
        suppressDuplicateSuccess('user.staff.created', (_data as { id?: string })?.id);
      }
    },
    onError: () => toasts.error('Failed'),
  });

  const handleDelete = useCallback((id: string, email: string) => { setDeleteTarget({ id, email }); }, [ ]);
  const confirmDelete = useCallback(() => { if (!deleteTarget) return; deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) }); }, [deleteMutation, deleteTarget]);
  const openCreate = useCallback(() => { setEditingUser(null); setFormData({ email: '', password: '', firstName: '', lastName: '', roleId: roles?.[0]?.id ?? '' }); setFormError(''); setShowCreateModal(true); }, [roles]);
  const handleSave = useCallback(() => { setFormError(''); if (!editingUser && !formData.password) { setFormError('Password required'); return; } if (!formData.roleId) { setFormError('Role required'); return; } saveMutation.mutate({ id: editingUser?.id, ...formData, password: formData.password || undefined }); }, [formData, editingUser, saveMutation]);

  const list = useMemo(() => { if (!users) return []; let l = users; if (roleFilter) l = l.filter((u) => u.roleId === roleFilter); return l; }, [users, roleFilter]);
  const roleMap = useMemo(() => { const m = new Map<string, RoleEntity>(); for (const r of roles ?? []) m.set(r.id, r); return m; }, [roles]);

  const columns = useMemo((): ColumnDef<UserListItem>[] => [
    {
      id: 'name', header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email,
      cell: ({ row }) => (
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{(row.original.firstName?.[0] ?? row.original.email[0]).toUpperCase()}</div><span className="text-sm font-medium text-foreground">{[row.original.firstName, row.original.lastName].filter(Boolean).join(' ') || 'Unnamed'}</span></div>
      ),
    },
    { id: 'email', header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />, accessorKey: 'email', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span> },
    {
      id: 'role', header: 'Role', accessorKey: 'roleId', enableSorting: false,
      cell: ({ row }) => <Badge variant="info" className="gap-1">{roleMap.get(row.original.roleId ?? '')?.name ?? row.original.roleId ?? '—'}</Badge>,
    },
    {
      id: 'status', header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, accessorKey: 'status',
      cell: ({ getValue }) => {
        const s = getValue<string>();
        return <Badge variant={s === 'ACTIVE' ? 'success' : 'secondary'} className="gap-1.5"><span className={cn('inline-block h-1.5 w-1.5 rounded-full', s === 'ACTIVE' ? 'bg-success' : 'bg-muted-foreground/40')} />{s === 'ACTIVE' ? 'Active' : s === 'INACTIVE' ? 'Inactive' : 'Suspended'}</Badge>;
      },
    },
    {
      id: 'lastLoginAt', header: ({ column }) => <DataTableColumnHeader column={column} title="Last Login" />, accessorKey: 'lastLoginAt',
      cell: ({ getValue }) => { const v = getValue<string | null>(); return <span className="text-sm text-muted-foreground">{v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>; },
    },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {hasPermission(PermissionCode.USERS_WRITE) && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => router.push(`/admin/users/${row.original.id}`)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
          {hasPermission(PermissionCode.USERS_DELETE) && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(row.original.id, row.original.email)} title="Delete user"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ], [hasPermission, roleMap, handleDelete, router]);

  const table = useReactTable({
    data: list, columns, state: { sorting, globalFilter, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => { const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater; setPageIndex(next.pageIndex); setPageSize(next.pageSize); },
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: (row, _c, filterValue: string) => { const q = filterValue.toLowerCase(); const u = row.original; return u.email.toLowerCase().includes(q) || (u.firstName ?? '').toLowerCase().includes(q) || (u.lastName ?? '').toLowerCase().includes(q); },
  });

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10';

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Staff Users" description="Manage staff accounts." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search staff…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 w-64 pl-9" /></div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none"><option value="">All Roles</option>{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        </div>
        <div className="flex items-center gap-2">
          <DataTableViewOptions table={table} />
          {hasPermission(PermissionCode.USERS_WRITE) && <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />Add Staff</Button>}
        </div>
      </div>

      <DashboardCard title="Staff" period={list.length ? `${list.length} users` : undefined} action={<DashboardCardActionsDropdown />} size="lg" className="admin-table-card" contentClassName="gap-y-0">
        <div className="admin-table-viewport">
          <Table>
            <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
            <TableBody>
              {isPending ? <AdminTableSkeleton rows={8} columns={6} shortColumns={[4]} />
                : table.getRowModel().rows.length === 0 ? <TableRow><TableCell colSpan={6} className="h-64 text-center"><div className="flex flex-col items-center gap-3"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No staff found</p></div></TableCell></TableRow>
                : table.getRowModel().rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/admin/users/${row.original.id}`)}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
            </TableBody>
          </Table>
        </div>
        {!isPending && list.length > PAGE_SIZE && <div className="border-t border-border px-6 py-3"><DataTablePagination table={table} /></div>}
      </DashboardCard>

      {deleteTarget && (
        <DeleteConfirm
          open
          count={1}
          noun={`staff user (${deleteTarget.email})`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {(showCreateModal || !!editingUser) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowCreateModal(false); setEditingUser(null); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground">{editingUser ? 'Edit Staff User' : 'Create Staff User'}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">Email *</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} /></div>
              {!editingUser && <div className="space-y-1.5"><label className="text-sm font-medium">Password *</label><input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={inputClass} /></div>}
              <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-sm font-medium">First Name</label><input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className={inputClass} /></div><div className="space-y-1.5"><label className="text-sm font-medium">Last Name</label><input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className={inputClass} /></div></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Role *</label><select value={formData.roleId} onChange={(e) => setFormData({ ...formData, roleId: e.target.value })} className={inputClass}>{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
            </div>
            {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => { setShowCreateModal(false); setEditingUser(null); }}>Cancel</Button><Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : editingUser ? 'Update' : 'Create'}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StaffPage() {
  return <Suspense fallback={null}><RequirePagePermission permissions={[PermissionCode.USERS_READ]}><StaffPageInner /></RequirePagePermission></Suspense>;
}
