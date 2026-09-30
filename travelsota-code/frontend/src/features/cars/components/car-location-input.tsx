"use client";
import { useState } from "react";
import { useCarLocations, useTransferDropoffs } from "../hooks";
import type { CarLocation, CarSearchMode } from "../types";

export function CarLocationInput({
  label,
  mode,
  value,
  selected,
  onChange,
  onSelect,
}: {
  label: string;
  mode: CarSearchMode;
  value: string;
  selected: CarLocation | null;
  onChange: (value: string) => void;
  onSelect: (location: CarLocation) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = useCarLocations(mode, value);
  const open = focused && !selected && value.trim().length >= 3;
  return (
    <label className="group relative flex min-h-[84px] min-w-0 flex-1 cursor-text items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-within:bg-slate-50">
      <svg
        className="h-[18px] w-[18px] shrink-0 text-slate-300 transition-colors group-focus-within:text-brand-teal/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="12" cy="10" r="3" />
        <path d="M19.5 10c0 7.142-7.5 11.25-7.5 11.25S4.5 17.142 4.5 10a7.5 7.5 0 1115 0z" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.04em] text-slate-400">
          {label}
        </span>
        <input
          value={value}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(event) => onChange(event.target.value)}
          placeholder="City, area or airport"
          className="h-auto w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-slate-900 shadow-none outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-0"
        />
      </span>
      {open && (
        <div className="absolute left-2 right-2 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {query.isLoading && (
            <p className="px-3 py-3 text-sm text-slate-500">
              Searching locations…
            </p>
          )}
          {query.isError && (
            <p className="px-3 py-3 text-sm text-red-600">
              Locations could not be loaded.
            </p>
          )}
          {!query.isLoading && !query.isError && query.data?.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-500">
              No Cars locations found.
            </p>
          )}
          {query.data?.map((location) => (
            <button
              key={location.id}
              type="button"
              onMouseDown={() => onSelect(location)}
              className="min-h-11 w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
            >
              <span className="block text-sm font-semibold text-slate-900">
                {location.label}
              </span>
              <span className="block text-xs text-slate-500">
                {location.city}, {location.country}
              </span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

export function CarTransferDropoffInput({
  pickupLocationId,
  value,
  selected,
  onChange,
  onSelect,
}: {
  pickupLocationId?: string;
  value: string;
  selected: CarLocation | null;
  onChange: (value: string) => void;
  onSelect: (location: CarLocation) => void;
}) {
  const [focused, setFocused] = useState(false);
  const query = useTransferDropoffs(pickupLocationId, value);
  const open = focused && Boolean(pickupLocationId) && !selected;
  return (
    <label className="group relative flex min-h-[84px] min-w-0 flex-1 cursor-text items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-within:bg-slate-50">
      <svg
        className="h-[18px] w-[18px] shrink-0 text-slate-300 transition-colors group-focus-within:text-brand-teal/60"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="12" cy="10" r="3" />
        <path d="M19.5 10c0 7.142-7.5 11.25-7.5 11.25S4.5 17.142 4.5 10a7.5 7.5 0 1115 0z" />
      </svg>
      <span className="min-w-0 flex-1">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.04em] text-slate-400">
          Drop-off location
        </span>
        <input
          value={value}
          disabled={!pickupLocationId}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onChange={(event) => onChange(event.target.value)}
          placeholder={
            pickupLocationId
              ? "Type a valid route destination"
              : "Select pick-up first"
          }
          className="h-auto w-full border-0 bg-transparent p-0 text-[15px] font-semibold text-slate-900 shadow-none outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-0 disabled:cursor-not-allowed disabled:text-slate-400"
        />
      </span>
      {open && (
        <div className="absolute left-2 right-2 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
          {query.isLoading && (
            <p className="px-3 py-3 text-sm text-slate-500">
              Loading available routes…
            </p>
          )}
          {query.isError && (
            <p className="px-3 py-3 text-sm text-red-600">
              Available routes could not be loaded.
            </p>
          )}
          {!query.isLoading && !query.isError && query.data?.length === 0 && (
            <p className="px-3 py-3 text-sm text-slate-500">
              No matching package destination.
            </p>
          )}
          {query.data?.map((location) => (
            <button
              key={location.id}
              type="button"
              onMouseDown={() => onSelect(location)}
              className="min-h-11 w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
            >
              <span className="block text-sm font-semibold text-slate-900">
                {location.label}
              </span>
              <span className="block text-xs text-slate-500">
                {location.city}, {location.country}
              </span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}
