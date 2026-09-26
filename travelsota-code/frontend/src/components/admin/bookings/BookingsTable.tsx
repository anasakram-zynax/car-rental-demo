"use client";

// Advanced Bookings data table (TanStack) — server-side search/status/payment
// filters + pagination + sorting (createdAt/amount/status), client-side
// column-visibility/row-selection.
// Fixed table layout + explicit column widths + truncation => no horizontal
// scroll on desktop. Premium cells live in bookings-columns.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { ListFilter, RefreshCw } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";

import { useApiQuery } from "@/hooks/useApiQuery";
import { usePersistentTableState } from "@/hooks/usePersistentTableState";
import { useToast } from "@/hooks/useToast";
import { usePermissions } from "@/components/admin/permission/usePermissions";
import { PermissionCode } from "@/lib/permissions";
import { cn } from "@/lib/cn";

import Pagination from "@/components/common/Pagination";
import { AdminTableSkeleton } from "@/components/admin/tables/AdminTableSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookingsToolbar, type BookingsFilters } from "./bookings-toolbar";
import { bookingsColumns, type BookingRow } from "./bookings-columns";
import { DeleteConfirm } from "@/components/admin/shared/DeleteConfirm";
import { deleteBookings } from "@/features/admin/api/admin-deletes";

