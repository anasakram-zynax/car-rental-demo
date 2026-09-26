"use client";
import { useTranslations } from 'next-intl';


import { FilterChip } from "./filter-chip";

export type FilterKey = "free_cancellation" | "breakfast" | "half_board" | "full_board";

export const FILTER_OPTIONS: { key: FilterKey; label: string; description: string }[] = [
  { key: "free_cancellation", label: "Free cancellation", description: "Refundable rates only" },
  { key: "breakfast", label: "Breakfast", description: "Board includes breakfast" },
  { key: "half_board", label: "Half board", description: "Half board meals included" },
  { key: "full_board", label: "Full board", description: "Full board meals included" },
];

interface RoomFilterBarProps {
  activeFilters: Set<FilterKey>;
  onToggle: (key: FilterKey) => void;
  onReset: () => void;
  roomCount: number;
  rateCount: number;
  sortAsc: boolean;
  onToggleSort: () => void;
}

export function RoomFilterBar({
  activeFilters,
  onToggle,
  onReset,
  roomCount,
  rateCount,
  sortAsc,
  onToggleSort,
}: RoomFilterBarProps) {
  const t = useTranslations('Checkout');
  const hasActiveFilters = activeFilters.size > 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#7d7d7d] dark:text-gray-500">
        <span className="font-semibold text-charcoal dark:text-white">
          {roomCount}
        </span>{" "}
        room type{roomCount !== 1 ? "s" : ""} ·{" "}
        <span className="font-semibold text-charcoal dark:text-white">
          {rateCount}
        </span>{" "}
        rate{rateCount !== 1 ? "s" : ""} available
      </p>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTER_OPTIONS.map((f) => (
          <FilterChip
            key={f.key}
            label={f.label}
            active={activeFilters.has(f.key)}
            onClick={() => onToggle(f.key)}
          />
        ))}
        <FilterChip
          label={sortAsc ? "Price: Low → High" : "Price: High → Low"}
          active={false}
          onClick={onToggleSort}
        />
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1.5 text-xs font-medium text-[#7d7d7d] transition hover:text-charcoal"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
