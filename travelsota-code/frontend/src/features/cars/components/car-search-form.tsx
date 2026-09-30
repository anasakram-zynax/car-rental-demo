"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchDateInput } from "@/components/search/SearchDateInput";
import {
  CarLocationInput,
  CarTransferDropoffInput,
} from "./car-location-input";
import type { CarLocation, CarSearchMode } from "../types";
import { buildCarsResultsPath } from "../utils/car-results-route";

export interface CarSearchFormState {
  mode: CarSearchMode;
  pickup: CarLocation | null;
  pickupLabel: string;
  returnLocation: CarLocation | null;
  returnLabel: string;
  differentReturn: boolean;
  dropoff: CarLocation | null;
  dropoffLabel: string;
  pickupDate: string;
  pickupTime: string;
  dropoffDate: string;
  dropoffTime: string;
}
const tomorrow = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};
export const defaultCarSearchForm = (): CarSearchFormState => ({
  mode: "rental",
  pickup: null,
  pickupLabel: "",
  returnLocation: null,
  returnLabel: "",
  differentReturn: false,
  dropoff: null,
  dropoffLabel: "",
  pickupDate: tomorrow(1),
  pickupTime: "10:00",
  dropoffDate: tomorrow(3),
  dropoffTime: "10:00",
});

export function CarSearchForm({
  initialState,
}: {
  initialState?: CarSearchFormState;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialState ?? defaultCarSearchForm);
  const [error, setError] = useState("");
  const updateMode = (mode: CarSearchMode) => {
    setError("");
    setForm((current) => ({
      ...current,
      mode,
      dropoff: null,
      dropoffLabel: "",
    }));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!form.pickup)
      return setError("Select a valid pick-up location from the suggestions.");
    const pickupAt = new Date(`${form.pickupDate}T${form.pickupTime}:00`);
    if (!Number.isFinite(pickupAt.getTime()))
      return setError("Choose a valid pick-up date and time.");
    if (form.mode === "rental") {
      const dropoffAt = new Date(`${form.dropoffDate}T${form.dropoffTime}:00`);
      if (!Number.isFinite(dropoffAt.getTime()) || dropoffAt <= pickupAt)
        return setError("Drop-off must be after pick-up.");
      if (form.differentReturn && !form.returnLocation)
        return setError("Select a valid return location.");
      router.push(
        buildCarsResultsPath({
          serviceType: "rental",
          pickupLocationId: form.pickup.id,
          returnLocationId: form.returnLocation?.id ?? form.pickup.id,
          pickupAt: pickupAt.toISOString(),
          dropoffAt: dropoffAt.toISOString(),
        }),
      );
    } else {
      if (!form.dropoff)
        return setError(
          "Select a drop-off available for this pick-up location.",
        );
      router.push(
        buildCarsResultsPath({
          serviceType: "transfer",
          pickupLocationId: form.pickup.id,
          dropoffLocationId: form.dropoff.id,
          pickupAt: pickupAt.toISOString(),
        }),
      );
    }
  };
  const fieldClass =
    "h-auto min-w-0 w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-slate-900 outline-none shadow-none focus:ring-0 disabled:text-slate-400";
  return (
    <form
      onSubmit={submit}
      className="relative z-10 overflow-visible rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_24px_60px_rgba(3,61,74,0.14),0_4px_14px_rgba(3,61,74,0.05)] ring-1 ring-slate-900/[0.03]"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-brand-teal/50 to-transparent"
        aria-hidden="true"
      />
      <div
        className="mb-3 inline-flex rounded-xl bg-slate-100 p-1"
        aria-label="Cars search mode"
      >
        {(["rental", "transfer"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => updateMode(mode)}
            className={`min-h-10 rounded-lg px-5 text-[13px] font-semibold capitalize transition ${form.mode === mode ? "bg-white text-brand-teal shadow-sm" : "text-slate-500 hover:text-brand-teal"}`}
          >
            {mode}
          </button>
        ))}
      </div>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}
      <div className="flex flex-col overflow-visible rounded-2xl border border-slate-200 bg-white lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-[1.45]">
          <CarLocationInput
            label="Pick-up location"
            mode={form.mode}
            value={form.pickupLabel}
            selected={form.pickup}
            onChange={(pickupLabel) =>
              setForm((current) => ({
                ...current,
                pickupLabel,
                pickup: null,
                dropoff: null,
                dropoffLabel: "",
              }))
            }
            onSelect={(pickup) =>
              setForm((current) => ({
                ...current,
                pickup,
                pickupLabel: pickup.label,
                dropoff: null,
                dropoffLabel: "",
              }))
            }
          />
        </div>
        {form.mode === "rental" && form.differentReturn && (
          <div className="min-w-0 flex-[1.45] border-t border-slate-200 lg:border-l lg:border-t-0">
            <CarLocationInput
              label="Return location"
              mode="rental"
              value={form.returnLabel}
              selected={form.returnLocation}
              onChange={(returnLabel) =>
                setForm((current) => ({
                  ...current,
                  returnLabel,
                  returnLocation: null,
                }))
              }
              onSelect={(returnLocation) =>
                setForm((current) => ({
                  ...current,
                  returnLocation,
                  returnLabel: returnLocation.label,
                }))
              }
            />
          </div>
        )}
        {form.mode === "transfer" && (
          <div className="min-w-0 flex-[1.45] border-t border-slate-200 lg:border-l lg:border-t-0">
            <CarTransferDropoffInput
              pickupLocationId={form.pickup?.id}
              value={form.dropoffLabel}
              selected={form.dropoff}
              onChange={(dropoffLabel) =>
                setForm((current) => ({
                  ...current,
                  dropoffLabel,
                  dropoff: null,
                }))
              }
              onSelect={(dropoff) =>
                setForm((current) => ({
                  ...current,
                  dropoff,
                  dropoffLabel: dropoff.label,
                }))
              }
            />
          </div>
        )}
        <DateTimeSegment
          label="Pick-up date · time"
          date={form.pickupDate}
          time={form.pickupTime}
          minDate={tomorrow(0)}
          onDateChange={(pickupDate) =>
            setForm((current) => ({ ...current, pickupDate }))
          }
          onTimeChange={(pickupTime) =>
            setForm((current) => ({ ...current, pickupTime }))
          }
          fieldClass={fieldClass}
        />
        {form.mode === "rental" && (
          <>
            <DateTimeSegment
              label="Drop-off date · time"
              date={form.dropoffDate}
              time={form.dropoffTime}
              minDate={form.pickupDate}
              onDateChange={(dropoffDate) =>
                setForm((current) => ({ ...current, dropoffDate }))
              }
              onTimeChange={(dropoffTime) =>
                setForm((current) => ({ ...current, dropoffTime }))
              }
              fieldClass={fieldClass}
            />
          </>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        {form.mode === "rental" ? (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.differentReturn}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  differentReturn: event.target.checked,
                  returnLocation: event.target.checked
                    ? current.returnLocation
                    : null,
                  returnLabel: event.target.checked ? current.returnLabel : "",
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-brand-teal focus:ring-brand-teal"
            />
            Return car to a different location
          </label>
        ) : (
          <span className="text-sm font-medium text-slate-500">
            Fixed-price route transfer
          </span>
        )}
        <button
          type="submit"
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-brand-teal px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(3,61,74,.28)] transition-all hover:-translate-y-0.5 hover:bg-brand-teal-600 hover:shadow-[0_12px_28px_rgba(3,61,74,.32)] focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:ring-offset-2 active:scale-[0.97]"
        >
          <SearchIcon /> Search
        </button>
      </div>
    </form>
  );
}

