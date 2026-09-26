'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search, Download, Eye, FileText, Send, CheckCircle2, Ban } from 'lucide-react';

import { DashboardCard, DashboardOverviewCardV2, DashboardCardActionsDropdown } from '@/components/dashboards/dashboard-card';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';

import { RequirePagePermission } from '@/components/admin/permission/RequirePagePermission';
import { PermissionCode } from '@/lib/permissions';
import { getAdminInvoices, getInvoiceStats, getAdminInvoiceExportUrl } from '@/features/invoices/api/admin-invoices';
import type { PaginatedInvoiceList } from '@/features/invoices/api/types';
import { AdminInvoiceStatusBadge, AdminModuleBadge } from '@/components/admin/shared/admin-badges';
import { useToast } from '@/hooks/useToast';
import { deleteInvoices } from '@/features/admin/api/admin-deletes';
import { shortInvoiceNumber } from '@/lib/utils/invoice';
import { cn } from '@/lib/cn';

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => ({ default: m.DeleteConfirm })),
  { ssr: false }
);

// ─── Types ───────────────────────────────────────────────
interface InvoiceRow {
  id: string;
  invoiceNumber: string | null;
  bookingId: string;
  bookingType: string;
  amount: string | null;
  currency: string | null;
  status: string;
  createdAt: string;
}

interface InvoiceStats {
  totalInvoices: number;
  generatedInvoices: number;
  sentInvoices: number;
  viewedInvoices: number;
  voidInvoices: number;
}

// ─── Columns ─────────────────────────────────────────────
function invoiceColumns(
  onView: (id: string) => void,
  onDelete: (row: InvoiceRow) => void,
): ColumnDef<InvoiceRow>[] {
  return [
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
        aria-label={`Select invoice ${row.original.invoiceNumber ?? row.original.id}`}
        checked={row.getIsSelected()}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        className="size-4 cursor-pointer rounded border-gray-300 accent-brand-teal"
      />
    ),
    enableSorting: false,
    size: 40,
  },
  {
    id: 'invoiceNumber',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice #" />,
    accessorKey: 'invoiceNumber' as const,
    enableSorting: false,
    cell: ({ row }) => {
      const inv = row.getValue('invoiceNumber') as string | null;
      return (
        <span className="font-mono text-sm font-semibold text-foreground" title={inv ?? undefined}>
          {inv ? `#${shortInvoiceNumber(inv)}` : '—'}
        </span>
      );
    },
  },
  {
    id: 'bookingId',
    header: 'Booking ID',
    accessorKey: 'bookingId' as const,
    cell: ({ row }) => {
      const id = row.getValue('bookingId') as string;
      return <span className="font-mono text-xs text-muted-foreground">{id.substring(0, 10)}…</span>;
    },
  },
  {
    id: 'bookingType',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
    accessorKey: 'bookingType' as const,
    enableSorting: false,
    cell: ({ row }) => {
      const t = row.getValue('bookingType') as string;
      if (t === 'flight' || t === 'hotel') {
        return <AdminModuleBadge type={t as 'flight' | 'hotel'} />;
      }
      return <span className="text-sm capitalize text-muted-foreground">{t}</span>;
    },
  },
  {
    id: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    accessorFn: (row) => row.amount ? Number(row.amount) : 0,
    enableSorting: false,
    cell: ({ row }) => (
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {new Intl.NumberFormat('en-US', { style: 'currency', currency: row.original.currency ?? 'USD' }).format(Number(row.original.amount ?? 0))}
      </span>
    ),
  },
  {
    id: 'status',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    accessorKey: 'status' as const,
    enableSorting: false,
    cell: ({ row }) => <AdminInvoiceStatusBadge status={row.getValue('status')} />,
  },
  {
    id: 'createdAt',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    accessorKey: 'createdAt' as const,
    enableSorting: false,
    cell: ({ row }) => {
      const d = new Date(row.getValue('createdAt') as string);
      return <span className="whitespace-nowrap text-sm tabular-nums text-muted-foreground">{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>;
    },
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <div className="flex items-center justify-end gap-1">
        <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-primary" onClick={(e) => { e.stopPropagation(); onView(row.original.id); }}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          View
        </Button>
        <button
          type="button"
          aria-label={`Delete invoice ${row.original.invoiceNumber ?? row.original.id}`}
          onClick={(e) => { e.stopPropagation(); onDelete(row.original); }}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-error-500 ring-1 ring-transparent transition-all duration-200 hover:bg-error-50 hover:ring-error-200 dark:hover:bg-error-900/20 dark:hover:ring-error-800"
        >
          Delete
        </button>
      </div>
    ),
    enableSorting: false,
  },
  ];
}

