'use client';

import { Suspense, useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getUsersPaged, getRoles, deleteUser, createUser, updateUser, type UserListItem, type RoleEntity } from '@/features/admin/api/admin-users';
import { useToast } from '@/hooks/useToast';
import { usePersistentTableState } from '@/hooks/usePersistentTableState';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { DataTableViewOptions } from '@/components/admin/shared/DataTableViewOptions';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => m.DeleteConfirm),
  { ssr: false }
);
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

const PAGE_SIZE = 20;

function UsersPageInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const toasts = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const deferredFilter = useDeferredValue(globalFilter);
  const [pageIndex, setPageIndex] = useState(0);
  const { columnVisibility, setColumnVisibility, pageSize, setPageSize } = usePersistentTableState('admin-users', PAGE_SIZE);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserListItem | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '', userType: '' as string, roleId: '' });
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  // Server owns paging + filtering + sorting; reset to first page on search.
  useEffect(() => {
    setPageIndex(0);
  }, [deferredFilter]);

  const sort = sorting[0];
  const sortBy =
    sort?.id === 'name' ? 'firstName'
    : sort?.id === 'email' ? 'email'
    : sort?.id === 'lastLoginAt' ? 'lastLoginAt'
    : undefined;

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['admin', 'users', 'paged', pageIndex, pageSize, deferredFilter, sort?.id ?? null, sort?.desc ?? null],
    queryFn: () =>
      getUsersPaged({
        page: pageIndex + 1,
        limit: pageSize,
        search: deferredFilter.trim() || undefined,
        sortBy,
        sortDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const { data: roles } = useQuery<RoleEntity[]>({
    queryKey: ['admin', 'roles'],
    queryFn: () => getRoles(),
    staleTime: 5 * 60_000,
    enabled: showCreateModal || !!editingUser,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'users'] });
    },
    onError: () => toasts.error('Failed to delete user'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); toasts.success('User deleted', 'The user has been permanently removed.'); },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string; email: string; password?: string; firstName?: string; lastName?: string; userType?: string; roleId?: string }) =>
      data.id ? updateUser(data.id, { firstName: data.firstName, lastName: data.lastName, userType: data.userType, roleId: data.roleId || undefined }) : createUser(data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      setShowCreateModal(false); setEditingUser(null);
      setFormData({ email: '', password: '', firstName: '', lastName: '', userType: '', roleId: '' });
      toasts.success(editingUser ? 'User updated' : 'User created');
    },
    onError: () => toasts.error('Failed to save user'),
  });

  const handleDelete = useCallback(async (id: string, email: string) => {
    setDeleteTarget({ id, email });
  }, []);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) });
  }, [deleteMutation, deleteTarget]);

  const openEdit = useCallback((user: UserListItem) => {
    setEditingUser(user);
    setFormData({ email: user.email, password: '', firstName: user.firstName ?? '', lastName: user.lastName ?? '', userType: user.userType, roleId: user.roleId ?? '' });
    setFormError('');
  }, []);

  const openCreate = useCallback(() => {
    setEditingUser(null); setFormData({ email: '', password: '', firstName: '', lastName: '', userType: 'CUSTOMER', roleId: '' }); setFormError(''); setShowCreateModal(true);
  }, []);

  const handleSave = useCallback(async () => {
    setFormError('');
    if (!editingUser && !formData.password) { setFormError('Password is required for new users'); return; }
    if (formData.userType === 'STAFF' && !formData.roleId) { setFormError('Role is required for staff users'); return; }
    saveMutation.mutate({ id: editingUser?.id, ...formData, password: formData.password || undefined });
  }, [formData, editingUser, saveMutation]);

  const list = useMemo(() => data?.items ?? [], [data]);
  const totalPages = data?.totalPages ?? 0;

  const columns = useMemo((): ColumnDef<UserListItem>[] => [
    {
      id: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="User" />,
      accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email,
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {(row.original.firstName?.[0] ?? row.original.email[0]).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-foreground">
            {[row.original.firstName, row.original.lastName].filter(Boolean).join(' ') || '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      accessorKey: 'email',
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span>,
    },
    {
      id: 'userType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorKey: 'userType',
      enableSorting: false,
      cell: ({ getValue }) => {
        const t = getValue<string>();
        return (
          <Badge variant={t === 'STAFF' ? 'info' : t === 'AGENT' ? 'warning' : 'secondary'} className="gap-1">
            {t === 'STAFF' ? 'Staff' : t === 'AGENT' ? 'Agent' : 'Customer'}
          </Badge>
        );
      },
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: 'status',
      enableSorting: false,
      cell: ({ getValue }) => {
        const s = getValue<string>();
        return (
          <Badge variant={s === 'ACTIVE' ? 'success' : s === 'SUSPENDED' ? 'error' : s === 'INACTIVE' ? 'secondary' : 'warning'} className="gap-1.5">
            <span className={cn('inline-block h-1.5 w-1.5 rounded-full', s === 'ACTIVE' ? 'bg-success' : s === 'SUSPENDED' ? 'bg-destructive' : s === 'INACTIVE' ? 'bg-muted-foreground/40' : 'bg-warning')} />
            {s === 'ACTIVE' ? 'Active' : s === 'INACTIVE' ? 'Inactive' : s === 'SUSPENDED' ? 'Suspended' : 'Pending'}
          </Badge>
        );
      },
    },
    {
      id: 'lastLoginAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Login" />,
      accessorKey: 'lastLoginAt',
      cell: ({ getValue }) => {
        const v = getValue<string | null>();
        return <span className="text-sm tabular-nums text-muted-foreground">{v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {hasPermission(PermissionCode.USERS_WRITE) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(row.original)} title="Edit"><Pencil className="h-4 w-4" /></Button>
          )}
          {hasPermission(PermissionCode.USERS_DELETE) && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(row.original.id, row.original.email)} title="Delete user"><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      ),
      enableSorting: false,
    },
  ], [hasPermission, openEdit, handleDelete]);

  const table = useReactTable({
    data: list,
    columns,
    rowCount: data?.total ?? 0,
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater;
      setPageIndex(next.pageIndex);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10';

  return (
    <div className="space-y-6">
      <AdminPageHeader title="User Management" description="Manage all system users." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 w-64 pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <DataTableViewOptions table={table} />
          {hasPermission(PermissionCode.USERS_WRITE) && (
            <Button size="sm" onClick={openCreate} className="gap-1.5"><Plus className="h-4 w-4" />Add User</Button>
          )}
        </div>
      </div>

      <DashboardCard title="All Users" period={list.length ? `${list.length} users` : undefined} action={<DashboardCardActionsDropdown />} size="lg" className="admin-table-card" contentClassName="gap-y-0">
        <div className={cn("admin-table-viewport transition-opacity duration-200", isFetching && !isPending && "opacity-60")}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                <AdminTableSkeleton rows={8} columns={6} shortColumns={[3, 4]} />
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No users found</p></div>
                </TableCell></TableRow>
              ) : table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/admin/users/${row.original.id}`)}>
                  {row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!isPending && totalPages > 1 && <div className="border-t border-border px-6 py-3"><DataTablePagination table={table} /></div>}
      </DashboardCard>

      {deleteTarget && (
        <DeleteConfirm
          open
          count={1}
          noun={`user (${deleteTarget.email})`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {(showCreateModal || !!editingUser) && (        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { setShowCreateModal(false); setEditingUser(null); }}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-foreground">{editingUser ? 'Edit User' : 'Create User'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{editingUser ? `Editing ${editingUser.email}` : 'Add a new user.'}</p>
            <div className="mt-6 space-y-4">
              {!editingUser && <div className="space-y-1.5"><label className="text-sm font-medium">Email *</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} /></div>}
              {!editingUser && <div className="space-y-1.5"><label className="text-sm font-medium">Password *</label><input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={inputClass} /></div>}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">User Type *</label>
                <select value={formData.userType} onChange={(e) => setFormData({ ...formData, userType: e.target.value, roleId: e.target.value !== 'STAFF' ? '' : formData.roleId })} className={inputClass}>
                  <option value="STAFF">Staff</option><option value="CUSTOMER">Customer</option><option value="AGENT">Agent</option>
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><label className="text-sm font-medium">First Name</label><input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className={inputClass} /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium">Last Name</label><input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className={inputClass} /></div>
              </div>
              {formData.userType === 'STAFF' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Role *</label>
                  <select value={formData.roleId} onChange={(e) => setFormData({ ...formData, roleId: e.target.value })} className={inputClass}>
                    <option value="">Select role…</option>{roles?.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            {saveMutation.isError && <p className="mt-3 text-sm text-destructive">{(saveMutation.error as any)?.message ?? 'Failed'}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowCreateModal(false); setEditingUser(null); }}>Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving…' : editingUser ? 'Save Changes' : 'Create User'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <RequirePagePermission permissions={[PermissionCode.USERS_READ]}><UsersPageInner /></RequirePagePermission>
    </Suspense>
  );
}
