"use client";

// Column visibility toggle (Reference-2 InvoiceTableViewOptions port).

import { Eye } from "lucide-react";

import type { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookingTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function BookingTableViewOptions<TData>({
  table,
}: BookingTableViewOptionsProps<TData>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="shrink-0 text-muted-foreground"
          aria-label="Toggle column visibility"
        >
          <Eye className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
            >
              {column.id === "createdAt"
                ? "Created"
                : column.id === "bookingStatus"
                  ? "Status"
                  : column.id === "pnr"
                    ? "Booking Ref"
                    : column.id === "paymentStatus"
                      ? "Payment"
                      : column.id === "type" || column.id === "module"
                        ? "Module"
                        : column.id === "supplier"
                          ? "Supplier"
                          : column.id.replace("_", " ")}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
