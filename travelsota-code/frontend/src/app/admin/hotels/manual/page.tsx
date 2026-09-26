'use client';

// Manual Hotels — admin CRUD list. Redesigned to the Bookings-table standard:
// toolbar (search + count), scrollable viewport table, premium empty state,
// confirm-modal deletes, and instant cache refresh after every mutation.

import { Suspense, useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Hotel, Search, X, Star } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { AdminPageHeader } from '@/components/admin/shared/AdminPageHeader';
import { DataTablePagination } from '@/components/ui/data-table/data-table-pagination';
import { listManualHotels, deleteManualHotel, type ManualHotel } from '@/features/admin/api/admin-manual-hotels';
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

const CreateHotelModal = dynamic(
  () => import('@/features/admin/components/create-hotel-modal').then((m) => m.CreateHotelModal),
  { ssr: false }
);

const DeleteConfirm = dynamic(
  () => import('@/components/admin/shared/DeleteConfirm').then((m) => m.DeleteConfirm),
  { ssr: false }
);

const EMPTY_HOTELS: ManualHotel[] = [];

const PAGE_SIZE = 20;

function formatPrice(hotel: ManualHotel) {
  const minRoom = hotel.rooms?.length
    ? hotel.rooms.reduce((min, r) => (r.basePrice < min.basePrice ? r : min), hotel.rooms[0])
    : undefined;
  if (!minRoom) return '—';
  return `${minRoom.currency} ${minRoom.basePrice.toLocaleString()}`;
}

function ManualHotelsPageInner() {
  const router = useRouter();
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManualHotel | null>(null);

  // Debounce search → server query.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data: result, isPending, isFetching } = useQuery({
    queryKey: ['manual-hotels', page, debouncedSearch],
    queryFn: () => listManualHotels(page, PAGE_SIZE, debouncedSearch),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteManualHotel,
    onSuccess: () => {
      toasts.success('Hotel deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['manual-hotels'] });
    },
    onError: (err) => toasts.error((err as { message?: string })?.message ?? 'Failed to delete hotel'),
  });

  const hotels = result?.items ?? EMPTY_HOTELS;
  const total = result?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const columns = useMemo((): ColumnDef<ManualHotel>[] => [
    {
      id: 'name',
      header: 'Hotel',
      accessorKey: 'name',
      enableSorting: true,
      cell: ({ row }) => (
        <div className="min-w-0">
          <button
            onClick={() => router.push(`/admin/hotels/manual/${row.original.id}`)}
            className="max-w-[240px] truncate text-left text-sm font-semibold transition-colors hover:text-primary"
            title={row.original.name}
          >
            {row.original.name}
          </button>
          <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted-foreground">{row.original.location}</p>
        </div>
      ),
    },
    {
      id: 'stars',
      header: 'Stars',
      accessorKey: 'stars',
      cell: ({ row }) =>
        row.original.stars ? (
          <span className="inline-flex items-center gap-1 text-sm tabular-nums text-muted-foreground">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {row.original.stars}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        ),
    },
    {
      id: 'rooms',
      header: 'Rooms',
      cell: ({ row }) => <span className="text-sm tabular-nums">{row.original._count?.rooms ?? row.original.rooms?.length ?? 0}</span>,
    },
    {
      id: 'price',
      header: 'From',
      cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">{formatPrice(row.original)}</span>,
    },
    {
      id: 'featured',
      header: 'Featured',
      cell: ({ row }) => (
        <Badge variant={row.original.featured ? 'success' : 'secondary'} className="text-xs">
          {row.original.featured ? 'Yes' : 'No'}
        </Badge>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'success' : 'warning'} className="text-xs">
          {row.original.status}
        </Badge>
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
            onClick={() => router.push(`/admin/hotels/manual/${row.original.id}`)}
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
    data: hotels,
    columns,
    state: { sorting, pagination: { pageIndex: page - 1, pageSize: PAGE_SIZE } },
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex: page - 1, pageSize: PAGE_SIZE })
        : updater;
      setPage(next.pageIndex + 1);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Manual Hotels"
        description="Create and manage your own hotel listings."
        breadcrumbs={[{ label: 'Hotels' }, { label: 'Manual' }]}
        actions={
          <Button onClick={() => setShowCreateModal(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Create Hotel
          </Button>
        }
      />

      <div className="rounded-xl border border-border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Hotel className="size-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-foreground">All Hotels</h3>
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
              placeholder="Search by name or location…"
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
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={j} className="py-3">
                        <div className="h-4 animate-pulse rounded bg-muted" style={{ maxWidth: j === 0 ? 220 : j === 1 ? 60 : j === 2 ? 40 : j === 3 ? 80 : j === 4 ? 44 : j === 5 ? 56 : 64 }} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : hotels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                        <Hotel className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {debouncedSearch ? 'No hotels match your search' : 'No hotels yet'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {debouncedSearch ? 'Try a different name or location.' : 'Create your first listing to publish it on the storefront.'}
                        </p>
                      </div>
                      {!debouncedSearch && (
                        <Button variant="outline" size="sm" onClick={() => setShowCreateModal(true)}>
                          <Plus className="mr-1.5 h-4 w-4" />
                          Create your first hotel
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
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

      {showCreateModal && (
        <CreateHotelModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setPage(1);
            queryClient.invalidateQueries({ queryKey: ['manual-hotels'] });
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          open={!!deleteTarget}
          count={1}
          noun={`hotel ("${deleteTarget?.name ?? ''}")`}
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        />
      )}
    </div>
  );
}

export default function ManualHotelsPage() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" />}>
      <ManualHotelsPageInner />
    </Suspense>
  );
}
