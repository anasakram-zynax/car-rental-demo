"use client";

// Bookings data-table columns (Reference-2 invoices-table port) — premium
// theme-aware badges for module / booking status / payment status.

import type { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import { formatDate } from "@/lib/format";
import {
  AdminBookingStatusBadge,
  AdminPaymentStatusBadge,
  AdminModuleBadge,
  AdminSupplierStatusBadge,
} from "@/components/admin/shared/admin-badges";
import { BookingTableRowActions } from "./booking-table-row-actions";
import { formatCurrencyWithCode } from "@/lib/utils/currency";

// Belt-and-suspenders: the backend already strips email-shaped values out of
// `pnr` (see admin-bookings.service.ts), but the reference column must never
// show one — if a future write path slips one through, hide it here too.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmailLike(value?: string | null): boolean {
  return !!value && EMAIL_PATTERN.test(value.trim());
}

export interface BookingRow {
  id: string;
  type: "flight" | "hotel";
  provider: string;
  module: string;
  bookingStatus: string;
  paymentStatus: string | null;
  supplierReference?: string | null;
  supplierStatus?: string | null;
  amount: number | null;
  currency: string;
  pnr: string | null;
  user: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  createdAt: string;
}

function formatBookingAmount(
  amount: number,
  currency: string,
  decimalsMap?: Record<string, number>,
) {
  // Per-row booking currency (ops truth) with the currency's real decimals —
  // previously Intl `$`-style with hardcoded 2 decimals.
  return formatCurrencyWithCode(amount, currency || "USD", decimalsMap);
}

export interface BookingTableColumnsOptions {
  onCancel?: (booking: BookingRow) => void;
  onSyncSupplier?: (booking: BookingRow) => void;
  onDetail?: (booking: BookingRow) => void;
  decimalsMap?: Record<string, number>;
}

export function bookingsTableColumns(
  options?: BookingTableColumnsOptions
): ColumnDef<BookingRow>[] {
  const decimalsMap = options?.decimalsMap;
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          className="ms-1 sm:ms-4"
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          className="ms-4"
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "pnr",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Booking Ref" />
      ),
      filterFn: (row, columnId, filterValue: string) => {
        const cellValue = String(row.getValue(columnId) ?? "").toLowerCase();
        const search = filterValue.trim().toLowerCase().replace(/^#+/, "");
        return cellValue.includes(search);
      },
      cell: ({ row }) => {
        const raw = row.getValue("pnr") as string | null;
        const pnr = raw && !isEmailLike(raw) ? raw : null;
        return (
          <span className="font-mono text-xs font-medium text-foreground">
            {pnr ? `#${pnr}` : <span className="text-muted-foreground">—</span>}
          </span>
        );
      },
    },
    {
      accessorKey: "type",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Module" />
      ),
      cell: ({ row }) => <AdminModuleBadge type={row.getValue("type")} />,
      enableHiding: true,
    },
    {
      accessorKey: "bookingStatus",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => (
        <AdminBookingStatusBadge status={row.getValue("bookingStatus")} />
      ),
    },
    {
      accessorKey: "supplierStatus",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Supplier" />
      ),
      cell: ({ row }) => {
        if (row.original.type !== "hotel") {
          return <span className="text-muted-foreground">—</span>;
        }
        const status = row.getValue("supplierStatus") as string | null;
        const ref = row.original.supplierReference;
        return (
          <span title={ref ?? undefined}>
            <AdminSupplierStatusBadge status={status} />
          </span>
        );
      },
    },
    {
      accessorKey: "paymentStatus",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Payment" />
      ),
      cell: ({ row }) => {
        const status = row.getValue("paymentStatus") as string | null;
        return status ? <AdminPaymentStatusBadge status={status} /> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Price" />
      ),
      cell: ({ row }) => {
        const amount = row.getValue("amount") as number | null;
        return (
          <span className="font-medium tabular-nums text-foreground">
            {amount != null ? formatBookingAmount(amount, row.original.currency, decimalsMap) : "—"}
          </span>
        );
      },
    },
    {
      accessorFn: (row) =>
        [row.user?.firstName, row.user?.lastName].filter(Boolean).join(" ") ||
        row.user?.email ||
        "",
      id: "customer",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
      cell: ({ row }) => {
        const user = row.original.user;
        const name = user
          ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
          : "—";
        return (
          <span className="inline-block max-w-28 truncate text-muted-foreground" title={name}>
            {name}
          </span>
        );
      },
      size: 140,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground text-xs">
          {formatDate(row.getValue("createdAt"))}
        </span>
      ),
      size: 100,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => (
        <BookingTableRowActions
          row={row}
          onCancel={options?.onCancel}
          onSyncSupplier={options?.onSyncSupplier}
          onDetail={options?.onDetail}
        />
      ),
    },
  ];
}
