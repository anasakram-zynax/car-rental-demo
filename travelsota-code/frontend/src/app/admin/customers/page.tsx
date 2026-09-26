'use client';

import { Suspense, useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getUsersPaged, deleteUser, createUser, type UserListItem } from '@/features/admin/api/admin-users';
import { useToast } from '@/hooks/useToast';
import { usePersistentTableState } from '@/hooks/usePersistentTableState';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { DataTableViewOptions } from '@/components/admin/shared/DataTableViewOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => ({ default: m.DeleteConfirm })),
  { ssr: false }
);

const PAGE_SIZE = 20;

function CustomersPageInner() {
  const router = useRouter(); const queryClient = useQueryClient(); const { hasPermission } = usePermissions(); const toasts = useToast();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const deferredFilter = useDeferredValue(globalFilter);
  const [pageIndex, setPageIndex] = useState(0);
  // Server owns paging + filtering + sorting; reset to first page on search.
  useEffect(() => { setPageIndex(0); }, [deferredFilter]);
  const { columnVisibility, setColumnVisibility, pageSize, setPageSize } = usePersistentTableState('admin-customers', PAGE_SIZE);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);

  const sort = sorting[0];
  const sortBy =
    sort?.id === 'name' ? 'firstName'
    : sort?.id === 'email' ? 'email'
    : sort?.id === 'createdAt' ? 'createdAt'
    : sort?.id === 'lastLoginAt' ? 'lastLoginAt'
    : undefined;

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['admin', 'customers', 'paged', pageIndex, pageSize, deferredFilter, sort?.id ?? null, sort?.desc ?? null],
    queryFn: () => getUsersPaged({
      page: pageIndex + 1,
      limit: pageSize,
      search: deferredFilter.trim() || undefined,
      sortBy,
      sortDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
      userTypes: ['CUSTOMER'],
    }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onMutate: async () => { await queryClient.cancelQueries({ queryKey: ['admin', 'customers'] }); },
    onError: () => toasts.error('Failed to delete customer'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }); toasts.success('Customer deleted', 'The customer has been permanently removed.'); },
  });
  const createMutation = useMutation({
    mutationFn: (data: { email: string; password: string; firstName?: string; lastName?: string }) => createUser({ ...data, userType: 'CUSTOMER' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] }); setShowCreateModal(false); setFormData({ email: '', password: '', firstName: '', lastName: '' }); toasts.success('Customer created'); },
    onError: () => toasts.error('Failed'),
  });

  const handleDelete = useCallback((id: string, email: string) => { setDeleteTarget({ id, email }); }, []);
  const confirmDelete = useCallback(() => { if (!deleteTarget) return; deleteMutation.mutate(deleteTarget.id, { onSettled: () => setDeleteTarget(null) }); }, [deleteMutation, deleteTarget]);
  const handleCreate = useCallback(() => { setFormError(''); if (!formData.password) { setFormError('Password required'); return; } createMutation.mutate({ email: formData.email, password: formData.password, firstName: formData.firstName || undefined, lastName: formData.lastName || undefined }); }, [formData, createMutation]);

  const list = useMemo(() => data?.items ?? [], [data]);
  const totalPages = data?.totalPages ?? 0;

  const columns = useMemo((): ColumnDef<UserListItem>[] => [
    {
      id: 'name', header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || row.email,
      cell: ({ row }) => (
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">{(row.original.firstName?.[0] ?? row.original.email[0]).toUpperCase()}</div><span className="text-sm font-medium text-foreground">{[row.original.firstName, row.original.lastName].filter(Boolean).join(' ') || 'Unnamed'}</span></div>
      ),
    },
    { id: 'email', header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />, accessorKey: 'email', cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue<string>()}</span> },
    {
      id: 'status', header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, accessorKey: 'status', enableSorting: false,
      cell: ({ getValue }) => {
        const s = getValue<string>();
        return <Badge variant={s === 'ACTIVE' ? 'success' : 'secondary'} className="gap-1.5"><span className={cn('inline-block h-1.5 w-1.5 rounded-full', s === 'ACTIVE' ? 'bg-success' : 'bg-muted-foreground/40')} />{s === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>;
      },
    },
    {
      id: 'createdAt', header: ({ column }) => <DataTableColumnHeader column={column} title="Joined" />, accessorKey: 'createdAt',
      cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{new Date(getValue<string>()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>,
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
          {hasPermission(PermissionCode.USERS_DELETE) && <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(row.original.id, row.original.email)} title="Delete customer"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ], [hasPermission, handleDelete, router]);

  const table = useReactTable({
    data: list, columns, rowCount: data?.total ?? 0,
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => { const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater; setPageIndex(next.pageIndex); setPageSize(next.pageSize); },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, manualSorting: true, manualFiltering: true,
  });

  const inputClass = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10';

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Customers" description="Manage customer accounts." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input placeholder="Search customers…" value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="h-9 w-64 pl-9" /></div>
        <div className="flex items-center gap-2">
          <DataTableViewOptions table={table} />
          {hasPermission(PermissionCode.USERS_WRITE) && <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-1.5"><Plus className="h-4 w-4" />Add Customer</Button>}
        </div>
      </div>

      <DashboardCard title="Customers" period={list.length ? `${list.length} customers` : undefined} action={<DashboardCardActionsDropdown />} size="lg" className="admin-table-card" contentClassName="gap-y-0">
        <div className={cn('admin-table-viewport transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          <Table>
            <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
            <TableBody>
              {isPending ? <AdminTableSkeleton rows={8} columns={6} shortColumns={[4]} />
                : table.getRowModel().rows.length === 0 ? <TableRow><TableCell colSpan={6} className="h-64 text-center"><div className="flex flex-col items-center gap-3"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No customers found</p></div></TableCell></TableRow>
                : table.getRowModel().rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => router.push(`/admin/users/${row.original.id}`)}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
            </TableBody>
          </Table>
        </div>
        {!isPending && totalPages > 1 && <div className="border-t border-border px-6 py-3"><DataTablePagination table={table} /></div>}
      </DashboardCard>

      {deleteTarget && (
        <DeleteConfirm
          open
          count={1}
          noun={`customer (${deleteTarget.email})`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-foreground mb-4">Create Customer</h3>
            <div className="space-y-4">
              <div className="space-y-1.5"><label className="text-sm font-medium">Email *</label><input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className={inputClass} /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">Password *</label><input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className={inputClass} /></div>
              <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><label className="text-sm font-medium">First Name</label><input type="text" value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} className={inputClass} /></div><div className="space-y-1.5"><label className="text-sm font-medium">Last Name</label><input type="text" value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} className={inputClass} /></div></div>
            </div>
            {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            <div className="mt-5 flex justify-end gap-3"><Button variant="outline" onClick={() => { setShowCreateModal(false); setFormError(''); }}>Cancel</Button><Button onClick={handleCreate} disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create'}</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return <Suspense fallback={null}><RequirePagePermission permissions={[PermissionCode.USERS_READ]}><CustomersPageInner /></RequirePagePermission></Suspense>;
}
