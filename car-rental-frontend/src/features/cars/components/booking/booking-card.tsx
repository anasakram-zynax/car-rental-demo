"use client";

import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  CircleDollarSign,
  MapPin,
  RotateCcw,
  UserRound,
  Waypoints,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useCancelBooking } from "@/features/cars/hooks/use-cancel-booking";
import type { CarBooking } from "@/features/cars/types/car.types";
import {
  getTransferPackageRoute,
  isTransferBooking,
} from "@/features/cars/utils/booking-display";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { BookingStatusBadge, PaymentStatusBadge } from "./booking-status-badge";

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function CancellationDialog({
  booking,
  onClose,
}: {
  booking: CarBooking;
  onClose: () => void;
}) {
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
      await cancelBooking.mutateAsync({
        reference: booking.reference,
        reason: trimmedReason,
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to cancel this booking. Please try again.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#10203d]/55 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <section
        aria-modal="true"
        aria-labelledby={`cancel-${booking.reference}`}
        role="dialog"
        className="w-full max-w-md overflow-hidden rounded-card border border-white/80 bg-surface-elevated shadow-elevated"
      >
        <div className="border-b border-border bg-[#f7f9fc] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="grid size-10 place-items-center rounded-full bg-red-50 text-danger">
                <AlertTriangle aria-hidden="true" size={19} />
              </span>
              <h2
                id={`cancel-${booking.reference}`}
                className="mt-4 text-xl font-semibold"
              >
                Cancel Booking?
              </h2>
              <p className="mt-2 text-sm text-muted">
                Booking:{" "}
                <strong className="text-foreground">{booking.reference}</strong>
              </p>
            </div>
            <Button
              aria-label="Close cancellation dialog"
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X aria-hidden="true" size={18} />
            </Button>
          </div>
        </div>
        <div className="p-6 sm:p-7">
          <label
            className="grid gap-2 text-sm font-medium"
            htmlFor={`reason-${booking.reference}`}
          >
            Cancellation reason
            <textarea
              id={`reason-${booking.reference}`}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError(null);
              }}
              disabled={cancelBooking.isPending}
              className="min-h-28 rounded-control border border-border bg-surface px-3.5 py-3 text-sm font-normal outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]"
            />
          </label>
          {error ? (
            <p
              aria-live="polite"
              className="mt-3 rounded-control border border-danger/20 bg-red-900/[0.06] px-3 py-2 text-sm text-danger"
            >
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={onClose}
              disabled={cancelBooking.isPending}
            >
              Keep Booking
            </Button>
            <Button
              onClick={() => void submitCancellation()}
              disabled={cancelBooking.isPending}
            >
              {cancelBooking.isPending ? (
                <>
                  <RotateCcw
                    aria-hidden="true"
                    className="animate-spin"
                    size={16}
                  />
                  Cancelling...
                </>
              ) : (
                "Confirm Cancellation"
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function BookingCard({ booking }: { booking: CarBooking }) {
  const [showCancellation, setShowCancellation] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const pickupTime = new Date(booking.pickupAt).getTime();
  const canCancel =
    booking.bookingStatus === "confirmed" &&
    currentTime !== null &&
    pickupTime - currentTime >= CANCELLATION_WINDOW_MS;
  const nearPickup =
    booking.bookingStatus === "confirmed" && currentTime !== null && !canCancel;
  const isTransfer = isTransferBooking(booking);
  const transferRoute = getTransferPackageRoute(booking);

  useEffect(() => {
    const timer = window.setTimeout(() => setCurrentTime(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <Card variant="elevated" padding="none" className="overflow-hidden">
        <div className="border-b border-border bg-[#f7f9fc] px-5 py-5 sm:px-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  className={
                    isTransfer
                      ? "border-blue-200 bg-blue-50 text-accent"
                      : undefined
                  }
                  variant={isTransfer ? "neutral" : "accent"}
                >
                  {isTransfer ? "Transfer" : "Rental"}
                </Badge>
                <p className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                  Booking reference
                </p>
              </div>
              <h2 className="mt-2 break-all text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
                {booking.reference}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <BookingStatusBadge status={booking.bookingStatus} />
              <PaymentStatusBadge status={booking.paymentStatus} />
            </div>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            {isTransfer ? (
              <div className="flex gap-3 rounded-control border border-border/80 bg-[#f8fafe] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-blue-50 text-accent">
                  <Waypoints aria-hidden="true" size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted">
                    Transfer route
                  </p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {transferRoute ?? "Package details unavailable"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 rounded-control border border-border/80 bg-[#f8fafe] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-blue-50 text-accent">
                  <MapPin aria-hidden="true" size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted">Pickup</p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {booking.pickupLocation}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(booking.pickupAt)}
                  </p>
                </div>
              </div>
            )}
            {isTransfer ? (
              <div className="flex gap-3 rounded-control border border-border/80 bg-[#f8fafe] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-blue-50 text-accent">
                  <CalendarClock aria-hidden="true" size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted">Pickup time</p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatDateTime(booking.pickupAt)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 rounded-control border border-border/80 bg-[#f8fafe] p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-blue-50 text-accent">
                  <CalendarRange aria-hidden="true" size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted">Return</p>
                  <p className="mt-1 break-words text-sm font-semibold">
                    {booking.dropoffLocation}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {formatDateTime(booking.returnAt)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {isTransfer ? (
            <dl className="mt-5 rounded-control border border-border bg-white p-4 text-sm shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="flex items-center gap-2 text-muted">
                  <CircleDollarSign aria-hidden="true" size={16} /> Fixed
                  package price
                </dt>
                <dd className="text-base font-semibold">
                  {booking.transferPackage
                    ? `${formatCurrency(booking.transferPackage.price, booking.transferPackage.currency)} ${booking.transferPackage.currency}`
                    : "Package details unavailable"}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="mt-5 grid gap-4 rounded-control border border-border bg-white p-4 text-sm shadow-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted">Rental days</dt>
                <dd className="mt-1 font-semibold">{booking.rentalDays}</dd>
              </div>
              <div>
                <dt className="text-muted">Daily rate</dt>
                <dd className="mt-1 font-semibold">
                  {formatCurrency(booking.dailyPrice, booking.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tax</dt>
                <dd className="mt-1 font-semibold">
                  {formatCurrency(booking.taxAmount, booking.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Total</dt>
                <dd className="mt-1 text-base font-semibold text-accent">
                  {formatCurrency(booking.totalPrice, booking.currency)}
                </dd>
              </div>
            </dl>
          )}

          <div className="mt-6 grid gap-4 border-t border-border pt-5 text-sm sm:grid-cols-2">
            <p className="flex gap-3">
              <UserRound
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-accent"
                size={17}
              />
              <span>
                <span className="text-muted">
                  {isTransfer ? "Passenger" : "Driver"}
                </span>
                <br />
                <strong>
                  {booking.driverFirstName} {booking.driverLastName}
                </strong>
              </span>
            </p>
            <p className="break-words">
              <span className="text-muted">Contact</span>
              <br />
              <strong>{booking.contactEmail}</strong>
              <br />
              {booking.contactPhone}
            </p>
            {booking.specialRequests ? (
              <p className="sm:col-span-2">
                <span className="text-muted">Special requests</span>
                <br />
                {booking.specialRequests}
              </p>
            ) : null}
            {booking.cancelReason ? (
              <p className="rounded-control border border-border bg-[#f8fafe] p-3 sm:col-span-2">
                <span className="text-muted">Cancellation reason</span>
                <br />
                {booking.cancelReason}
              </p>
            ) : null}
          </div>
          {canCancel ? (
            <div className="mt-6 border-t border-border pt-5">
              <Button
                variant="secondary"
                onClick={() => setShowCancellation(true)}
              >
                Cancel Booking
              </Button>
            </div>
          ) : null}
          {nearPickup ? (
            <p className="mt-6 flex gap-2 border-t border-border pt-5 text-sm text-muted">
              <AlertTriangle
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={16}
              />
              Cancellation is unavailable within 24 hours of pickup. The server
              confirms eligibility.
            </p>
          ) : null}
        </div>
      </Card>
      {showCancellation ? (
        <CancellationDialog
          booking={booking}
          onClose={() => setShowCancellation(false)}
        />
      ) : null}
    </>
  );
}