function DateTimeSegment({
  label,
  date,
  time,
  minDate,
  onDateChange,
  onTimeChange,
  fieldClass,
}: {
  label: string;
  date: string;
  time: string;
  minDate: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  fieldClass: string;
}) {
  const dateAreaRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const openDate = (event: React.MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("input")) return;
    const input = dateAreaRef.current?.querySelector<HTMLInputElement>("input");
    input?.focus();
    input?.click();
  };
  const openTime = (event: React.MouseEvent<HTMLDivElement>) => {
    const input = timeInputRef.current;
    if (!input) return;
    input.focus();
    if ((event.target as HTMLElement) === input) return;
    try {
      input.showPicker?.();
    } catch {
      input.click();
    }
  };
  return (
    <div className="group flex min-h-[84px] min-w-0 flex-[1.25] flex-col justify-center overflow-hidden border-t border-slate-200 px-4 py-3 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 lg:border-l lg:border-t-0">
      <div className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-slate-400">
        {label}
      </div>
      <div className="grid min-w-0 grid-cols-2 items-stretch">
        <div
          ref={dateAreaRef}
          onClick={openDate}
          className="flex min-w-0 cursor-pointer items-center gap-2 overflow-hidden pr-3"
        >
          <CalendarIcon />
          <div className="min-w-0 flex-1">
            <SearchDateInput
              value={date}
              min={minDate}
              required
              ariaLabel={label.replace(" · time", "")}
              onChange={onDateChange}
              className={`${fieldClass} cursor-pointer`}
            />
          </div>
        </div>
        <div
          onClick={openTime}
          className="flex min-w-0 cursor-pointer items-center overflow-hidden border-l border-slate-200 pl-3"
        >
          <input
            ref={timeInputRef}
            type="time"
            required
            value={time}
            onChange={(event) => onTimeChange(event.target.value)}
            className={`${fieldClass} min-w-0 cursor-pointer [&::-webkit-calendar-picker-indicator]:ml-1 [&::-webkit-calendar-picker-indicator]:shrink-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer`}
          />
        </div>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-[18px] w-[18px] shrink-0 text-slate-300 transition-colors group-focus-within:text-brand-teal/50"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.2-5.2m0 0A7.5 7.5 0 105.2 5.2a7.5 7.5 0 0010.6 10.6z"
      />
    </svg>
  );
}
