'use client';

import { Suspense, useState, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, RotateCcw, ClipboardList, Trash2 } from 'lucide-react';
import { usePermissions } from '@/components/admin/permission/usePermissions';
import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getAuditLogs, type AuditLogEntry } from '@/features/admin/api/admin-audit-logs';
import { deleteAuditLogs } from '@/features/admin/api/admin-deletes';
import { AdminAuditActionBadge } from '@/components/admin/shared/admin-badges';
import { DashboardCard, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => m.DeleteConfirm),
  { ssr: false }
);
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

const PAGE_SIZE = 25;

type AuditRow = AuditLogEntry;

function AuditLogsPageInner() {
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string>>({});
  const [rowSelection, setRowSelection] = useState({});
  const [deleteTargets, setDeleteTargets] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const toasts = useToast();

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets?.length) return;
    setDeleting(true);
    try {
      const deleted = await deleteAuditLogs(deleteTargets);
      toasts.success(
        deleted === 1 ? 'Audit log deleted' : 'Audit logs deleted',
        `${deleted} ${deleted === 1 ? 'entry' : 'entries'} permanently removed.`,
      );
      setDeleteTargets(null);
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
    } catch (err: any) {
      toasts.error('Delete failed', err?.message ?? 'Unable to delete audit logs.');
    } finally {
      setDeleting(false);
    }
  }, [deleteTargets, toasts, queryClient]);

  const { data, isPending, isFetching } = useQuery({
    queryKey: ['admin', 'audit-logs', appliedFilters, page],
    queryFn: () => getAuditLogs({ ...appliedFilters, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const applyFilters = useCallback(() => {
    const f: Record<string, string> = {};
    if (actionFilter) f.action = actionFilter;
    if (entityFilter) f.entity = entityFilter;
    if (fromDate) f.from = fromDate;
    if (toDate) f.to = toDate;
    setPage(1);
    setRowSelection({});
    setAppliedFilters(f);
  }, [actionFilter, entityFilter, fromDate, toDate]);

  const clearFilters = useCallback(() => {
    setActionFilter('');
    setEntityFilter('');
    setFromDate('');
    setToDate('');
    setAppliedFilters({});
    setRowSelection({});
    setPage(1);
  }, []);

  const hasActiveFilters = Object.keys(appliedFilters).length > 0;

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns = useMemo((): ColumnDef<AuditRow>[] => [
    {
      id: 'select',
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all on page"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          className="size-4 cursor-pointer rounded border-gray-300 accent-brand-teal"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select log entry"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          className="size-4 cursor-pointer rounded border-gray-300 accent-brand-teal"
        />
      ),
      enableSorting: false,
      size: 40,
    },
    {
      id: 'action',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Action" />,
      accessorKey: 'action',
      cell: ({ row }) => <AdminAuditActionBadge action={row.original.action} />,
    },
    {
      id: 'entity',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Entity" />,
      accessorKey: 'entity',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-foreground">{row.original.entity}</span>
          {row.original.entityId && (
            <span className="text-xs text-muted-foreground font-mono">
              #{row.original.entityId.slice(0, 8)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'description',
      header: 'Description',
      accessorKey: 'description',
      cell: ({ getValue }) => (
        <span className="max-w-[280px] block truncate text-muted-foreground">
          {getValue<string>() ?? '—'}
        </span>
      ),
      enableSorting: false,
    },
    {
      id: 'user',
      header: 'User',
      accessorKey: 'userId',
      cell: ({ row }) => (
        row.original.userId
          ? <span className="text-xs font-mono text-muted-foreground">{row.original.userId.slice(0, 8)}…</span>
          : <span className="text-xs text-muted-foreground/60">System</span>
      ),
      enableSorting: false,
    },
    {
      id: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      accessorKey: 'createdAt',
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
          {new Date(getValue<string>()).toLocaleString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'rowActions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <button
          type="button"
          aria-label="Delete log entry"
          onClick={(e) => { e.stopPropagation(); setDeleteTargets([row.original.id]); }}
          className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-muted-foreground/50 transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-900/20"
        >
          <Trash2 className="size-4" />
        </button>
      ),
    },
  ], []);

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, rowSelection, pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE })
        : updater;
      setPage(next.pageIndex + 1);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Audit Logs" description="View a chronological record of system actions and changes." />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10"
          >
            <option value="">All</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">Entity</label>
          <Input
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            placeholder="e.g. user, booking"
            className="h-9 w-36"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">From</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-muted-foreground">To</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9"
          />
        </div>
        <Button size="sm" onClick={applyFilters} className="gap-1.5">
          <Search className="size-3.5" />
          Apply
        </Button>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
            <RotateCcw className="size-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Bulk delete bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-error-200 bg-error-50/60 px-4 py-2.5 dark:border-error-800/60 dark:bg-error-950/20">
          <span className="text-sm font-medium text-error-700 dark:text-error-300">
            {selectedCount} {selectedCount === 1 ? 'entry' : 'entries'} selected
          </span>
          <button
            onClick={() => {
              const ids = table.getRowModel().rows.filter((r) => r.getIsSelected()).map((r) => r.original.id);
              if (ids.length) setDeleteTargets(ids);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-error-600 active:scale-[0.97]"
          >
            <Trash2 className="size-3.5" />
            Delete selected
          </button>
        </div>
      )}

      {/* Table */}
      <DashboardCard
        title="Activity Log"
        period={total ? `${total.toLocaleString()} entries` : undefined}
        action={<DashboardCardActionsDropdown />}
        size="lg"
        className="admin-table-card"
        contentClassName="gap-y-0"
      >
        <div className={cn("admin-table-viewport transition-opacity duration-200", isFetching && !isPending && "opacity-60")}>
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
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 2 ? 220 : 100 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <ClipboardList className="h-10 w-10 text-muted-foreground/30" />
                      <p className="text-sm font-medium text-muted-foreground">No audit logs found</p>
                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
                      )}
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
        {!isPending && total > PAGE_SIZE && (
          <div className="border-t border-border px-6 py-3">
            <DataTablePagination table={table} />
          </div>
        )}
      </DashboardCard>

      {deleteTargets && (
        <DeleteConfirm
          open
          count={deleteTargets.length}
          noun="audit log"
          loading={deleting}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

export default function AdminAuditLogsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <RequirePagePermission permissions={[PermissionCode.AUDIT_READ]}>
        <AuditLogsPageInner />
      </RequirePagePermission>
    </Suspense>
  );
}
