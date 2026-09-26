'use client';

import { useQuery } from '@tanstack/react-query';
import {
  X,
  CreditCard,
  Building2,
  Plane,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  CircleAlert,
  Percent,
  Layers,
  Calendar,
} from 'lucide-react';
import {
  getAdminBookingFinancialSummary,
  type BookingFinancialSummary,
} from '@/features/admin/api/admin-bookings';
import { formatCurrency } from '@/lib/utils/currency';
import { useCurrencyData } from '@/context/CurrencyContext';
import { AdminBookingStatusBadge } from '@/components/admin/shared/admin-badges';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/cn';

interface AgentBookingDetailModalProps {
  bookingId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenCancel?: (id: string) => void;
  cancellable?: boolean;
}

export function AgentBookingDetailModal({
  bookingId,
  open,
  onClose,
  onOpenCancel,
  cancellable = false,
}: AgentBookingDetailModalProps) {
  const { decimalsMap } = useCurrencyData();
  const { data: financialSummary, isPending } = useQuery<BookingFinancialSummary | { message: string }>({
    queryKey: ['admin', 'booking-financial-summary', bookingId],
    queryFn: () => getAdminBookingFinancialSummary(bookingId!),
    enabled: !!bookingId && open,
  });

  const isMessage = financialSummary && 'message' in financialSummary;
  const summary = isMessage ? null : (financialSummary as BookingFinancialSummary | undefined);

  return (
    <Modal isOpen={open} onClose={onClose} adminSurface className="max-w-2xl max-h-[88vh] overflow-y-auto p-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {summary?.bookingType === 'hotel' ? (
              <Building2 className="size-4" />
            ) : (
              <Plane className="size-4" />
            )}
          </span>
          <div>
            <h3 className="text-base font-semibold text-foreground">Agent Booking Financials</h3>
            <p className="text-xs text-muted-foreground font-mono">
              ID: {bookingId ?? '—'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close modal"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="p-6 space-y-6">
        {isPending ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            <p className="mt-3 text-xs text-muted-foreground">Loading financial details…</p>
          </div>
        ) : isMessage ? (
          <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            <CircleAlert className="size-5 shrink-0" />
            <p>{financialSummary.message}</p>
          </div>
        ) : summary ? (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Type</span>
                <p className="mt-1 text-sm font-semibold capitalize text-foreground flex items-center gap-1.5">
                  {summary.bookingType}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Status</span>
                <div className="mt-1">
                  <AdminBookingStatusBadge status={summary.status} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Total Amount</span>
                <p className="mt-1 text-sm font-bold tabular-nums text-foreground">
                  {summary.amount != null ? formatCurrency(summary.amount, summary.currency ?? 'USD', decimalsMap) : '—'}
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">{summary.currency ?? 'USD'}</span>
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3.5">
                <span className="text-[11px] font-medium text-muted-foreground">Refunded</span>
                <p className="mt-1 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(summary.refundedAmount, summary.currency ?? 'USD', decimalsMap)}
                </p>
              </div>
            </div>

            {/* Wallet Transactions */}
            {summary.walletTransactions?.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Wallet Transactions ({summary.walletTransactions.length})
                  </h4>
                </div>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                  {summary.walletTransactions.map((tx) => {
                    const isPositive = tx.amount >= 0;
                    return (
                      <div key={tx.id} className="flex items-center justify-between p-3 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center rounded-full',
                              isPositive
                                ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
                            )}
                          >
                            {isPositive ? (
                              <ArrowDownRight className="size-3.5" />
                            ) : (
                              <ArrowUpRight className="size-3.5" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold capitalize text-foreground">
                              {tx.type.replace(/_/g, ' ')}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {tx.description || 'No description'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p
                            className={cn(
                              'font-mono font-semibold tabular-nums',
                              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground',
                            )}
                          >
                            {isPositive ? '+' : ''}${Math.abs(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(tx.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Commissions */}
            {summary.commissionRecords?.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Percent className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Commissions ({summary.commissionRecords.length})
                  </h4>
                </div>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                  {summary.commissionRecords.map((cr) => (
                    <div key={cr.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-foreground">
                          Rate: {cr.rateType === 'percentage' ? `${cr.rate}%` : formatCurrency(cr.rate, cr.currency, decimalsMap)}
                        </span>
                        <AdminBookingStatusBadge status={cr.status} />
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(cr.commissionAmount, cr.currency, decimalsMap)} {cr.currency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modification History */}
            {summary.modificationHistory?.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Modification History ({summary.modificationHistory.length})
                  </h4>
                </div>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                  {summary.modificationHistory.map((mh) => (
                    <div key={mh.id} className="p-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold capitalize text-foreground">{mh.type}</span>
                          <AdminBookingStatusBadge status={mh.status} />
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(mh.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {mh.reason && <p className="text-muted-foreground">{mh.reason}</p>}
                      {(mh.refundAmount != null || mh.cancellationFee != null) && (
                        <div className="flex gap-4 font-mono text-[11px] pt-1">
                          {mh.refundAmount != null && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              Refund: {formatCurrency(mh.refundAmount, summary.currency ?? 'USD', decimalsMap)} {summary.currency ?? 'USD'}
                            </span>
                          )}
                          {mh.cancellationFee != null && (
                            <span className="text-rose-600 dark:text-rose-400">
                              Fee: {formatCurrency(mh.cancellationFee, summary.currency ?? 'USD', decimalsMap)} {summary.currency ?? 'USD'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Credit Shells */}
            {summary.creditShells?.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Credit Shells ({summary.creditShells.length})
                  </h4>
                </div>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card overflow-hidden">
                  {summary.creditShells.map((cs) => (
                    <div key={cs.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="capitalize font-semibold text-foreground">
                          {cs.status.replace(/_/g, ' ')}
                        </span>
                        {cs.expiresAt && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="size-3" />
                            Exp: {new Date(cs.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <span className="font-mono font-semibold tabular-nums text-foreground">
                        {formatCurrency(cs.remainingAmount, 'USD', decimalsMap)} / {formatCurrency(cs.originalAmount, 'USD', decimalsMap)} USD
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cancel Action if applicable */}
            {cancellable && onOpenCancel && bookingId && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCancel(bookingId);
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-2.5 text-sm font-semibold text-error-600 transition-colors hover:bg-error-500/20 active:scale-[0.99] dark:text-error-400"
                >
                  Cancel this booking
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">No financial data found.</div>
        )}
      </div>

      <div className="border-t border-border px-6 py-3.5 bg-muted/20 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Close
        </button>
      </div>
    </Modal>
  );
}

