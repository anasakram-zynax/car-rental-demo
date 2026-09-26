"use client";

// Bookings table toolbar — debounced search + status/payment filters +
// column visibility toggle. Search & filters are server-side (debounced).

import { Search, SlidersHorizontal, X } from "lucide-react";

import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface BookingsFilters {
  search: string;
  status: string;
  paymentStatus: string;
}

const STATUS_OPTIONS = [
  { value: "booked", label: "Confirmed" },
  { value: "held", label: "Held" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "awaiting_issue", label: "Awaiting Issue" },
  { value: "booking_in_progress", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS = [
  { value: "PAID", label: "Paid" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "AUTHORIZED", label: "Authorized" },
  { value: "FAILED", label: "Failed" },
  { value: "REFUNDED", label: "Refunded" },
];

const COLUMN_LABELS: Record<string, string> = {
  reference: "Reference",
  module: "Module",
  invoice: "Invoice",
  bookingStatus: "Status",
  paymentStatus: "Payment",
  supplier: "Supplier",
  amount: "Price",
  customer: "Customer",
  createdAt: "Created",
};

interface BookingsToolbarProps<TData> {
  table: Table<TData>;
  filters: BookingsFilters;
  onFiltersChange: (filters: BookingsFilters) => void;
}

export function BookingsToolbar<TData>({
  table,
  filters,
  onFiltersChange,
}: BookingsToolbarProps<TData>) {
  const hasActiveFilters =
    filters.status !== "" || filters.paymentStatus !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative w-full sm:w-auto sm:min-w-[200px] sm:flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search ref, PNR, email, name…"
          value={filters.search}
          onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
          className="h-9 pl-9 pr-8"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onFiltersChange({ ...filters, search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Status filter */}
      <select
        value={filters.status}
        onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
        className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/10 sm:flex-none"
      >
        <option value="">All statuses</option>
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Payment filter */}
      <select
        value={filters.paymentStatus}
        onChange={(e) => onFiltersChange({ ...filters, paymentStatus: e.target.value })}
        className="h-9 min-w-0 flex-1 cursor-pointer rounded-lg border border-input bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-accent focus:border-ring focus:ring-2 focus:ring-ring/10 sm:flex-none"
      >
        <option value="">All payments</option>
        {PAYMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFiltersChange({ ...filters, status: "", paymentStatus: "" })}
          className="h-9 text-muted-foreground"
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}

      {/* Column visibility */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground"
            aria-label="Toggle columns"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {table
            .getAllColumns()
            .filter((column) => column.getCanHide())
            .map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {COLUMN_LABELS[column.id] ?? column.id.replace("_", " ")}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
