'use client';

import { useState, useMemo, useCallback, useDeferredValue, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Eye, X, Plane, Hotel } from 'lucide-react';
import { getAgentBookings, type AgentBookingItem } from '@/features/agent/api/agent-bookings';
import { useCurrency, useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { usePersistentTableState } from '@/hooks/usePersistentTableState';
import { DashboardCard } from '@/components/dashboards/dashboard-card';
import { AdminTableSkeleton } from '@/components/admin/tables/AdminTableSkeleton';
import { DataTableViewOptions } from '@/components/admin/shared/DataTableViewOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { DataTableColumnHeader } from '@/components/ui/data-table/data-table-column-header';
import { StatusBadge } from '@/components/ui/badge';
import { AdminModuleBadge, AdminBookingStatusBadge } from '@/components/admin/shared/admin-badges';
import { cn } from '@/lib/cn';
import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel,
  getSortedRowModel, getPaginationRowModel, useReactTable,
} from '@tanstack/react-table';

interface TravelerProfile {
  name: string;
  email?: string;
  bookingCount: number;
  totalSpent: number;
  firstBooking: string;
  lastBooking: string;
  latestStatus: string;
  types: Array<'flight' | 'hotel'>;
  bookings: AgentBookingItem[];
}

const PAGE_SIZE = 20;

