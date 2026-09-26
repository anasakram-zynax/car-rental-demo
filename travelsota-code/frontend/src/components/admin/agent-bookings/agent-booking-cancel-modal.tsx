'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert, CheckCircle2, X } from 'lucide-react';
import {
  adminCancelBooking,
  type AdminCancelEstimateResponse,
} from '@/features/admin/api/admin-bookings';
import { useToast } from '@/hooks/useToast';
import { Modal } from '@/components/ui/modal';
import { useCurrencyData } from '@/context/CurrencyContext';
import { formatCurrencyWithCode } from '@/lib/utils/currency';

interface AgentBookingCancelModalProps {
  bookingId: string | null;
  open: boolean;
  estimate: AdminCancelEstimateResponse | null;
  estimateLoading: boolean;
  onClose: () => void;
}

export function AgentBookingCancelModal({
  bookingId,
  open,
  estimate,
  estimateLoading,
  onClose,
}: AgentBookingCancelModalProps) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const { decimalsMap } = useCurrencyData();

  const cancelMutation = useMutation({
    mutationFn: ({ id, cancelReason }: { id: string; cancelReason?: string }) =>
      adminCancelBooking(id, cancelReason),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'agent-bookings'] });
      // AdminBookingCancelResponse carries no currency of its own — the
      // estimate fetched just before cancelling this same booking does.
      const refundCurrency = estimate?.currency ?? 'USD';
      toasts.success(
        'Booking cancelled',
        `Admin cancelled booking. Refund: ${formatCurrencyWithCode(result.refundAmount, refundCurrency, decimalsMap)}`,
      );
      onClose();
    },
    onError: (err: any) => {
      toasts.error('Cancellation failed', err?.message ?? 'Unable to cancel booking.');
    },
  });

  const handleConfirm = () => {
    if (!bookingId) return;
    cancelMutation.mutate({ id: bookingId, cancelReason: reason.trim() || undefined });
  };

  return (
    <Modal isOpen={open} onClose={onClose} adminSurface className="max-w-md p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-error-500/10 text-error-600 dark:text-error-400">
            <TriangleAlert className="size-4" />
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Cancel Agent Booking</h3>
            <p className="text-xs text-muted-foreground">Process cancellation & refund</p>
          </div>
        </div>
        <button
          onClick={onClose}
          disabled={cancelMutation.isPending}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close modal"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        {/* Fee estimate card */}
        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
          {estimateLoading ? (
            <div className="py-3 text-center">
              <div className="mx-auto size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Calculating cancellation fee…</p>
            </div>
          ) : estimate ? (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Booking Total</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrencyWithCode(estimate.totalAmount, estimate.currency, decimalsMap)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Cancellation Fee</span>
                <span className="font-semibold tabular-nums text-error-600 dark:text-error-400">
                  {estimate.cancellationFee > 0
                    ? `-${formatCurrencyWithCode(estimate.cancellationFee, estimate.currency, decimalsMap)}`
                    : 'Free'}
                </span>
              </div>

              {estimate.policyDescription && (
                <p className="text-[11px] italic text-muted-foreground">{estimate.policyDescription}</p>
              )}

              {estimate.isFreeCancellation && (
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  Free cancellation — no fee will be charged
                </div>
              )}

              <div className="border-t border-border pt-2.5 flex items-center justify-between text-sm font-bold">
                <span className="text-foreground">Estimated Refund</span>
                <span className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrencyWithCode(estimate.refundAmount, estimate.currency, decimalsMap)}
                </span>
              </div>

              <div className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs text-primary">
                Refund method:{' '}
                <strong>{estimate.refundType === 'credit_shell' ? 'Credit Shell' : 'Wallet Deposit'}</strong>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              Fee estimate unavailable. Refund will follow configured rules.
            </p>
          )}
        </div>

        {/* Reason field */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cancellation Reason (optional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Agent requested cancellation, duplicate booking…"
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2.5 border-t border-border bg-muted/20 px-6 py-3.5">
        <button
          type="button"
          onClick={onClose}
          disabled={cancelMutation.isPending}
          className="rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          Keep Booking
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={cancelMutation.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-error-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-error-600 active:scale-[0.98] disabled:opacity-50"
        >
          {cancelMutation.isPending && (
            <span className="size-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Confirm Cancel
        </button>
      </div>
    </Modal>
  );
}

