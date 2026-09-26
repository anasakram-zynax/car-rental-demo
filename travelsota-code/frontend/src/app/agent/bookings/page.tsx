'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useToast } from '@/hooks/useToast';
import { promptDialog } from '@/components/ui/prompt-dialog';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrency, formatCurrencyWithCode } from '@/lib/utils/currency';
import { SupplierGate } from '@/components/shared/supplier-gate';
import { cn } from '@/lib/cn';
import {
  getAgentBookings,
  getAgentBookingDetail,
  cancelAgentBooking,
  type PaginatedAgentBookings,
  type AgentBookingItem,
  type AgentBookingDetail,
  type CancelBookingResponse,
} from '@/features/agent/api/agent-bookings';
import {
  downloadVoucher,
  downloadInvoice,
} from '@/features/agent/api/agent-documents';
import {
  getRefundPreview,
  type RefundEstimate,
} from '@/features/agent/api/agent-refund';
import {
  getAgentCommissions,
} from '@/features/commission/api/agent-commission';

import { PlaneIcon, HotelIcon, SearchIcon, RefreshIcon, CloseIcon, HistoryIcon, EyeIcon, XCircleIcon, AlertTriangle, CheckIcon, WalletIcon, FileTextIcon, DownloadIcon, MailIcon } from '@/components/agent/AgentIcons';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { AdminBookingStatusBadge, AdminModuleBadge } from '@/components/admin/shared/admin-badges';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';