// ─── Page ────────────────────────────────────────────────
function InvoicesPageContent() {
  const router = useRouter();
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [statusFilter, setStatusFilter] = useState('');
  const [bookingTypeFilter, setBookingTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [rowSelection, setRowSelection] = useState({});
  const [deleteTargets, setDeleteTargets] = useState<InvoiceRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleView = useCallback((id: string) => router.push(`/admin/invoices/${id}`), [router]);
  const handleDelete = useCallback((row: InvoiceRow) => setDeleteTargets([row]), []);
  const columns = useMemo(() => invoiceColumns(handleView, handleDelete), [handleView, handleDelete]);

  const confirmDelete = async () => {
    if (!deleteTargets?.length) return;
    setDeleting(true);
    try {
      const deleted = await deleteInvoices(deleteTargets.map((i) => i.id));
      toasts.success(
        deleted === 1 ? 'Invoice deleted' : 'Invoices deleted',
        `${deleted} ${deleted === 1 ? 'invoice' : 'invoices'} permanently removed.`,
      );
      setDeleteTargets(null);
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoice-stats'] });
    } catch (err: any) {
      toasts.error('Delete failed', err?.message ?? 'Unable to delete invoices.');
    } finally {
      setDeleting(false);
    }
  };

  const { data: stats, isPending: statsLoading } = useQuery<InvoiceStats>({
    queryKey: ['admin', 'invoice-stats'],
    queryFn: getInvoiceStats,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // Server owns paging; reset to first page whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, bookingTypeFilter, debouncedSearch]);

  const { data, isPending, isFetching } = useQuery<PaginatedInvoiceList>({
    queryKey: ['admin', 'invoices', page, pageSize, statusFilter, bookingTypeFilter, debouncedSearch],
    queryFn: () => getAdminInvoices({ page, limit: pageSize, status: statusFilter || undefined, bookingType: bookingTypeFilter || undefined, q: debouncedSearch || undefined }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const invoiceItems = useMemo(() => data?.items ?? [], [data?.items]);

  const table = useReactTable({
    data: invoiceItems,
    columns,
    rowCount: data?.total ?? 0,
    state: { rowSelection, pagination: { pageIndex: page - 1, pageSize } },
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page - 1, pageSize }) : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
  });

  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-6">
      {/* ── Page Title ──────────────────────────────────── */}
      <AdminPageHeader
        title="Invoices"
        description="Track and manage all booking invoices."
        actions={
          <a
            href={getAdminInvoiceExportUrl({ status: statusFilter || undefined, bookingType: bookingTypeFilter || undefined })}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </a>
        }
      />

      {/* ── Stats Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <DashboardOverviewCardV2
          data={{ value: statsLoading ? '...' : stats?.totalInvoices ?? 0 }}
          title="Total"
          period="All invoices"
          icon={<FileText className="h-5 w-5" />}
          iconColor="hsl(var(--primary))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: statsLoading ? '...' : stats?.generatedInvoices ?? 0 }}
          title="Generated"
          period="Awaiting send"
          icon={<FileText className="h-5 w-5" />}
          iconColor="hsl(var(--chart-3))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: statsLoading ? '...' : stats?.sentInvoices ?? 0 }}
          title="Sent"
          period="Delivered"
          icon={<Send className="h-5 w-5" />}
          iconColor="hsl(var(--chart-1))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: statsLoading ? '...' : stats?.viewedInvoices ?? 0 }}
          title="Viewed"
          period="Opened by client"
          icon={<CheckCircle2 className="h-5 w-5" />}
          iconColor="hsl(var(--chart-2))"
          action={null}
        />
        <DashboardOverviewCardV2
          data={{ value: statsLoading ? '...' : stats?.voidInvoices ?? 0 }}
          title="Void"
          period="Cancelled"
          icon={<Ban className="h-5 w-5" />}
          iconColor="hsl(var(--destructive))"
          action={null}
        />
      </div>

      {/* ── Bulk delete bar ─────────────────────────────── */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-error-200 bg-error-50/60 px-4 py-2.5 dark:border-error-800/60 dark:bg-error-950/20">
          <span className="text-sm font-medium text-error-700 dark:text-error-300">
            {selectedCount} invoice{selectedCount !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => {
              const selected = table.getRowModel().rows.filter((r) => r.getIsSelected()).map((r) => r.original);
              if (selected.length) setDeleteTargets(selected);
            }}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-error-600 active:scale-[0.97]"
          >
            Delete selected
          </button>
        </div>
      )}

      {/* ── Invoices Table ──────────────────────────────── */}
      <article className="admin-table-card overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
          <div>
            <h3 className="text-base font-semibold">All Invoices</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data ? `${data.total.toLocaleString()} invoices` : 'Loading…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search invoice # or booking…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10"
            >
              <option value="">All Status</option>
              <option value="generated">Generated</option>
              <option value="sent">Sent</option>
              <option value="viewed">Viewed</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
              <option value="void">Void</option>
            </select>
            <select
              value={bookingTypeFilter}
              onChange={(e) => setBookingTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10"
            >
              <option value="">All Types</option>
              <option value="flight">Flights</option>
              <option value="hotel">Hotels</option>
            </select>
          </div>
        </div>
        <div className={cn('admin-table-viewport transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => (
                    <TableCell isHeader key={header.id} className="py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j} className="py-3.5">
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 120 : j === 1 ? 80 : j === 3 ? 100 : 140 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !data?.items.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">No invoices found</p>
                        <p className="text-xs text-muted-foreground">Try adjusting your filters.</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40" onClick={() => router.push(`/admin/invoices/${row.original.id}`)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <div className="block border-t border-border px-6 py-3">
          {!isPending && data && data.items.length > 0 && (
            <DataTablePagination table={table} />
          )}
        </div>
      </article>

      {deleteTargets && (
        <DeleteConfirm
          open
          count={deleteTargets.length}
          noun="invoice"
          loading={deleting}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

export default function AdminInvoicesPage() {
  return (
    <RequirePagePermission permissions={[PermissionCode.INVOICES_READ]}>
      <InvoicesPageContent />
    </RequirePagePermission>
  );
}
