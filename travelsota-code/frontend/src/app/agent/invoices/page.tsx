'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Search, Download, Eye, FileText } from 'lucide-react';

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

import { getAgentInvoices, getAgentInvoicePdfUrl } from '@/features/invoices/api/agent-invoices';
import type { PaginatedInvoiceList } from '@/features/invoices/api/types';
import { AdminInvoiceStatusBadge, AdminModuleBadge } from '@/components/admin/shared/admin-badges';
import { shortInvoiceNumber } from '@/lib/utils/invoice';
import { cn } from '@/lib/cn';

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

// ─── Columns ─────────────────────────────────────────────
function invoiceColumns(onView: (id: string) => void): ColumnDef<InvoiceRow>[] {
  return [
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
      accessorFn: (row) => (row.amount ? Number(row.amount) : 0),
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
          <a
            href={getAgentInvoicePdfUrl(row.original.id)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Download invoice ${row.original.invoiceNumber ?? row.original.id}`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            PDF
          </a>
        </div>
      ),
      enableSorting: false,
    },
  ];
}

// ─── Page ────────────────────────────────────────────────
export default function AgentInvoicesPage() {
  const router = useRouter();
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

  const handleView = useCallback((id: string) => router.push(`/agent/invoices/${id}`), [router]);
  const columns = useMemo(() => invoiceColumns(handleView), [handleView]);

  // Server owns paging; reset to first page whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, bookingTypeFilter, debouncedSearch]);

  const { data, isPending, isFetching } = useQuery<PaginatedInvoiceList>({
    queryKey: ['agent', 'invoices', page, pageSize, statusFilter, bookingTypeFilter, debouncedSearch],
    queryFn: () => getAgentInvoices({ page, limit: pageSize, status: statusFilter || undefined, bookingType: bookingTypeFilter || undefined, q: debouncedSearch || undefined }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const invoiceItems = useMemo(() => data?.items ?? [], [data?.items]);

  const table = useReactTable({
    data: invoiceItems,
    columns,
    rowCount: data?.total ?? 0,
    state: { pagination: { pageIndex: page - 1, pageSize } },
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page - 1, pageSize }) : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
  });

  return (
    <div className="space-y-6">
      {/* ── Page Title ──────────────────────────────────── */}
      <AdminPageHeader
        title="Invoices"
        description="View and download your booking invoices."
      />

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
                  <TableRow key={row.id} className="cursor-pointer border-b border-border/60 transition-colors hover:bg-muted/40" onClick={() => router.push(`/agent/invoices/${row.original.id}`)}>
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
    </div>
  );
}
