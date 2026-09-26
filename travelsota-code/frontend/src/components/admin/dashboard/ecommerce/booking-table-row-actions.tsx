"use client";

// Bookings row actions — View detail (links to the booking page) + Cancel
// (permission-gated delete), in a compact dropdown like Reference-2.

import { EllipsisVertical, Eye, RefreshCw, CircleX } from "lucide-react";
import Link from "next/link";

import type { Row } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BookingRow } from "./bookings-table-columns";

interface BookingTableRowActionsProps<TData> {
  row: Row<TData>;
  onCancel?: (booking: BookingRow) => void;
  onSyncSupplier?: (booking: BookingRow) => void;
  onDetail?: (booking: BookingRow) => void;
}

export function BookingTableRowActions<TData>({
  row,
  onCancel,
  onSyncSupplier,
  onDetail,
}: BookingTableRowActionsProps<TData>) {
  const booking = row.original as BookingRow;
  const isCancelled = booking.bookingStatus === "cancelled";

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            aria-label="Open booking actions"
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {booking.pnr ? `#${booking.pnr}` : booking.id.slice(0, 8)}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/bookings/${booking.id}`}>
              <Eye className="me-2 h-4 w-4 text-muted-foreground/70" />
              View detail
            </Link>
          </DropdownMenuItem>
          {onDetail ? (
            <DropdownMenuItem onClick={() => onDetail(booking)}>
              <Eye className="me-2 h-4 w-4 text-muted-foreground/70" />
              Supplier details
            </DropdownMenuItem>
          ) : null}
          {booking.type === "hotel" && onSyncSupplier ? (
            <DropdownMenuItem onClick={() => onSyncSupplier(booking)}>
              <RefreshCw className="me-2 h-4 w-4 text-muted-foreground/70" />
              Sync supplier
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          {onCancel && !isCancelled ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onCancel(booking)}
            >
              <CircleX className="me-2 h-4 w-4" />
              Cancel booking
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