// ─── Status tabs (admin pattern: quick filter + counts) ─────
// Values map 1:1 to the server `status` param — same set as the
// previous status <select>, so no booking logic is lost.
const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'pending_payment', label: 'Awaiting Payment' },
  { value: 'booking_in_progress', label: 'Processing' },
  { value: 'held', label: 'Held' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ticketed', label: 'Ticketed' },
  { value: 'booked', label: 'Booked' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

// ─── Main Page ─────────────────────────────────────────────

export default function AgentBookingsPage() {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();

  // ── State ──────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelResult, setCancelResult] = useState<CancelBookingResponse | null>(null);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [previewEstimate, setPreviewEstimate] = useState<RefundEstimate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // ── Bookings Query ─────────────────────────────────────
  const { data, isPending, isError, error, isFetching, refetch } = useQuery<PaginatedAgentBookings>({
    queryKey: ['agent', 'bookings', page, pageSize, statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: () =>
      getAgentBookings({
        page,
        limit: pageSize,
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        fromDate: dateFrom || undefined,
        toDate: dateTo || undefined,
      }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  // ── Booking Detail Query ───────────────────────────────
  const { data: detail, isPending: detailLoading } = useQuery<AgentBookingDetail | { message: string }>({
    queryKey: ['agent', 'booking', selectedBookingId],
    queryFn: () => getAgentBookingDetail(selectedBookingId!),
    enabled: !!selectedBookingId,
  });

  // ── Commission map (earnings column, admin-table parity) ──
  // One lightweight fetch; matched client-side by bookingId.
  const { data: commissionFeed } = useQuery({
    queryKey: ['agent', 'bookings', 'commission-map'],
    queryFn: () => getAgentCommissions({ page: 1, limit: 100 }),
    staleTime: 60_000,
  });
  const commissionByBooking = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string; status: string }>();
    for (const c of commissionFeed?.items ?? []) {
      if (!map.has(c.bookingId)) {
        map.set(c.bookingId, { amount: c.commissionAmount, currency: c.currency ?? 'USD', status: c.status });
      }
    }
    return map;
  }, [commissionFeed]);

  // ── Cancel Mutation ────────────────────────────────────
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelAgentBooking(id, reason),
    onSuccess: (result) => {
      setCancelResult(result);
      queryClient.invalidateQueries({ queryKey: ['agent', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['agent', 'booking', result.booking.id] });
      toasts.success('Booking cancelled', `Refund: ${formatCurrencyWithCode(result.refundAmount, result.booking?.currency ?? 'USD', decimalsMap)}${result.creditShellId ? ' (credit shell)' : ''}`);
    },
    onError: (err: any) => {
      toasts.error('Cancellation failed', err?.message ?? 'Unable to cancel booking.');
    },
  });

  // ── Derived ────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(
      (b) =>
        b.id.toLowerCase().includes(q) ||
        b.ref?.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q) ||
        b.from?.toLowerCase().includes(q) ||
        b.to?.toLowerCase().includes(q) ||
        b.passengerName?.toLowerCase().includes(q) ||
        b.customerEmail?.toLowerCase().includes(q),
    );
  }, [data, search]);

  // Tab counts come from the loaded server page (All = server total).
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of data?.items ?? []) {
      counts[b.status] = (counts[b.status] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  // Keep in sync with the backend: preview allows pending|confirmed|ticketed|booked,
  // cancel allows pending|confirmed|ticketed. Show 'booked' (hotels) too — the
  // preview explains the policy even where cancel later rejects it.
  const cancellableStatuses = ['pending', 'pending_payment', 'booking_in_progress', 'held', 'confirmed', 'ticketed', 'booked'];

  // ── Columns (admin DataTable pattern, client-side sort) ──
  const columns = useMemo<ColumnDef<AgentBookingItem>[]>(() => [
    {
      id: 'ref',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Ref" />,
      accessorFn: (row) => row.ref ?? row.id,
      cell: ({ row }) => (
        <span className="font-mono text-xs font-medium text-foreground" title={row.original.ref ?? row.original.id}>
          {row.original.ref ? `#${row.original.ref.substring(0, 8)}` : '—'}
        </span>
      ),
    },
    {
      id: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      accessorKey: 'type',
      cell: ({ row }) => {
        const t = row.getValue('type') as string;
        return t === 'flight' || t === 'hotel'
          ? <AdminModuleBadge type={t} />
          : <span className="text-xs capitalize text-muted-foreground">{t}</span>;
      },
    },
    {
      id: 'route',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Route / Hotel" />,
      accessorFn: (row) => (row.from && row.to ? `${row.from} → ${row.to}` : row.from ?? ''),
      cell: ({ row }) => {
        const b = row.original;
        const route = b.from && b.to ? `${b.from} → ${b.to}` : b.from || null;
        return (
          <div className="min-w-0 max-w-[190px]">
            {route ? (
              <p className="truncate text-xs font-semibold text-foreground" title={`${route}${b.passengerName ? ` · ${b.passengerName}` : ''}`}>{route}</p>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
            {b.passengerName && (
              <p className="truncate text-[11px] text-muted-foreground" title={b.passengerName}>{b.passengerName}</p>
            )}
          </div>
        );
      },
    },
    {
      id: 'dates',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Dates" />,
      accessorKey: 'createdAt',
      cell: ({ row }) => {
        const d = new Date(row.getValue('dates') as string);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return (
          <span title={label} className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {label}
          </span>
        );
      },
    },
    {
      id: 'amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      accessorFn: (row) => row.amount ?? 0,
      cell: ({ row }) => {
        const b = row.original;
        const label = b.amount != null ? formatCurrencyWithCode(b.amount, b.currency ?? 'USD', decimalsMap) : '—';
        return b.amount != null ? (
          <span title={label} className="whitespace-nowrap text-xs font-bold tabular-nums text-foreground">
            {label}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
    },
    {
      id: 'earnings',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Earnings" />,
      accessorFn: (row) => commissionByBooking.get(row.id)?.amount ?? -1,
      cell: ({ row }) => {
        const earn = commissionByBooking.get(row.original.id);
        if (!earn) return <span className="text-xs text-muted-foreground">—</span>;
        const label = `${formatCurrencyWithCode(earn.amount, earn.currency, decimalsMap)} · ${earn.status}`;
        return (
          <span title={label} className="whitespace-nowrap text-xs font-semibold tabular-nums text-brand-teal-700 dark:text-brand-teal-400">
            {formatCurrencyWithCode(earn.amount, earn.currency, decimalsMap)}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: 'status',
      cell: ({ row }) => <AdminBookingStatusBadge status={row.getValue('status') as string} />,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const booking = row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedBookingId(booking.id)}
              className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-brand-teal-700 transition-colors hover:bg-brand-teal-50 dark:text-brand-teal-400 dark:hover:bg-brand-teal-900/20"
            >
              <EyeIcon className="size-3.5" />
              View
            </button>
            {cancellableStatuses.includes(booking.status) && (
              <button
                type="button"
                onClick={() => handleCancelClick(booking.id)}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium text-error-600 transition-colors hover:bg-error-50 dark:text-error-400 dark:hover:bg-error-900/20"
              >
                <XCircleIcon className="size-3.5" />
                Cancel
              </button>
            )}
          </div>
        );
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [decimalsMap, commissionByBooking]);

  // TanStack Table's API is intentionally dynamic (React-Compiler-incompatible).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: filteredItems,
    columns,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page - 1, pageSize }) : updater;
      setPage(next.pageIndex + 1);
      setPageSize(next.pageSize);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: data?.totalPages ?? 1,
  });

  const handleCancelClick = async (bookingId: string) => {
    setCancellingBookingId(bookingId);
    setCancelReason('');
    setCancelResult(null);
    setPreviewEstimate(null);
    setPreviewError(null);
    setPreviewLoading(true);
    setShowCancelModal(true);

    try {
      const estimate = await getRefundPreview(bookingId);
      if ('message' in estimate) {
        setPreviewError((estimate as { message: string }).message);
      } else {
        setPreviewEstimate(estimate as RefundEstimate);
      }
    } catch (err: any) {
      setPreviewError(err?.message ?? 'Failed to load refund estimate');
    } finally {
      setPreviewLoading(false);
    }
  };

  const total = data?.total ?? 0;
  const hasActiveFilters = Boolean(typeFilter || statusFilter || dateFrom || dateTo || search.trim());

  const clearFilters = () => {
    setTypeFilter('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setPage(1);
  };

  // ── Render ─────────────────────────────────────────────
  return (
    <div className="w-full space-y-6">
      <AdminPageHeader
        title="My Bookings"
        description="View, manage, and cancel your flight and hotel bookings"
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh bookings"
            className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-input bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshIcon className={cn('size-4', isFetching && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      {/* Status filter tabs with counts (admin pattern) */}
      <div role="tablist" aria-label="Filter by status" className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => {
          const active = statusFilter === tab.value;
          const count = tab.value === '' ? total : (statusCounts[tab.value] ?? 0);
          return (
            <button
              key={tab.value || 'all'}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              className={cn(
                'inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors',
                active
                  ? 'border-brand-teal-200 bg-brand-teal-50 text-brand-teal-700 dark:border-brand-teal-800 dark:bg-brand-teal-900/20 dark:text-brand-teal-400'
                  : 'border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {tab.label}
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums',
                active ? 'bg-brand-teal-100 text-brand-teal-800 dark:bg-brand-teal-900/40 dark:text-brand-teal-300' : 'bg-muted text-muted-foreground',
              )}>
                {isPending ? '…' : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Bookings card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-xs text-muted-foreground">
            {isPending ? 'Loading…' : `${total.toLocaleString()} total`}
            {isFetching && !isPending && (
              <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-brand-teal-500 align-middle" />
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              aria-label="Filter by type"
              className="h-11 min-h-[44px] cursor-pointer rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              <option value="">All Types</option>
              <option value="flight">Flights</option>
              <option value="hotel">Hotels</option>
            </select>

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                aria-label="From date"
                className="h-11 min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
              <span className="text-xs text-muted-foreground/60">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                aria-label="To date"
                className="h-11 min-h-[44px] rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>

            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search bookings"
                className="h-11 min-h-[44px] w-40 rounded-lg border border-input bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-lg border border-input bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <CloseIcon className="size-3" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table viewport — horizontal scroll on mobile (admin pattern) */}
        <div className={cn('admin-table-viewport overflow-x-auto transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          <Table className="w-full min-w-[900px]">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border">
                  {headerGroup.headers.map((header) => (
                    <TableCell isHeader key={header.id} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="border-b border-border/60">
                    {Array.from({ length: columns.length }).map((__, j) => (
                      <TableCell key={j} className="px-4 py-3.5">
                        <div className="h-4 animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5 px-4">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                        <AlertTriangle className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">Failed to load bookings</p>
                      <p className="max-w-sm text-xs text-muted-foreground">
                        {(error as Error)?.message ?? 'Something went wrong. Please try again.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => refetch()}
                        className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                      >
                        <RefreshIcon className="size-3.5" />
                        Retry
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2.5 px-4">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
                        <HistoryIcon className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-foreground">No bookings found</p>
                      <p className="text-xs text-muted-foreground">
                        {hasActiveFilters ? 'Try adjusting your filters' : 'Your bookings will appear here'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="mt-1 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
                        >
                          <CloseIcon className="size-3.5" />
                          Clear filters
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!isPending && !isError && total > 0 && (
          <div className="border-t border-border px-4 py-3">
            <DataTablePagination table={table} />
          </div>
        )}
      </div>

      {/* Booking Detail Modal */}
      {selectedBookingId && detail && !detailLoading && 'type' in detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBookingId(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {detail.type === 'flight' ? <PlaneIcon className="size-5 text-brand-500" /> : <HotelIcon className="size-5 text-brand-teal-500" />}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">{detail.type} Booking</h3>
              </div>
              <button onClick={() => setSelectedBookingId(null)} aria-label="Close details" className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <CloseIcon className="size-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Status</p>
                  <div className="mt-1"><AdminBookingStatusBadge status={detail.status} /></div>
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Amount</p>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {detail.amount ? formatCurrency(detail.amount, detail.currency ?? 'USD', decimalsMap) : '—'}
                    <span className="text-xs font-normal text-gray-400 ml-1">{detail.currency}</span>
                  </p>
                </div>
                <SupplierGate>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Provider</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{detail.provider}</p>
                </div>
                </SupplierGate>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Reference</p>
                  <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{detail.ref || detail.locatorCode || '—'}</p>
                </div>
              </div>

              {detail.type === 'flight' && (() => {
                const snap = (detail.offerSnapshot ?? {}) as Record<string, any>;
                const leg = Array.isArray(snap.legs) ? snap.legs[0] : undefined;
                const seg = leg && Array.isArray(leg.segments) ? leg.segments[0] : undefined;
                const route = snap.route as { from?: string; to?: string; departureDate?: string } | undefined;
                const summary = snap.summary as { from?: string; to?: string; departureDate?: string } | undefined;
                const fromName = snap.from ?? route?.from ?? summary?.from ?? seg?.departure?.airport ?? seg?.from ?? leg?.from;
                const toName = snap.to ?? route?.to ?? summary?.to ?? seg?.arrival?.airport ?? seg?.to ?? leg?.to;
                const departRaw = snap.departureDate ?? route?.departureDate ?? summary?.departureDate ?? seg?.departure?.time ?? seg?.departureTime ?? leg?.departureDate;
                const carriers = Array.isArray(snap.legs)
                  ? Array.from(new Set(snap.legs.flatMap((l: any) => Array.isArray(l.segments) ? l.segments.map((s: any) => s.marketingAirline || s.airline || s.carrier).filter(Boolean) : []))).join(', ')
                  : undefined;
                const hasAny = fromName || toName || departRaw || carriers;
                return (
                  <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Flight Details</p>
                    {hasAny ? (
                      <div className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                        <p>Route: {[fromName, toName].filter(Boolean).join(' → ') || 'N/A'}</p>
                        {departRaw && <p>Departure: {new Date(departRaw).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</p>}
                        {carriers && <p>Airline: {carriers}</p>}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400">Full itinerary available on your voucher.</p>
                    )}
                  </div>
                );
              })()}

              {detail.type === 'hotel' && detail.holder && (
                <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Guest Details</p>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Holder: {(detail.holder as any)?.name || 'N/A'}</p>
                </div>
              )}

              {/* Booking Timeline */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Timeline</p>
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-brand-200 dark:bg-brand-800">
                      <div className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Booking created</p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(detail.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  {detail.status === 'cancelled' && (
                    <div className="flex items-start gap-2">
                      <div className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-error-200 dark:bg-error-800">
                        <div className="h-1.5 w-1.5 rounded-full bg-error-500" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-error-600 dark:text-error-400">Cancelled</p>
                        <p className="text-[10px] text-gray-400">
                          {new Date(detail.updatedAt).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                  {cancellableStatuses.includes(detail.status) && (
                    <div className="flex items-start gap-2">
                      <div className="mt-1 flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700">
                        <div className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 italic">Cancellation available</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Last updated</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {new Date(detail.updatedAt).toLocaleString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>

              {detail.message && (
                <div className="rounded-xl bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  {detail.message}
                </div>
              )}
            </div>

            {/* Documents section */}
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => downloadVoucher(detail.id)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
                >
                  <FileTextIcon className="size-3.5" />
                  Voucher PDF
                </button>
                <button
                  onClick={() => downloadInvoice(detail.id)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
                >
                  <DownloadIcon className="size-3.5" />
                  Invoice PDF
                </button>
                <button
                  onClick={async () => {
                    const email = await promptDialog({
                      title: 'Email these documents to',
                      placeholder: 'name@example.com',
                      confirmLabel: 'Send',
                    });
                    if (email) {
                      toasts.success('Documents sent', `Voucher and invoice emailed to ${email}`);
                    }
                  }}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-brand-900/20 dark:hover:text-brand-400"
                >
                  <MailIcon className="size-3.5" />
                  Email
                </button>
              </div>
            </div>

            {/* Cancel action in detail modal */}
            {cancellableStatuses.includes(detail.status) && (
              <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-700">
                <button
                  onClick={() => { setSelectedBookingId(null); handleCancelClick(detail.id); }}
                  className="inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-error-200 bg-white px-4 py-2.5 text-sm font-medium text-error-600 transition-colors hover:bg-error-50 dark:border-error-800 dark:bg-gray-800 dark:text-error-400 dark:hover:bg-error-950/20"
                >
                  <XCircleIcon className="size-4" />
                  Cancel this booking
                </button>
              </div>
            )}

            <div className="mt-3">
              <button onClick={() => setSelectedBookingId(null)}
                className="min-h-[44px] w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Not found message */}
      {selectedBookingId && detail && 'message' in detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedBookingId(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-500 dark:text-gray-400">{detail.message}</p>
            <button onClick={() => setSelectedBookingId(null)}
              className="mt-4 min-h-[44px] w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Cancel Preview + Confirmation Modal */}
      {showCancelModal && cancellingBookingId && !cancelResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { if (!cancelMutation.isPending) { setShowCancelModal(false); setCancellingBookingId(null); } }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            {/* Loading State */}
            {previewLoading && (
              <div className="flex flex-col items-center py-10">
                <div className="h-10 w-10 animate-spin rounded-full border-3 border-gray-200 border-t-brand-500" />
                <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Calculating refund estimate…
                </p>
              </div>
            )}

            {/* Error State */}
            {!previewLoading && previewError && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
                    <AlertTriangle className="size-5 text-error-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Unable to Load Estimate</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{previewError}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowCancelModal(false); setCancellingBookingId(null); }}
                  className="mt-6 min-h-[44px] w-full cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  Close
                </button>
              </>
            )}

            {/* Preview State */}
            {!previewLoading && !previewError && previewEstimate && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-error-50 dark:bg-error-900/20">
                    <AlertTriangle className="size-5 text-error-500" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cancel Booking</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Review the refund estimate below. This action cannot be undone.
                    </p>
                  </div>
                </div>

                {/* Refund Estimate Breakdown */}
                <div className="mt-4 space-y-2.5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Booking Total</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {formatCurrencyWithCode(previewEstimate.totalAmount, previewEstimate.currency, decimalsMap)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cancellation Fee</span>
                    <span className="font-medium text-error-600 dark:text-error-400">
                      -{formatCurrencyWithCode(previewEstimate.cancellationFee, previewEstimate.currency, decimalsMap)}
                    </span>
                  </div>
                  {previewEstimate.feeType && (
                    <div className="text-[10px] text-gray-400 italic">
                      {previewEstimate.feeDescription || `Based on: ${previewEstimate.feeType}`}
                    </div>
                  )}
                  <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                    <div className="flex justify-between text-sm font-bold">
                      <span className="text-gray-900 dark:text-white">Estimated Net Refund</span>
                      <span className={previewEstimate.netRefund > 0 ? 'text-success-600 dark:text-success-400' : 'text-gray-500 dark:text-gray-400'}>
                        {formatCurrencyWithCode(previewEstimate.netRefund, previewEstimate.currency, decimalsMap)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-brand-50 p-2 text-xs text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                    {previewEstimate.refundType === 'credit_shell' ? (
                      <>
                        <WalletIcon className="size-3.5 shrink-0" />
                        <span>Refund will be issued as a <strong>credit shell</strong> — usable for future bookings</span>
                      </>
                    ) : (
                      <>
                        <WalletIcon className="size-3.5 shrink-0" />
                        <span>Refund will be sent to your <strong>wallet</strong></span>
                      </>
                    )}
                  </div>
                  {previewEstimate.isFreeCancellation && (
                    <div className="rounded-lg bg-success-50 p-2 text-xs text-success-700 dark:bg-success-900/20 dark:text-success-400">
                      Free cancellation — no fee will be charged
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Reason (optional)
                  </label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Changed travel plans, found better price…"
                    rows={2}
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-600 dark:focus:ring-brand-900/30"
                  />
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => { setShowCancelModal(false); setCancellingBookingId(null); }}
                    disabled={cancelMutation.isPending}
                    className="min-h-[44px] flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Keep Booking
                  </button>
                  <button
                    onClick={() => cancelMutation.mutate({ id: cancellingBookingId, reason: cancelReason || undefined })}
                    disabled={cancelMutation.isPending}
                    className="min-h-[44px] flex-1 cursor-pointer rounded-xl bg-error-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-error-600 disabled:opacity-50"
                  >
                    {cancelMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Processing…
                      </span>
                    ) : (
                      'Confirm Cancellation'
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Cancel Result Modal */}
      {cancelResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => { setCancelResult(null); setShowCancelModal(false); setCancellingBookingId(null); }}>
          <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20">
                <CheckIcon className="size-5 text-success-500" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Booking Cancelled</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Ref: #{cancelResult.modificationRequestId.substring(0, 8)}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Refund amount</span>
                <span className="text-lg font-bold text-success-600 dark:text-success-400">
                  {formatCurrencyWithCode(cancelResult.refundAmount, cancelResult.booking?.currency ?? 'USD', decimalsMap)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cancellation fee</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrencyWithCode(cancelResult.cancellationFee, cancelResult.booking?.currency ?? 'USD', decimalsMap)}
                </span>
              </div>
              {cancelResult.creditShellId && (
                <div className="flex items-center gap-2 rounded-lg bg-warning-50 p-2 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                  <WalletIcon className="size-3.5 shrink-0" />
                  <span>Credit shell created (usable for future bookings)</span>
                </div>
              )}
              {!cancelResult.creditShellId && cancelResult.refundAmount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-2 text-xs text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                  <WalletIcon className="size-3.5 shrink-0" />
                  <span>Refund sent to wallet</span>
                </div>
              )}
            </div>

            <button
              onClick={() => { setCancelResult(null); setShowCancelModal(false); setCancellingBookingId(null); refetch(); }}
              className="mt-5 min-h-[44px] w-full cursor-pointer rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-600"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
