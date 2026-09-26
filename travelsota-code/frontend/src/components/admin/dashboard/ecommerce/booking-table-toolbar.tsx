"use client";

// Bookings table toolbar (Reference-2 InvoiceTableToolbar port) — text search
// + column visibility toggle.

import type { Table } from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { BookingTableViewOptions } from "./booking-table-view-options";

interface BookingTableToolbarProps<TTable> {
  table: Table<TTable>;
}

export function BookingTableToolbar<TTable>({
  table,
}: BookingTableToolbarProps<TTable>) {
  return (
    <div className="flex w-full gap-2 sm:w-auto sm:gap-x-1.5">
      <BookingTableViewOptions table={table} />
      <Input
        placeholder="Search by booking ref..."
        className="min-w-0 flex-1 border border-input bg-background hover:bg-accent hover:text-accent-foreground sm:w-52 sm:flex-none"
        value={(table.getColumn("pnr")?.getFilterValue() as string) ?? ""}
        onChange={(event) =>
          table.getColumn("pnr")?.setFilterValue(event.target.value)
        }
      />
    </div>
  );
}
