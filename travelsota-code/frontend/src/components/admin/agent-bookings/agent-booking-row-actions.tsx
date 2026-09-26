'use client';

import { useState, useRef } from 'react';
import { EllipsisVertical, Eye, CircleX, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AgentBookingFeedItem } from '@/features/admin/api/admin-bookings';

export interface AgentBookingRowActionsProps {
  booking: AgentBookingFeedItem;
  canCancel: boolean;
  onView: (id: string) => void;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}

const OPEN_INTENT_DELAY_MS = 100;
const CLOSE_DELAY_MS = 300;

export function AgentBookingRowActions({
  booking,
  canCancel,
  onView,
  onCancel,
  onDelete,
}: AgentBookingRowActionsProps) {
  const isCancelled = booking.status === 'cancelled' || booking.status === 'CANCELLED';
  const ref = booking.ref ?? booking.id.slice(0, 8).toUpperCase();
  const [open, setOpen] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const handleTriggerEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      openTimer.current = null;
      setOpen(true);
    }, OPEN_INTENT_DELAY_MS);
  };

  const scheduleClose = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) return;
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setOpen(false);
    }, CLOSE_DELAY_MS);
  };

  return (
    <div className="flex justify-center">
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-lg text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
            aria-label="Open booking actions"
            onMouseEnter={handleTriggerEnter}
            onMouseLeave={scheduleClose}
          >
            <EllipsisVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onMouseEnter={() => {
            if (closeTimer.current) {
              clearTimeout(closeTimer.current);
              closeTimer.current = null;
            }
          }}
          onMouseLeave={scheduleClose}
        >
          <DropdownMenuLabel className="font-mono text-xs text-muted-foreground">
            #{ref}
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onView(booking.id)} className="cursor-pointer">
            <Eye className="mr-2 size-4 text-muted-foreground/70" />
            View financials
          </DropdownMenuItem>
          {canCancel && !isCancelled && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onCancel(booking.id)}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <CircleX className="mr-2 size-4" />
                Cancel booking
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(booking.id)}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 size-4" />
            Delete booking
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

