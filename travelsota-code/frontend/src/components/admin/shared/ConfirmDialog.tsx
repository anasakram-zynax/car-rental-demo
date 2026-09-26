"use client";

// Destructive-confirm dialog built on the native top-layer <dialog> primitive.
// Drop-in replacement for DeleteConfirm — identical props.

import { DialogOverlay } from "@/components/ui/dialog-overlay";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  /** How many rows will be removed (drives singular/plural copy). */
  count: number;
  /** e.g. "lead", "notification" */
  noun: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  count,
  noun,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <DialogOverlay isOpen={open} onClose={onCancel} className="max-w-md">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50">
          <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
        </span>
        <div>
          <h3 className="text-base font-bold text-zinc-900">
            {count === 1 ? `Delete ${noun}?` : `Delete ${count} ${noun}s?`}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            This action is permanent and cannot be undone.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Keep
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          className="bg-error-500 hover:bg-error-600 focus-visible:ring-error-500"
        >
          {loading ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </DialogOverlay>
  );
}
