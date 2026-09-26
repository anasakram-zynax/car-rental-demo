'use client';

// Manual Flights — admin CRUD list. Same premium standard as Manual Hotels:
// toolbar (search + count), responsive stats, scrollable viewport table,
// confirm-modal deletes, and instant cache refresh after every mutation.

import { Suspense, useState, useMemo, useEffect, memo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Plane, Search, X, Users, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { listManualFlights, deleteManualFlight, type ManualFlight } from '@/features/admin/api/admin-manual-flights';
import { cn } from '@/lib/cn';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const CreateFlightModal = dynamic(
  () => import('@/features/admin/components/create-flight-modal').then((m) => m.CreateFlightModal),
  { ssr: false }
);

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => m.DeleteConfirm),
  { ssr: false }
);

const EMPTY_FLIGHTS: ManualFlight[] = [];

const PAGE_SIZE = 20;

const StatsRow = memo(function StatsRow({ flights }: { flights: ManualFlight[] }) {
  let active = 0;
  let featured = 0;
  let totalSeats = 0;
  let totalPrice = 0;
  for (const f of flights) {
    if (f.status === 'active') active++;
    if (f.featured) featured++;
    totalSeats += f.availableSeats;
    totalPrice += f.basePrice;
  }
  const avgPrice = flights.length > 0 ? totalPrice / flights.length : 0;
  const stats = [
    { label: 'Active', value: active.toString(), sub: `${flights.length} on this page`, icon: Plane, accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40' },
    { label: 'Featured', value: featured.toString(), sub: 'homepage slots', icon: DollarSign, accent: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40' },
    { label: 'Seats', value: totalSeats.toLocaleString(), sub: 'available', icon: Users, accent: 'text-sky-600 bg-sky-50 dark:bg-sky-950/40' },
    { label: 'Avg Price', value: `$${Math.round(avgPrice).toLocaleString()}`, sub: 'per flight', icon: DollarSign, accent: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4 transition-shadow hover:shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${s.accent}`}>
              <s.icon className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-2 text-lg font-bold tabular-nums tracking-tight text-foreground">{s.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</p>
        </div>
      ))}
    </div>
  );
});

function ManualFlightsPageInner() {
  const router = useRouter();
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManualFlight | null>(null);

  // Debounce search → server query.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: result, isPending, isFetching } = useQuery({
    queryKey: ['manual-flights', page, debouncedSearch],
    queryFn: () => listManualFlights(page, PAGE_SIZE, debouncedSearch),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteManualFlight,
    onSuccess: () => {
      toasts.success('Flight removed');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['manual-flights'] });
    },
    onError: (err) => toasts.error((err as { message?: string })?.message ?? 'Failed to delete flight'),
  });

  const flights = result?.items ?? EMPTY_FLIGHTS;
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns = useMemo((): ColumnDef<ManualFlight>[] => [
    {
      id: 'route',
      header: 'Route',
      accessorKey: 'originId',
      cell: ({ row }) => (
        <div className="min-w-0">
          <button
            onClick={() => router.push(`/admin/flights/manual/${row.original.id}`)}
            className="text-left text-sm font-semibold tracking-tight transition-colors hover:text-primary"
          >
            <span className="font-mono text-xs text-muted-foreground">{row.original.originId}</span>
            <span className="mx-1.5 text-[10px] text-muted-foreground/60">→</span>
            <span className="font-mono text-xs text-muted-foreground">{row.original.destinationId}</span>
          </button>
          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground">
            {row.original.airlineName || row.original.airlineId || '—'} {row.original.flightNumber ?? ''}
          </p>
        </div>
      ),
    },
    {
      id: 'datetime',
      header: 'Departure',
      cell: ({ row }) => (
        <div className="leading-tight">
          <p className="text-sm tabular-nums">
            {new Date(row.original.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
            {row.original.departureTime} – {row.original.arrivalTime}
          </p>
        </div>
      ),
    },
    {
      id: 'price',
      header: 'Price',
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums tracking-tight">
          {row.original.currency} {row.original.basePrice.toLocaleString()}
        </span>
      ),
    },
    {
      id: 'seats',
      header: 'Seats',
      cell: ({ row }) => {
        const pct = row.original.totalSeats > 0 ? (row.original.availableSeats / row.original.totalSeats) * 100 : 0;
        const color = pct < 25 ? 'bg-red-500' : pct < 50 ? 'bg-amber-500' : 'bg-emerald-500';
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-sm tabular-nums">
              {row.original.availableSeats}
              <span className="text-[10px] text-muted-foreground">/{row.original.totalSeats}</span>
            </span>
          </div>
        );
      },
    },
    {
      id: 'flags',
      header: 'Flags',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {row.original.featured && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
              Featured
            </span>
          )}
          <Badge variant={row.original.status === 'active' ? 'success' : 'warning'} className="text-[10px]">
            {row.original.status}
          </Badge>
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-primary/5 hover:text-primary"
            onClick={() => router.push(`/admin/flights/manual/${row.original.id}`)}
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [router]);

  const table = useReactTable({
    data: flights,
    columns,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    onPaginationChange: (u) => {
      const n = typeof u === 'function' ? u({ pageIndex: page - 1, pageSize: PAGE_SIZE }) : u;
      setPage(n.pageIndex + 1);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Manual Flights"
        description="Create and manage your own flight listings."
        breadcrumbs={[{ label: 'Flights' }, { label: 'Manual' }]}
        actions={
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Create Flight
          </Button>
        }
      />

      {!isPending && flights.length > 0 && <StatsRow flights={flights} />}

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Plane className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">All Flights</h3>
              <p className="text-xs text-muted-foreground">
                {isPending ? 'Loading…' : `${total.toLocaleString()} total`}
                {isFetching && !isPending && <span className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search route, airline, flight no…"
              className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className={cn("admin-table-viewport transition-opacity duration-200", isFetching && !isPending && "opacity-60")}>
          <Table className="w-full table-fixed">
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b border-border">
                  {hg.headers.map((h) => (
                    <TableCell isHeader key={h.id} className="py-3">
                      {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isPending ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i} className="border-b border-border/60">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j} className="py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 200 : j === 1 ? 110 : j === 2 ? 80 : j === 3 ? 90 : j === 4 ? 90 : 64 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : flights.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-72 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/50">
                        <Plane className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {debouncedSearch ? 'No flights match your search' : 'No manual flights yet'}
                        </p>
                        <p className="mt-0.5 max-w-xs text-center text-xs text-muted-foreground">
                          {debouncedSearch
                            ? 'Try a route code, airline or flight number.'
                            : 'Create your first flight to have it appear in customer search results and on the homepage.'}
                        </p>
                      </div>
                      {!debouncedSearch && (
                        <Button variant="outline" size="sm" className="mt-1" onClick={() => setShowCreate(true)}>
                          <Plus className="mr-1.5 h-3.5 w-3.5" /> Create your first flight
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="overflow-hidden py-3">
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
        {!isPending && total > 0 && (
          <div className="border-t border-border px-6 py-3">
            <DataTablePagination table={table} />
          </div>
        )}
      </div>

      {showCreate && (
        <CreateFlightModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setPage(1);
            queryClient.invalidateQueries({ queryKey: ['manual-flights'] });
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          open={!!deleteTarget}
          count={1}
          noun="flight"
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

export default function ManualFlightsPage() {
  return (
    <Suspense fallback={<div className="space-y-5"><div className="h-9 w-48 animate-pulse rounded-lg bg-muted/60" /><div className="h-96 animate-pulse rounded-xl bg-muted/40" /></div>}>
      <ManualFlightsPageInner />
    </Suspense>
  );
}
