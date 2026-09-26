"use client";

// Reference-2 eCommerce "Invoices" data-table port → our "Bookings" table.
// Full TanStack table with sorting, filtering, column visibility, row
// selection, pagination and row actions (View / Cancel). Feeds from the real
// /admin/bookings endpoint.

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/useToast";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useCurrencyData } from "@/context/CurrencyContext";
import { usePermissions } from "@/components/admin/permission/usePermissions";
import { PermissionCode } from "@/lib/permissions";
import { apiRequest } from "@/lib/api/client";

import { DataTablePagination } from "@/components/ui/data-table/data-table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookingTableToolbar } from "./booking-table-toolbar";
import dynamic from "next/dynamic";
import {
  bookingsTableColumns,
  type BookingRow,
} from "./bookings-table-columns";

const CancelBookingModal = dynamic(
  () => import("../../bookings/cancel-booking-modal").then((m) => m.CancelBookingModal),
  { ssr: false },
);
const BookingDetailModal = dynamic(
  () => import("../../bookings/booking-detail-modal").then((m) => m.BookingDetailModal),
  { ssr: false },
);
const FlightBookingDetailModal = dynamic(
  () => import("../../bookings/flight-booking-detail-modal").then((m) => m.FlightBookingDetailModal),
  { ssr: false },
);

interface BookingsResponse {
  bookings: BookingRow[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

interface BookingsTableProps {
  /** How many rows to fetch per page from the API (client-side table paginates within this). */
  limit?: number;
}

const EMPTY_BOOKINGS: BookingRow[] = [];

export function BookingsTable({ limit = 10 }: BookingsTableProps) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const { decimalsMap } = useCurrencyData();
  const { hasPermission } = usePermissions();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [detailTarget, setDetailTarget] = useState<BookingRow | null>(null);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: limit });

  const canCancel =
    hasPermission(PermissionCode.BOOKINGS_CANCEL) ||
    hasPermission(PermissionCode.BOOKINGS_WRITE);

  const { data, isLoading } = useApiQuery<BookingsResponse>(
    ["admin", "bookings", "all", pagination.pageIndex + 1, pagination.pageSize],
    `/admin/bookings?type=all&page=${pagination.pageIndex + 1}&limit=${pagination.pageSize}`,
    {
      requestOptions: { auth: true },
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const cancelBooking = useCallback((booking: BookingRow) => {
    setCancelTarget(booking);
  }, []);

  const openDetail = useCallback((booking: BookingRow) => {
    setDetailTarget(booking);
  }, []);

  const syncSupplier = useCallback(
    async (booking: BookingRow) => {
      try {
        const result = await apiRequest<{
          reference?: string | null;
          supplierStatus?: string | null;
          localStatus?: string;
        }>(`/admin/bookings/${booking.id}/sync-supplier`, {
          method: "POST",
          auth: true,
        });
        toasts.success(
          "Supplier synced",
          `Hotelbeds status: ${result.supplierStatus ?? "unknown"} (ref ${result.reference ?? "—"}). Local status: ${result.localStatus ?? booking.bookingStatus}.`
        );
        queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      } catch (err: any) {
        toasts.error("Sync failed", err?.message ?? "Unable to sync supplier status.");
      }
    },
    [queryClient, toasts]
  );

  const columns = useMemo(
    () =>
      bookingsTableColumns(
        canCancel
          ? { onCancel: cancelBooking, onSyncSupplier: syncSupplier, onDetail: openDetail, decimalsMap }
          : { onSyncSupplier: syncSupplier, onDetail: openDetail, decimalsMap }
      ),
    [canCancel, cancelBooking, syncSupplier, openDetail, decimalsMap]
  );

  // TanStack Table's API is intentionally dynamic (React-Compiler-incompatible).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.bookings ?? EMPTY_BOOKINGS,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
  });

  return (
    <article className="admin-table-card min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:p-6 sm:pb-4">
        <div>
          <h3 className="text-base font-semibold">Recent Bookings</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {data
              ? `${data.pagination.total.toLocaleString()} total bookings`
              : "Live bookings feed"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/bookings"
            className="inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-sm font-semibold text-primary transition hover:bg-primary/5"
          >
            View all
          </Link>
          <BookingTableToolbar table={table} />
        </div>
      </div>
      <div className="admin-table-viewport">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border">
                {headerGroup.headers.map((header) => (
                  <TableCell
                    key={header.id}
                    isHeader
                    className="py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                {columns.map((_, j) => (
                  <TableCell key={j} className="py-4">
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-border/60 transition-colors hover:bg-muted/40"
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-muted-foreground"
                >
                  No bookings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="px-4 py-3 sm:px-6">
        <DataTablePagination table={table} />
      </div>

      {cancelTarget && (
        <CancelBookingModal
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {detailTarget && detailTarget.type === "flight" && (
        <FlightBookingDetailModal
          bookingId={detailTarget.id}
          onClose={() => setDetailTarget(null)}
        />
      )}
      {detailTarget && detailTarget.type !== "flight" && (
        <BookingDetailModal
          booking={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </article>
  );
}