interface BookingsResponse {
  bookings: BookingRow[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

interface BookingsTableProps {
  type: "all" | "flights" | "hotels";
}

export default function BookingsTable({ type }: BookingsTableProps) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { hasPermission } = usePermissions();

  // Server-side state
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<BookingsFilters>({ search: "", status: "", paymentStatus: "" });
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Persisted table preferences (column visibility + page size).
  const {
    columnVisibility,
    setColumnVisibility,
    pageSize: limit,
    setPageSize: setLimit,
  } = usePersistentTableState("admin-bookings", 20);

  // Table (client-side) state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState({});

  // Modal state (detail + cancel now live in the booking workspace page)
  const [deleteTargets, setDeleteTargets] = useState<BookingRow[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  // ponytail: changeTarget retained for future re-enable of Edit/Change flow
  // const [changeTarget, setChangeTarget] = useState<BookingRow | null>(null);

  // Debounce search input → server query
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Reset page and selection on sub-tab switch without destroying/re-mounting DOM tree
  useEffect(() => {
    setPage(1);
    setRowSelection({});
  }, [type]);

  const sort = sorting[0];
  const sortBy =
    sort?.id === 'amount' ? 'amount'
    : sort?.id === 'bookingStatus' ? 'status'
    : sort?.id === 'createdAt' ? 'createdAt'
    : undefined;

  const params = new URLSearchParams();
  params.set("type", type);
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (filters.status) params.set("status", filters.status);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (sortBy) params.set("sortBy", sortBy);
  if (sort) params.set("sortDir", sort.desc ? "desc" : "asc");

  const { data, isPending, isFetching } = useApiQuery<BookingsResponse>(
    ["admin", "bookings", type, page, limit, debouncedSearch, filters.status, filters.paymentStatus, sort?.id ?? null, sort?.desc ?? null],
    `/admin/bookings?${params.toString()}`,
    {
      requestOptions: { auth: true },
      // Keep the previous page on screen while the next one loads — removes the
      // full-table skeleton flash and makes page/size changes feel instant.
      placeholderData: keepPreviousData,
      // Bookings change constantly (new sales, cancellations, supplier syncs).
      // Refetch on tab focus + reconnect so an SPA session never shows stale
      // revenue; the Refresh button force-invalidates regardless of staleness.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  );

  // ponytail: canWrite retained for future Edit/Change re-enable
  // const canWrite = hasPermission(PermissionCode.BOOKINGS_WRITE);
  const canCancel = hasPermission(PermissionCode.BOOKINGS_CANCEL);

  // Row keeps two icons: detail navigates to the booking workspace
  // (all ops live there), delete removes the record.
  const onView = useCallback(
    (b: BookingRow) => router.push(`/admin/bookings/${b.id}/manage?type=${b.type}`),
    [router],
  );
  // ponytail: onEdit retained for future re-enable
  // const onEdit = useCallback((b: BookingRow) => setChangeTarget(b), []);
  const onDelete = useCallback((b: BookingRow) => setDeleteTargets([b]), []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTargets?.length) return;
    setDeleting(true);
    try {
      const scope = type === "flights" ? "flight" : type === "hotels" ? "hotel" : "all";
      const deleted = await deleteBookings(deleteTargets.map((b) => b.id), scope);
      toasts.success(
        deleted === 1 ? "Booking deleted" : "Bookings deleted",
        `${deleted} ${deleted === 1 ? "booking" : "bookings"} permanently removed.`,
      );
      setDeleteTargets(null);
      setRowSelection({});
      queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
    } catch (err: any) {
      toasts.error("Delete failed", err?.message ?? "Unable to delete bookings.");
    } finally {
      setDeleting(false);
    }
  }, [deleteTargets, type, toasts, queryClient]);

  const actions = useMemo(
    () => ({
      onView,
      // ponytail: onEdit hidden until change flow ships
      onDelete: canCancel ? onDelete : undefined,
    }),
    [onView, onDelete, canCancel],
  );

  const columns = useMemo(() => bookingsColumns({ actions }), [actions]);

  // TanStack Table's API is intentionally dynamic (React-Compiler-incompatible).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.bookings ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(1);
    },
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnVisibility, rowSelection },
  });

  const pagination = data?.pagination ?? null;
  const empty = !isPending && !(data?.bookings?.length);
  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="admin-table-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListFilter className="size-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {type === "all" ? "All Bookings" : type === "flights" ? "Flight Bookings" : "Hotel Bookings"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isPending ? "Loading…" : `${(pagination?.total ?? 0).toLocaleString()} total`}
              {selectedCount > 0 && <span className="ml-1 text-primary">· {selectedCount} selected</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] })}
            disabled={isFetching}
            aria-label="Refresh bookings"
            title="Refresh"
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
          </button>
          {selectedCount > 0 && canCancel && (
            <button
              type="button"
              onClick={() => {
                const selected = table.getRowModel().rows.filter((r) => r.getIsSelected()).map((r) => r.original);
                if (selected.length) setDeleteTargets(selected);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-error-500 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-error-600 active:scale-[0.97]"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete ({selectedCount})
            </button>
          )}
          <BookingsToolbar table={table} filters={filters} onFiltersChange={setFilters} />
        </div>
      </div>

      {/* Table */}
      {/* Single TooltipProvider for the whole table — cell renderers (CellTip,
          row actions) rely on it. Per-cell providers (~120/page, ~600 at 100
          rows/page) made rendering a huge main-thread task. */}
      <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      {/* Horizontal scroll viewport (not overflow-hidden): the fixed column
          widths sum to ~1180px, so phones must scroll INSIDE the card to reach
          the payment/amount/actions columns — clipping them made them
          unreachable on mobile. The shared admin-table-viewport class also
          brings momentum scrolling + 40px touch targets. */}
      <div className={cn("admin-table-viewport transition-opacity duration-200", isFetching && !isPending && "opacity-60")}>
        <Table className="w-full table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="py-3 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isPending ? (
              <AdminTableSkeleton rows={6} columns={columns.length} shortColumns={[0, 1, 3]} />
            ) : empty ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-64 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
                      <ListFilter className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No bookings found</p>
                      <p className="text-xs text-muted-foreground">
                        Try adjusting your search or filters.
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
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
      </TooltipProvider>

      {/* Pagination */}
      {pagination && pagination.total > 0 && (
        <div className="border-t border-border px-4 py-4 sm:px-6">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={limit}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setLimit(size);
              setPage(1);
            }}
          />
        </div>
      )}

      {/* Modals (detail + cancel moved to the booking workspace page) */}
      {deleteTargets && (
        <DeleteConfirm
          open
          count={deleteTargets.length}
          noun="booking"
          loading={deleting}
          onCancel={() => setDeleteTargets(null)}
          onConfirm={confirmDelete}
        />
      )}
      {/* ponytail: ChangeBookingModal render retained for future re-enable
      {changeTarget && (
        <ChangeBookingModal booking={changeTarget} onClose={() => setChangeTarget(null)} />
      )}
      */}
    </div>
  );
}
