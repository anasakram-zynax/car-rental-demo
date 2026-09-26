"use client";

// Admin cancel-booking modal — operations-console design.
// Loads the supplier cancellation estimate before the admin confirms.
// Surfaces policy provenance (LIVE vs booked-rate) and an explicit
// "policy unknown" state — never fabricates free or full-charge figures.
//
// Craft notes (impeccable · operate):
// - The estimated refund is the decision-critical figure → hero treatment
// - Destructive CTA separated, labeled by context ("Cancel anyway" when unknown)
// - Escape / backdrop / X escape routes; aria dialog semantics

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/useToast";
import { apiRequest } from "@/lib/api/client";
import {
  getAdminCancelEstimate,
} from "@/features/admin/api/admin-bookings";
import { motion, useReducedMotion } from "motion/react";
import { formatCurrency } from "@/lib/utils/currency";
import { useCurrencyData } from "@/context/CurrencyContext";
import {
  X,
  CircleAlert,
  RadioTower,
  Database,
  TriangleAlert,
} from "lucide-react";

export interface CancelModalBooking {
  id: string;
  type: "flight" | "hotel";
  provider: string;
  pnr: string | null;
  supplierReference?: string | null;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
}

interface CancelEstimate {
  bookingId: string;
  totalAmount: number;
  currency: string;
  policiesKnown?: boolean;
  policySource?: "live" | "snapshot" | "none";
  message?: string;
  cancellationFee: number | null;
  refundAmount: number | null;
  isFreeCancellation: boolean;
  policyDescription: string | null;
  upcomingFee?: number;
  upcomingFeeFrom?: string;
  upcomingFeeDescription?: string | null;
}

