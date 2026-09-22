"use client";

import { CalendarRange, MapPin, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCancelBooking } from "@/features/cars/hooks/use-cancel-booking";
import type { CarBooking } from "@/features/cars/types/car.types";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { BookingStatusBadge, PaymentStatusBadge } from "./booking-status-badge";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function CancellationDialog({ booking, onClose }: { booking: CarBooking; onClose: () => void }) {
  const cancelBooking = useCancelBooking();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submitCancellation() {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Please provide a cancellation reason.");
      return;
    }

    try {
      await cancelBooking.mutateAsync({ reference: booking.reference, reason: trimmedReason });
      onClose();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Unable to cancel this booking. Please try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-primary/45 p-4" role="presentation">
      <section aria-modal="true" aria-labelledby={`cancel-${booking.reference}`} role="dialog" className="w-full max-w-md rounded-card border border-white/80 bg-surface-elevated p-6 shadow-elevated sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id={`cancel-${booking.reference}`} className="text-xl font-semibold">Cancel Booking?</h2><p className="mt-2 text-sm text-muted">Booking: <strong className="text-foreground">{booking.reference}</strong></p></div>
          <Button aria-label="Close cancellation dialog" variant="ghost" size="sm" onClick={onClose}><X aria-hidden="true" size={18} /></Button>
        </div>
        <label className="mt-6 grid gap-2 text-sm font-medium" htmlFor={`reason-${booking.reference}`}>Cancellation reason<textarea id={`reason-${booking.reference}`} value={reason} onChange={(event) => { setReason(event.target.value); setError(null); }} disabled={cancelBooking.isPending} className="min-h-28 rounded-control border border-border bg-surface px-3.5 py-3 text-sm font-normal outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]" /></label>
        {error ? <p aria-live="polite" className="mt-3 rounded-control border border-danger/20 bg-red-900/[0.06] px-3 py-2 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={onClose} disabled={cancelBooking.isPending}>Keep Booking</Button><Button onClick={() => void submitCancellation()} disabled={cancelBooking.isPending}>{cancelBooking.isPending ? <><RotateCcw aria-hidden="true" className="animate-spin" size={16} />Cancelling...</> : "Confirm Cancellation"}</Button></div>
      </section>
    </div>
  );
}

export function BookingCard({ booking }: { booking: CarBooking }) {
  const [showCancellation, setShowCancellation] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const pickupTime = new Date(booking.pickupAt).getTime();
  const canCancel = booking.bookingStatus === "confirmed" && currentTime !== null && pickupTime - currentTime >= CANCELLATION_WINDOW_MS;
  const nearPickup = booking.bookingStatus === "confirmed" && currentTime !== null && !canCancel;

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <Card padding="lg" className="overflow-hidden">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0"><p className="text-xs font-semibold tracking-[0.15em] text-muted uppercase">Booking reference</p><h2 className="mt-2 break-all text-xl font-semibold tracking-[-0.025em]">{booking.reference}</h2></div>
          <div className="flex flex-wrap gap-2"><BookingStatusBadge status={booking.bookingStatus} /><PaymentStatusBadge status={booking.paymentStatus} /></div>
        </div>
        <div className="mt-6 grid gap-5 border-y border-border py-5 sm:grid-cols-2">
          <div className="flex gap-3"><MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-accent-secondary" size={18} /><div><p className="text-xs font-medium text-muted">Pickup</p><p className="mt-1 break-words text-sm font-semibold">{booking.pickupLocation}</p><p className="mt-1 text-sm text-muted">{formatDateTime(booking.pickupAt)}</p></div></div>
          <div className="flex gap-3"><CalendarRange aria-hidden="true" className="mt-0.5 shrink-0 text-accent-secondary" size={18} /><div><p className="text-xs font-medium text-muted">Return</p><p className="mt-1 break-words text-sm font-semibold">{booking.dropoffLocation}</p><p className="mt-1 text-sm text-muted">{formatDateTime(booking.returnAt)}</p></div></div>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-muted">Rental days</dt><dd className="mt-1 font-semibold">{booking.rentalDays}</dd></div><div><dt className="text-muted">Daily rate</dt><dd className="mt-1 font-semibold">{formatCurrency(booking.dailyPrice, booking.currency)}</dd></div><div><dt className="text-muted">Tax</dt><dd className="mt-1 font-semibold">{formatCurrency(booking.taxAmount, booking.currency)}</dd></div><div><dt className="text-muted">Total</dt><dd className="mt-1 font-semibold">{formatCurrency(booking.totalPrice, booking.currency)}</dd></div></dl>
        <div className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2"><p><span className="text-muted">Driver</span><br /><strong>{booking.driverFirstName} {booking.driverLastName}</strong></p><p className="break-words"><span className="text-muted">Contact</span><br /><strong>{booking.contactEmail}</strong><br />{booking.contactPhone}</p>{booking.specialRequests ? <p className="sm:col-span-2"><span className="text-muted">Special requests</span><br />{booking.specialRequests}</p> : null}{booking.cancelReason ? <p className="sm:col-span-2"><span className="text-muted">Cancellation reason</span><br />{booking.cancelReason}</p> : null}</div>
        {canCancel ? <div className="mt-6 border-t border-border pt-5"><Button variant="secondary" onClick={() => setShowCancellation(true)}>Cancel Booking</Button></div> : null}
        {nearPickup ? <p className="mt-6 border-t border-border pt-5 text-sm text-muted">Cancellation is unavailable within 24 hours of pickup. The server confirms eligibility.</p> : null}
      </Card>
      {showCancellation ? <CancellationDialog booking={booking} onClose={() => setShowCancellation(false)} /> : null}
    </>
  );
}
