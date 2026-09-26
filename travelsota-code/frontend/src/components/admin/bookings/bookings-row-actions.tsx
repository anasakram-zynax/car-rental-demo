"use client";

// Row actions for the admin Bookings data table — inline view + delete icons.
// Detail navigates to the booking workspace tab; delete removes the record.
// ponytail: Edit/Change intentionally hidden (not deleted) — change-booking-modal
// and the onEdit plumbing stay for future re-enable.

import { Eye, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BookingRow } from "./bookings-columns";

export interface BookingsRowActionsProps {
  booking: BookingRow;
  actions: {
    onView?: (booking: BookingRow) => void;
    onEdit?: (booking: BookingRow) => void;
    onCancel?: (booking: BookingRow) => void;
    onSyncSupplier?: (booking: BookingRow) => void;
    onDelete?: (booking: BookingRow) => void;
  };
}

export function FlightRowActions({ booking, actions }: BookingsRowActionsProps) {
  // Both icons render for EVERY status (cancelled/failed/ticketed included) —
  // delete is permission-gated upstream, never status-gated.
  return (
    <div className="flex items-center justify-end gap-1">
      {actions.onView && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="View booking details"
          onClick={() => actions.onView?.(booking)}
        >
          <Eye className="size-4" />
        </Button>
      )}
      {actions.onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground/70 transition-colors hover:bg-red-50 hover:text-destructive dark:hover:bg-red-950/30"
          aria-label="Delete booking"
          onClick={() => actions.onDelete?.(booking)}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