export function CancelBookingModal({
  booking,
  onClose,
}: {
  booking: CancelModalBooking;
  onClose: () => void;
}) {
  const toasts = useToast();
  const queryClient = useQueryClient();
  const reducedMotion = useReducedMotion();
  const { decimalsMap } = useCurrencyData();

  // Guards Escape-close while a cancel request is in flight (stable ref)
  const cancelPendingRef = useRef(false);

  // Escape-to-close (third route alongside X and backdrop)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !cancelPendingRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const estimateQuery = useQuery({
    queryKey: ["admin", "cancel-estimate", booking.id],
    queryFn: () => getAdminCancelEstimate(booking.id) as Promise<CancelEstimate>,
    staleTime: 30_000,
  });
  const estimate = estimateQuery.data ?? null;
  const estimateLoading = estimateQuery.isPending;
  const policiesUnknown = estimate ? estimate.policiesKnown === false : false;

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/admin/bookings/${booking.type}/${booking.id}`, {
        method: "DELETE",
        auth: true,
      }),
    onMutate: () => {
      cancelPendingRef.current = true;
    },
    onSettled: () => {
      cancelPendingRef.current = false;
    },    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "stats"] });
      const refundText =
        estimate?.refundAmount != null
          ? `Refund ${formatCurrency(estimate.refundAmount, estimate.currency, decimalsMap)} ${estimate.currency}.`
          : "Refund will follow the supplier's actual charges.";
      toasts.success("Booking cancelled", refundText);
      onClose();
    },
    onError: (err: any) => {
      toasts.error("Cancellation failed", err?.message ?? "Unable to cancel booking.");
    },
  });

  const customerName = booking.user
    ? [booking.user.firstName, booking.user.lastName].filter(Boolean).join(" ") ||
      booking.user.email ||
      "Guest"
    : "—";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!cancelMutation.isPending) onClose();
      }}
      role="presentation"
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-booking-title"
        className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-error-50 ring-1 ring-error-200/60 dark:bg-error-950/40 dark:ring-error-800/50">
              <CircleAlert className="size-5 text-error-500" aria-hidden />
            </div>
            <div>
              <h3 id="cancel-booking-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                Cancel Booking
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {booking.type === "hotel" ? "Hotel" : "Flight"} ·{" "}
                <span className="font-mono tabular-nums">
                  {booking.pnr ? `#${booking.pnr}` : `#${booking.id.slice(0, 8)}`}
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={cancelMutation.isPending}
            className="cursor-pointer rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500 disabled:opacity-50 dark:hover:bg-gray-800"
            aria-label="Close without cancelling"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="space-y-4 px-6 py-5">
          {/* Context strip — customer + reference, equal visual weight */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Customer</p>
              <p className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-white" title={customerName}>
                {customerName}
              </p>
            </div>
            <div className="min-w-0 border-l border-gray-200 pl-3 dark:border-gray-700">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Reference</p>
              <p className="mt-0.5 truncate font-mono text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                {booking.pnr ?? booking.id.slice(0, 8)}
              </p>
            </div>
          </div>

          {/* Estimate panel */}
          <div aria-live="polite" className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
            {/* Panel header + source badge */}
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-800/40">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Cancellation estimate
              </p>
              {!estimateLoading && estimate && !policiesUnknown && (
                estimate.policySource === "live" ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
                    title="Fetched fresh from the supplier just now"
                  >
                    <RadioTower className="size-2.5" aria-hidden /> Live policy
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800"
                    title="From the rate snapshot stored at booking time"
                  >
                    <Database className="size-2.5" aria-hidden /> Booked rate
                  </span>
                )
              )}
            </div>

            {estimateLoading ? (
              <div className="flex items-center justify-center gap-2.5 py-7" role="status">
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-gray-300 border-t-brand-teal-500" />
                <p className="text-xs text-gray-500 dark:text-gray-400">Fetching live supplier policy…</p>
              </div>
            ) : policiesUnknown ? (
              /* Unknown-policy state — never fabricate free/full. Mirrors the
                 known-policy layout below (hero figure + supporting detail)
                 so an ambiguous answer reads with the same clarity as a
                 confident one, not as a degraded afterthought. */
              <>
                <div className="border-b border-gray-100 bg-gradient-to-b from-amber-500/[0.06] to-transparent px-4 pb-4 pt-4 text-center dark:border-gray-800 dark:from-amber-500/10">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Estimated refund
                  </p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                    Unknown
                  </p>
                  <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    Booking total{" "}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {formatCurrency(estimate!.totalAmount, estimate!.currency, decimalsMap)} {estimate!.currency}
                    </span>
                  </p>
                </div>
                <div className="space-y-2.5 px-4 py-3.5">
                  <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-950/30">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                        Supplier policy unavailable
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                        {estimate?.message ??
                          "The supplier's cancellation policy could not be retrieved right now. The supplier may still apply charges under its own policy."}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between pt-0.5 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Supplier</span>
                    <span className="font-medium capitalize text-gray-700 dark:text-gray-300">{booking.provider}</span>
                  </div>
                </div>
              </>
            ) : estimate ? (
              <>
                {/* Hero figure — the decision-critical refund amount */}
                <div className="border-b border-gray-100 bg-gradient-to-b from-brand-teal/[0.05] to-transparent px-4 pb-4 pt-4 text-center dark:border-gray-800 dark:from-brand-teal/10">
                  <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Estimated refund
                  </p>
                  <p
                    className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                      (estimate.refundAmount ?? 0) > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {formatCurrency(estimate.refundAmount ?? 0, estimate.currency, decimalsMap)}
                    <span className="ml-1.5 text-base font-semibold opacity-70">{estimate.currency}</span>
                  </p>
                  {estimate.cancellationFee != null && estimate.cancellationFee > 0 && (
                    <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      after a fee of{" "}
                      <span className="font-semibold text-error-600 dark:text-error-400">
                        −{formatCurrency(estimate.cancellationFee, estimate.currency, decimalsMap)} {estimate.currency}
                      </span>{" "}
                      on{" "}
                      <span className="font-medium">
                        {formatCurrency(estimate.totalAmount, estimate.currency, decimalsMap)} {estimate.currency}
                      </span>
                    </p>
                  )}
                  {estimate.isFreeCancellation && (
                    <p className="mt-1 inline-flex rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 ring-1 ring-success-200/60 dark:bg-success-950/40 dark:text-success-400 dark:ring-success-800/50">
                      Free cancellation window active
                    </p>
                  )}
                </div>

                {/* Supporting detail */}
                <div className="space-y-2 px-4 py-3.5">
                  {estimate.policyDescription && (
                    <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs italic leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
                      {estimate.policyDescription}
                    </p>
                  )}
                  {estimate.isFreeCancellation && estimate.upcomingFeeDescription && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {estimate.upcomingFeeDescription}
                    </p>
                  )}
                  <div className="flex justify-between pt-0.5 text-xs">
                    <span className="text-gray-500 dark:text-gray-400">Supplier</span>
                    <span className="font-medium capitalize text-gray-700 dark:text-gray-300">{booking.provider}</span>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                Fee estimate unavailable — refund will follow the supplier&apos;s actual charges.
              </p>
            )}
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4 dark:border-gray-800 dark:bg-gray-800/30">
          {policiesUnknown && (
            <p className="mb-3 text-center text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Policy unknown — the supplier may still charge per its own rules.
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={cancelMutation.isPending}
              className="min-h-[44px] flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="min-h-[44px] flex-1 cursor-pointer rounded-xl bg-error-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-error-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-gray-900"
            >
              {cancelMutation.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Cancelling…
                </span>
              ) : policiesUnknown ? (
                "Cancel Anyway"
              ) : (
                "Confirm Cancel"
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
