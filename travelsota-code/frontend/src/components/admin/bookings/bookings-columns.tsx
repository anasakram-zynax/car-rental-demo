"use client";

// Premium column definitions + cell renderers for the admin Bookings data table.
// Compact cells + Radix tooltip hover cards decode full details on hover.

import type { ColumnDef } from "@tanstack/react-table";

import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTableColumnHeader } from "@/components/ui/data-table/data-table-column-header";
import AvatarText from "@/components/ui/avatar/AvatarText";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AdminBookingStatusBadge,
  AdminPaymentStatusBadge,
} from "@/components/admin/shared/admin-badges";
import { CopyButton } from "@/components/admin/shared/CopyButton";
import { shortInvoiceNumber } from "@/lib/utils/invoice";
import { FlightRowActions, type BookingsRowActionsProps } from "./bookings-row-actions";

export interface BookingRow {
  id: string;
  publicRef?: string | null;
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
  invoiceNumber: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  markupAmount?: number | null;
  commissionAmount?: number | null;
  user: { id: string | null; firstName: string | null; lastName: string | null; email: string | null } | null;
  isGuest?: boolean;
  createdAt: string;
}

/** Deterministic placeholder shown only when a booking has no live invoice yet. */
function sampleInvoiceNumber(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash = hash & hash;
  }
  const seq = String((Math.abs(hash) % 900000) + 100000);
  return `TVL-INV-${new Date().getFullYear()}-${seq}`;
}

// ─── Shared bits ───────────────────────────────────────────

/** Hover card wrapper — portal-based, immune to table overflow clipping.
 *  NOTE: no TooltipProvider here on purpose — a table page mounts ~120 of
 *  these cells (6 tippable columns × 20 rows; ~600 at 100 rows/page), and a
 *  per-cell provider made each render a massive main-thread task (the
 *  "page unresponsive" freeze on page-size change). The provider lives once
 *  at the table level (BookingsTable) with the same 150ms delay. */
function CellTip({
  children,
  content,
  className,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={className}>{children}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 p-0" side="top">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function TipRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <span className="text-xs font-medium text-zinc-100">{value}</span>
    </div>
  );
}

function formatBookingAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTimeFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ─── Cell renderers ────────────────────────────────────────