export default function AgentCustomersPage() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [tab, setTab] = useState<'all' | 'flight' | 'hotel'>('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<TravelerProfile | null>(null);
  const { convertAmount, selectedCurrency } = useCurrency();
  const { decimalsMap } = useCurrencyData();
  const { columnVisibility, setColumnVisibility, pageSize, setPageSize } = usePersistentTableState('agent-customers', PAGE_SIZE);

  useEffect(() => { setPageIndex(0); }, [deferredSearch, tab]);

  const { data: bookingsData, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['agent', 'bookings', 'all-customers'],
    queryFn: async () => {
      const first = await getAgentBookings({ page: 1, limit: 100 });
      const pages = [first];
      const totalPages = Math.min(first.totalPages, 10);
      for (let p = 2; p <= totalPages; p++) {
        pages.push(await getAgentBookings({ page: p, limit: 100 }));
      }
      return { items: pages.flatMap((pg) => pg.items) };
    },
    staleTime: 60_000,
  });

  const customers = useMemo<TravelerProfile[]>(() => {
    if (!bookingsData?.items) return [];
    const map = new Map<string, {
      name: string; email?: string; bookingCount: number; totalSpent: number;
      firstBooking: string; lastBooking: string; latestStatus: string;
      types: Set<'flight' | 'hotel'>; bookings: AgentBookingItem[];
    }>();
    for (const booking of bookingsData.items) {
      const name = booking.passengerName || `Guest-${booking.id.substring(0, 6)}`;
      // ponytail: never let one bad currency kill the whole table.
      let amount = 0;
      try {
        amount = booking.amount != null ? convertAmount(booking.amount, booking.currency ?? 'USD') : 0;
      } catch {
        amount = 0;
      }
      const existing = map.get(name);
      if (existing) {
        existing.bookingCount += 1;
        existing.totalSpent += amount;
        existing.types.add(booking.type);
        if (!existing.email && booking.customerEmail) existing.email = booking.customerEmail;
        if (booking.createdAt > existing.lastBooking) { existing.lastBooking = booking.createdAt; existing.latestStatus = booking.status; }
        if (booking.createdAt < existing.firstBooking) existing.firstBooking = booking.createdAt;
        existing.bookings.push(booking);
      } else {
        map.set(name, {
          name, email: booking.customerEmail || undefined, bookingCount: 1, totalSpent: amount,
          firstBooking: booking.createdAt, lastBooking: booking.createdAt, latestStatus: booking.status,
          types: new Set([booking.type]), bookings: [booking],
        });
      }
    }
    return Array.from(map.values())
      .map((t) => ({ ...t, types: Array.from(t.types) as Array<'flight' | 'hotel'> }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [bookingsData, convertAmount]);

  const filtered = useMemo(() => {
    let list = customers;
    const q = deferredSearch.trim().toLowerCase();
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q));
    if (tab === 'flight') list = list.filter((c) => c.types.includes('flight'));
    if (tab === 'hotel') list = list.filter((c) => c.types.includes('hotel'));
    return list;
  }, [customers, deferredSearch, tab]);

  const openDetail = useCallback((c: TravelerProfile) => setSelectedCustomer(c), []);

  const columns = useMemo((): ColumnDef<TravelerProfile>[] => [
    {
      id: 'name', header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      accessorKey: 'name',
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-semibold text-muted-foreground">
            {row.original.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground" title={row.original.name}>{row.original.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {row.original.types.map((t) => (
                <AdminModuleBadge key={t} type={t} />
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'email', header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      accessorKey: 'email', enableSorting: false,
      cell: ({ row }) => <span className="text-sm tabular-nums text-muted-foreground" title={row.original.email ?? undefined}>{row.original.email ?? '—'}</span>,
    },
    {
      id: 'bookings', header: ({ column }) => <DataTableColumnHeader column={column} title="Bookings" />,
      accessorKey: 'bookingCount',
      cell: ({ getValue }) => <span className="text-sm font-medium tabular-nums text-foreground">{getValue<number>()}</span>,
    },
    {
      id: 'spend', header: ({ column }) => <DataTableColumnHeader column={column} title="Spend" />,
      accessorKey: 'totalSpent',
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrencyWithCode(row.original.totalSpent, selectedCurrency.code, decimalsMap)}</span>
      ),
    },
    {
      id: 'status', header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, accessorKey: 'latestStatus', enableSorting: false,
      cell: ({ row }) => <AdminBookingStatusBadge status={row.original.latestStatus} />,
    },
    {
      id: 'actions', header: () => <span className="sr-only">Actions</span>, enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground hover:text-brand-600" onClick={() => openDetail(row.original)} title="View details" aria-label={`View ${row.original.name}`}>
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [openDetail, selectedCurrency.code, decimalsMap]);

  const table = useReactTable({
    data: filtered, columns,
    state: { sorting, columnVisibility, pagination: { pageIndex, pageSize } },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: (updater) => { const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater; setPageIndex(next.pageIndex); setPageSize(next.pageSize); },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (isError) {
    return (
      <div className="space-y-6">
        <AdminPageHeader title="My Customers" description="Travelers you've booked for." />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">Could not load customers</p>
          <p className="text-xs text-muted-foreground">Check your connection and try again.</p>
          <button
            onClick={() => refetch()}
            className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl bg-brand-teal-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title="My Customers" description={`Travelers you've booked for — ${customers.length} unique ${customers.length === 1 ? 'customer' : 'customers'}`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'flight', 'hotel'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                'inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-4 text-xs font-medium capitalize transition-colors',
                tab === t
                  ? 'bg-brand-teal-600 text-white shadow-sm'
                  : 'border border-border bg-card text-muted-foreground hover:bg-muted',
              )}
            >
              {t === 'flight' ? <Plane className="h-3.5 w-3.5" /> : t === 'hotel' ? <Hotel className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 w-64 pl-9" />
          </div>
          <DataTableViewOptions table={table} />
        </div>
      </div>

      <DashboardCard title="Customers" period={filtered.length ? `${filtered.length} ${filtered.length === 1 ? 'customer' : 'customers'}` : undefined} size="lg" className="admin-table-card" contentClassName="gap-y-0">
        <div className={cn('admin-table-viewport transition-opacity duration-200', isFetching && !isPending && 'opacity-60')}>
          <Table>
            <TableHeader>{table.getHeaderGroups().map((hg) => <TableRow key={hg.id}>{hg.headers.map((h) => <TableCell isHeader key={h.id}>{h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}</TableCell>)}</TableRow>)}</TableHeader>
            <TableBody>
              {isPending ? <AdminTableSkeleton rows={8} columns={6} shortColumns={[4]} />
                : table.getRowModel().rows.length === 0 ? <TableRow><TableCell colSpan={6} className="h-64 text-center"><div className="flex flex-col items-center gap-3"><Users className="h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-muted-foreground">No customers found</p></div></TableCell></TableRow>
                : table.getRowModel().rows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => openDetail(row.original)}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}
            </TableBody>
          </Table>
        </div>
        {!isPending && table.getPageCount() > 1 && <div className="border-t border-border px-6 py-3"><DataTablePagination table={table} /></div>}
      </DashboardCard>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedCustomer(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-foreground">{selectedCustomer.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedCustomer.bookingCount} {selectedCustomer.bookingCount === 1 ? 'booking' : 'bookings'} · {formatCurrencyWithCode(selectedCustomer.totalSpent, selectedCurrency.code, decimalsMap)} total
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} aria-label="Close details" className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-muted p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{selectedCustomer.bookingCount}</p>
                <p className="text-[10px] text-muted-foreground">Bookings</p>
              </div>
              <div className="rounded-lg bg-muted p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{formatCurrencyWithCode(selectedCustomer.totalSpent, selectedCurrency.code, decimalsMap)}</p>
                <p className="text-[10px] text-muted-foreground">Total Spent</p>
              </div>
              <div className="rounded-lg bg-muted p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{formatCurrencyWithCode(selectedCustomer.totalSpent / Math.max(selectedCustomer.bookingCount, 1), selectedCurrency.code, decimalsMap)}</p>
                <p className="text-[10px] text-muted-foreground">Avg/Booking</p>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-foreground">Booking History</h4>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {[...selectedCustomer.bookings]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">
                          {booking.from && booking.to ? `${booking.from} → ${booking.to}` : booking.type}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(booking.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-medium text-foreground">
                          {booking.amount != null ? formatCurrencyWithCode(booking.amount, booking.currency ?? 'USD', decimalsMap) : '—'}
                        </p>
                        <StatusBadge status={booking.status} />
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="min-h-[44px] flex-1 cursor-pointer rounded-xl border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
