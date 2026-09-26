"use client";

// Change (edit) booking modal — Hotelbeds BookingChange via the admin API.
// Simulates the change first, then commits. Only usable on hotel bookings
// whose supplier modification policy allows it.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useToast } from "@/hooks/useToast";
import { apiRequest } from "@/lib/api/client";
import { motion, useReducedMotion } from "motion/react";
import { X, PencilLine } from "lucide-react";

interface ChangeModalBooking {
  id: string;
  type: "flight" | "hotel";
  provider: string;
  pnr: string | null;
  supplierReference?: string | null;
}

interface ChangeResult {
  changeable?: boolean;
  status?: string;
  message?: string;
  simulated?: boolean;
  booking?: {
    reference?: string | null;
    status?: string | null;
    hotel?: { checkIn?: string | null; checkOut?: string | null } | null;
  } | null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-teal-300 focus:outline-none focus:ring-2 focus:ring-brand-teal-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-brand-teal-600 dark:focus:ring-brand-teal-900/30";

export function ChangeBookingModal({
  booking,
  onClose,
}: {
  booking: ChangeModalBooking;
  onClose: () => void;
}) {
  const toasts = useToast();
  const queryClient = useQueryClient();

  const reference = booking.supplierReference ?? booking.pnr;

  const detailQuery = useApiQuery<any>(
    ["admin", "booking-detail", "supplier", booking.id],
    `/hotels/bookings/${encodeURIComponent(reference ?? "")}/by-reference?provider=${encodeURIComponent(booking.provider ?? "hotelbeds")}`,
    {
      enabled: booking.type === "hotel" && !!reference,
      requestOptions: { auth: true },
      retry: 1,
    },
  );

  const supplierBooking = detailQuery.data?.booking ?? null;
  const modificationAllowed = supplierBooking?.modificationAllowed ?? true;

  const changeMutation = useMutation({
    mutationFn: (payload: {
      checkIn?: string;
      checkOut?: string;
      holder?: { name?: string; surname?: string };
      confirm: boolean;
    }) =>
      apiRequest<ChangeResult>(`/admin/bookings/${booking.id}/change`, {
        method: "POST",
        auth: true,
        body: payload,
      }),
    onSuccess: (result, vars) => {
      if (result.changeable === false) {
        toasts.error("Not changeable", result.message ?? "Supplier rejected the change.");
        return;
      }
      if (!vars.confirm) {
        toasts.success(
          "Change simulated",
          result.message ?? "Simulation succeeded. Confirm to commit.",
        );
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["admin", "bookings"] });
      toasts.success("Booking changed", "Booking updated at the supplier.");
      onClose();
    },
    onError: (err: any) => {
      toasts.error("Change failed", err?.message ?? "Unable to change booking.");
    },
  });

  if (booking.type !== "hotel") {
    return (
      <ModalShell onClose={onClose}>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Booking changes are currently available for hotel bookings only.
        </p>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-teal/10">
          <PencilLine className="size-5 text-brand-teal" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Change Booking</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Hotel ·{" "}
            <span className="font-mono text-xs">
              {reference ? `#${reference}` : `#${booking.id.slice(0, 8)}`}
            </span>
          </p>
        </div>
      </div>

      {detailQuery.isPending ? (
        <div className="mt-6 flex justify-center py-6">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-brand-teal-500" />
        </div>
      ) : (
        <ChangeForm
          supplierBooking={supplierBooking}
          modificationAllowed={modificationAllowed}
          changeMutation={changeMutation}
          onClose={onClose}
        />
      )}
    </ModalShell>
  );
}

function ChangeForm({
  supplierBooking,
  modificationAllowed,
  changeMutation,
  onClose,
}: {
  supplierBooking: any;
  modificationAllowed: boolean;
  changeMutation: ReturnType<typeof useMutation<ChangeResult, any, { checkIn?: string; checkOut?: string; holder?: { name?: string; surname?: string }; confirm: boolean }>>;
  onClose: () => void;
}) {
  const [checkIn, setCheckIn] = useState(supplierBooking?.hotel?.checkIn?.slice(0, 10) ?? "");
  const [checkOut, setCheckOut] = useState(supplierBooking?.hotel?.checkOut?.slice(0, 10) ?? "");
  const [holderName, setHolderName] = useState(supplierBooking?.holder?.name ?? "");
  const [holderSurname, setHolderSurname] = useState(supplierBooking?.holder?.surname ?? "");

  return (
    <>
      {!modificationAllowed ? (
        <div className="mt-4 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-700 dark:border-error-800 dark:bg-error-900/20 dark:text-error-400">
          This offer is <strong>not changeable</strong> per the supplier
          modification policy. You can cancel and rebook instead.
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
          This offer is changeable. Modify the dates or holder below.
        </div>
      )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Check-in">
              <input
                type="date"
                className={inputClass}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
              />
            </Field>
            <Field label="Check-out">
              <input
                type="date"
                className={inputClass}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
              />
            </Field>
            <Field label="Holder first name">
              <input
                type="text"
                className={inputClass}
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
              />
            </Field>
            <Field label="Holder surname">
              <input
                type="text"
                className={inputClass}
                value={holderSurname}
                onChange={(e) => setHolderSurname(e.target.value)}
              />
            </Field>
          </div>

          {changeMutation.data && changeMutation.data.simulated && (
            <div className="mt-4 rounded-xl bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800/50 dark:text-gray-400">
              Simulation OK — supplier status:{" "}
              <span className="font-semibold uppercase text-gray-900 dark:text-white">
                {changeMutation.data.status ?? "confirmed"}
              </span>
              . Click <strong>Confirm change</strong> to commit.
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={changeMutation.isPending}
              className="flex-1 cursor-pointer rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Close
            </button>
            <button
              onClick={() =>
                changeMutation.mutate({
                  checkIn: checkIn || undefined,
                  checkOut: checkOut || undefined,
                  holder: holderName || holderSurname ? { name: holderName || undefined, surname: holderSurname || undefined } : undefined,
                  confirm: false,
                })
              }
              disabled={changeMutation.isPending || !modificationAllowed}
              className="flex-1 cursor-pointer rounded-xl border border-brand-teal/30 bg-white px-4 py-2.5 text-sm font-semibold text-brand-teal transition-colors hover:bg-brand-teal/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-teal/40 dark:bg-gray-800 dark:text-brand-teal"
            >
              Simulate change
            </button>
            <button
              onClick={() =>
                changeMutation.mutate({
                  checkIn: checkIn || undefined,
                  checkOut: checkOut || undefined,
                  holder: holderName || holderSurname ? { name: holderName || undefined, surname: holderSurname || undefined } : undefined,
                  confirm: true,
                })
              }
              disabled={changeMutation.isPending || !modificationAllowed}
              className="flex-1 cursor-pointer rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#012830] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {changeMutation.isPending ? "Working…" : "Confirm change"}
            </button>
          </div>
        </>
      );
    }

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 cursor-pointer rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
        {children}
      </motion.div>
    </div>
  );
}