function ModuleCell({ booking }: { booking: BookingRow }) {
  const isFlight = booking.type === "flight";
  const provider = booking.provider || (isFlight ? "travelport" : "hotelbeds");
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-black/5 transition-transform duration-200 [tr:hover_&]:scale-105 dark:ring-white/10 ${
          isFlight
            ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
            : "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400"
        }`}
      >
        {isFlight ? (
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
          </svg>
        ) : (
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="17" x="2" y="3" rx="2" />
            <path d="M8 21h8" /><path d="M12 17v4" /><path d="M2 7h20" />
            <path d="M6 11h2" /><path d="M10 11h2" /><path d="M6 15h2" /><path d="M10 15h2" />
          </svg>
        )}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold capitalize text-foreground">
          {isFlight ? "Flights" : "Hotels"}
        </p>
        <p className="truncate text-xs capitalize text-muted-foreground">
          {provider}
        </p>
      </div>
    </div>
  );
}

function InvoiceCell({ booking }: { booking: BookingRow }) {
  const created = booking.createdAt;

  if (booking.invoiceNumber && booking.invoiceId) {
    return (
      <Link
        href={`/admin/invoices/${booking.invoiceId}`}
        className="group inline-flex max-w-full items-center gap-1.5"
        aria-label={`Invoice ${booking.invoiceNumber}`}
      >
        <CellTip
          content={
            <div className="border-b border-white/10 px-3 py-2 font-mono text-[11px] font-semibold text-zinc-100">
              {booking.invoiceNumber}
              <div className="mt-1 border-t border-white/10 pt-1.5">
                <TipRow label="Booked" value={formatDateTimeFull(created)} />
                {booking.invoiceStatus && (
                  <TipRow label="Status" value={<span className="capitalize">{booking.invoiceStatus}</span>} />
                )}
                <div className="pt-1 text-[10px] text-zinc-500">Click to open invoice</div>
              </div>
            </div>
          }
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
            <span className="font-mono text-xs font-medium tabular-nums text-foreground underline-offset-2 group-hover:underline">
              #{shortInvoiceNumber(booking.invoiceNumber)}
            </span>
            <CopyButton value={booking.invoiceNumber} label="Copy invoice number" />
          </span>
        </CellTip>
      </Link>
    );
  }

  const sample = sampleInvoiceNumber(booking.id);
  return (
    <CellTip
      content={
        <div className="px-3 py-2">
          <p className="font-mono text-[11px] font-semibold text-zinc-100">{sample}</p>
          <p className="mt-1 text-[11px] text-zinc-400">No live invoice yet — provisional number</p>
          <TipRow label="Booked" value={formatDateTimeFull(created)} />
        </div>
      }
    >
      <span className="inline-flex items-center gap-1.5 opacity-70 transition-opacity duration-200 hover:opacity-100">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
        <span className="font-mono text-xs tabular-nums text-muted-foreground/60">
          #{shortInvoiceNumber(sample)}
        </span>
      </span>
    </CellTip>
  );
}

// Belt-and-suspenders: the backend already strips email-shaped values out of
// `pnr` (see admin-bookings.service.ts), but the reference column must never
// show one — if a future write path slips one through, hide it here too
// rather than display it.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmailLike(value?: string | null): boolean {
  return !!value && EMAIL_PATTERN.test(value.trim());
}

function ReferenceCell({ booking }: { booking: BookingRow }) {
  // Only a real or fake PNR is ever shown as "the reference" — never the
  // internal publicRef or a truncated booking id as a stand-in, and never an
  // email address. Nothing available → blank placeholder.
  const pnr = booking.pnr && !isEmailLike(booking.pnr) ? booking.pnr : null;
  if (!pnr) {
    return <span className="px-1.5 text-xs text-muted-foreground">—</span>;
  }
  const ref = pnr;
  const full = pnr;
  return (
    <CellTip
      content={
        <div className="px-3 py-2">
          <p className="font-mono text-[11px] font-semibold break-all text-zinc-100">{full}</p>
          <div className="mt-1 border-t border-white/10 pt-1">
            <TipRow label="Module" value={<span className="capitalize">{booking.type}</span>} />
            <TipRow label="Supplier" value={<span className="capitalize">{booking.provider || "—"}</span>} />
            {booking.publicRef && <TipRow label="Internal ref" value={booking.publicRef} />}
          </div>
        </div>
      }
      className="min-w-0 max-w-[130px]"
    >
      <span className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium text-foreground ring-1 ring-transparent transition-all duration-200 hover:ring-brand-teal/30 [tr:hover_&]:text-foreground">
        <span className="shrink-0 text-muted-foreground/60">#</span>
        <span className="truncate">{ref}</span>
        <CopyButton value={full} label="Copy booking reference" />
      </span>
    </CellTip>
  );
}

function UserCell({ user, isGuest }: { user: BookingRow["user"]; isGuest?: boolean }) {
  if (!user) return <span className="text-sm text-muted-foreground">—</span>;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "Guest";
  // Short display: first name only — full identity decodes in the hover card.
  const shortName = (user.firstName || user.email?.split("@")[0] || "Guest").slice(0, 12);

  return (
    <CellTip
      content={
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-zinc-100">{fullName}</p>
          {user.email && <p className="mt-0.5 break-all text-[11px] text-zinc-400">{user.email}</p>}
          {isGuest && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-400">Guest checkout</p>}
        </div>
      }
      className="min-w-0 max-w-[140px]"
    >
      <div className="flex items-center gap-2">
        <AvatarText name={fullName} className="!h-7 !w-7 shrink-0 !text-[10px] ring-1 ring-black/5 transition-transform duration-200 [tr:hover_&]:scale-110 dark:ring-white/10" />
        <span className="truncate text-sm font-medium text-foreground">{shortName}</span>
        {isGuest && (
          <span className="shrink-0 rounded bg-amber-50 border border-amber-200 px-1 py-0.5 text-[9px] font-semibold text-amber-700 leading-none">
            G
          </span>
        )}
      </div>
    </CellTip>
  );
}

// ─── Columns ───────────────────────────────────────────────

export interface BookingsColumnsOptions {
  actions: BookingsRowActionsProps["actions"];
}

export function bookingsColumns({ actions }: BookingsColumnsOptions): ColumnDef<BookingRow>[] {
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
          aria-label="Select all"
          className="translate-y-[1px]"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="translate-y-[1px]"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
      minSize: 40,
      maxSize: 40,
    },
    {
      id: "reference",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reference" />,
      accessorFn: (row) => (row.pnr && !isEmailLike(row.pnr) ? row.pnr : ""),
      filterFn: (row, columnId, filterValue: string) => {
        const cellValue = String(row.getValue(columnId) ?? "").toLowerCase();
        const search = filterValue.trim().toLowerCase().replace(/^#+/, "");
        return cellValue.includes(search);
      },
      cell: ({ row }) => <ReferenceCell booking={row.original} />,
      enableSorting: false,
      size: 140,
      minSize: 120,
      maxSize: 160,
    },
    {
      id: "module",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Module" />,
      accessorFn: (row) => (row.type === "flight" ? "Flights" : "Hotels"),
      cell: ({ row }) => <ModuleCell booking={row.original} />,
      enableSorting: false,
      enableHiding: true,
      size: 150,
      minSize: 130,
      maxSize: 180,
    },
    {
      id: "invoice",
      header: "Invoice",
      accessorFn: (row) => row.invoiceNumber ?? sampleInvoiceNumber(row.id),
      cell: ({ row }) => <InvoiceCell booking={row.original} />,
      enableSorting: false,
      size: 110,
      minSize: 90,
      maxSize: 130,
    },
    {
      id: "bookingStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      accessorKey: "bookingStatus",
      cell: ({ row }) => (
        <div className="min-w-0">
          <AdminBookingStatusBadge status={row.getValue("bookingStatus")} />
        </div>
      ),
      size: 150,
      minSize: 130,
      maxSize: 170,
    },
    {
      id: "paymentStatus",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment" />,
      accessorKey: "paymentStatus",
      cell: ({ row }) => {
        const status = row.getValue("paymentStatus") as string | null;
        return status ? (
          <div className="min-w-0">
            <AdminPaymentStatusBadge status={status} />
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        );
      },
      enableSorting: false,
      size: 120,
      minSize: 100,
      maxSize: 150,
    },
    {
      id: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Price" />,
      accessorFn: (row) => row.amount ?? 0,
      sortingFn: "basic",
      cell: ({ row }) => {
        const b = row.original;
        if (b.amount == null) return <span className="text-sm text-muted-foreground">—</span>;
        // Defensive guard: a corrupt/legacy markup ≥ the customer total is not
        // a plausible earning — hide it instead of showing e.g. "+$775K earned".
        const amountNum = Number(b.amount);
        const markupNum = Number(b.markupAmount);
        const hasEarnings =
          b.markupAmount != null &&
          b.markupAmount !== 0 &&
          Number.isFinite(amountNum) &&
          amountNum > 0 &&
          Number.isFinite(markupNum) &&
          markupNum < amountNum;
        return (
          <CellTip
            content={
              <div className="px-3 py-2">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Price details</p>
                <TipRow label="Total" value={formatBookingAmount(b.amount, b.currency)} />
                <div className="my-1 border-t border-white/10" />
                <TipRow
                  label="Admin earnings"
                  value={
                    hasEarnings ? (
                      <span className="font-semibold text-emerald-400">+{formatBookingAmount(b.markupAmount ?? 0, b.currency)}</span>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )
                  }
                />
                {b.commissionAmount != null && b.commissionAmount !== 0 && (
                  <TipRow label="Commission" value={formatBookingAmount(b.commissionAmount, b.currency)} />
                )}
              </div>
            }
            className="w-fit"
          >
            <div className="cursor-default leading-tight transition-transform duration-200 hover:translate-x-0.5">
              <p className="whitespace-nowrap font-semibold tabular-nums text-foreground">
                {formatBookingAmount(b.amount, b.currency)}
              </p>
              {hasEarnings ? (
                <p className="whitespace-nowrap text-[10px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatBookingAmount(b.markupAmount ?? 0, b.currency)} earned
                </p>
              ) : (
                <p className="text-[10px] tabular-nums text-muted-foreground/50">no earnings</p>
              )}
            </div>
          </CellTip>
        );
      },
      size: 150,
      minSize: 130,
      maxSize: 180,
    },
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      accessorFn: (row) =>
        [row.user?.firstName, row.user?.lastName].filter(Boolean).join(" ") || row.user?.email || "",
      cell: ({ row }) => <UserCell user={row.original.user} isGuest={row.original.isGuest} />,
      enableSorting: false,
      size: 160,
      minSize: 130,
      maxSize: 180,
    },
    {
      id: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      accessorKey: "createdAt",
      cell: ({ row }) => {
        const iso = row.getValue("createdAt") as string;
        return (
          <CellTip content={<div className="px-2.5 py-1.5">{formatDateTimeFull(iso)}</div>}>
            <div className="whitespace-nowrap leading-tight">
              <p className="text-xs font-medium tabular-nums text-foreground">{formatDateShort(iso)}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">{formatTime(iso)}</p>
            </div>
          </CellTip>
        );
      },
      size: 110,
      minSize: 90,
      maxSize: 130,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      // Inline view + delete icons for every row (detail lives in the
      // workspace tab; delete removes the record).
      cell: ({ row }) => <FlightRowActions booking={row.original} actions={actions} />,
      enableSorting: false,
      enableHiding: false,
      size: 96,
      minSize: 76,
      maxSize: 110,
    },
  ];
}
