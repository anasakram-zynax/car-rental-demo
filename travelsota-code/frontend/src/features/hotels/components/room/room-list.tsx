"use client";
import { useTranslations } from 'next-intl';


import { useMemo, useState, useCallback } from "react";
import { RoomCard } from "./room-card";
import { RoomFilterBar, type FilterKey } from "./room-filter-bar";
import { buildRoomView } from "./room-view-model";
import type { EnrichedProviderSection, EnrichedRate } from "../../api/get-hotel-details";
import type { GroupedRoom } from "../../api/get-hotel-details";
import { isFreeCancellationRate } from "@/lib/filters/hotel-filters";

export interface RequestedOccupancy {
  rooms: Array<{ adults: number; children: number; childAges: number[] }>;
  totalAdults: number;
  totalChildren: number;
  totalGuests: number;
  roomCount: number;
}

interface RoomListProps {
  providerSections: EnrichedProviderSection[];
  selectedRateKey: string | null;
  nights: number;
  onSelect: (rateId: string) => void;
  requestedOccupancy?: RequestedOccupancy | null;
  /** Hotel gallery images â€” fallback when a room has no photos. */
  galleryImages?: string[];
}

// â”€â”€ Filter helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function rateMatchesFilter(rate: EnrichedRate, filter: FilterKey): boolean {
  switch (filter) {
    case "free_cancellation":
      return isFreeCancellationRate(rate);
    case "breakfast":
      return /breakfast|bb/i.test(rate.boardName ?? "");
    case "half_board":
      return /half\s*board|hb/i.test(rate.boardName ?? "");
    case "full_board":
      return /full\s*board|fb/i.test(rate.boardName ?? "");
    default:
      return true;
  }
}

/**
 * Apply active filters to a set of rooms.
 * Filters operate on rates â€” a rate matches when it satisfies ALL active filters.
 * Rooms with zero matching rates are hidden entirely.
 * Filtered rooms keep their cheapest-first rate ordering.
 */
function applyFilters(
  rooms: GroupedRoom[],
  activeFilters: Set<FilterKey>,
  sortAsc: boolean,
): GroupedRoom[] {
  if (activeFilters.size === 0 && sortAsc) {
    // No filtering needed, just return sorted copy
    return rooms;
  }

  const filtered: GroupedRoom[] = [];

  for (const room of rooms) {
    // Filter rates by all active filters
    let filteredRates = room.rates;
    for (const filter of activeFilters) {
      filteredRates = filteredRates.filter((r) => rateMatchesFilter(r, filter));
    }

    if (filteredRates.length === 0) continue; // Hide room if no rates remain

    // Sort rates by display price (prefer backend pricing.displayPrice)
    filteredRates.sort(
      (a, b) => (a.pricing?.displayPrice?.amount ?? a.supplierPrice.amount) - (b.pricing?.displayPrice?.amount ?? b.supplierPrice.amount),
    );

    // Recompute fromPrice from cheapest remaining rate — prefer marked prices
    // so room headers never quote raw supplier rates when markup is active.
    const cheapest = filteredRates[0];
    const cheapestDisplay = cheapest.pricing?.displayPrice ?? cheapest.customerPrice ?? cheapest.supplierPrice;

    filtered.push({
      ...room,
      rates: filteredRates,
      rateCount: filteredRates.length,
      fromPrice: {
        amount: cheapestDisplay.amount,
        currency: cheapestDisplay.currency,
      },
    });
  }

  // Sort rooms by fromPrice
  filtered.sort((a, b) =>
    sortAsc
      ? a.fromPrice.amount - b.fromPrice.amount
      : b.fromPrice.amount - a.fromPrice.amount,
  );

  return filtered;
}

/**
 * Categorize rooms by how well they match the requested occupancy.
 *
 * Match tiers:
 * - exact: room capacity == total requested guests (best fit)
 * - larger: room capacity > total requested guests (room for everyone, but oversized)
 * - insufficient: room capacity < total requested guests (can't fit everyone alone)
 */
function categorizeRooms(
  rooms: GroupedRoom[],
  requested: RequestedOccupancy,
): { exact: GroupedRoom[]; larger: GroupedRoom[]; insufficient: GroupedRoom[] } {
  const exact: GroupedRoom[] = [];
  const larger: GroupedRoom[] = [];
  const insufficient: GroupedRoom[] = [];

  for (const room of rooms) {
    const maxGuests = room.roomInfo.occupancy?.maxGuests;
    if (maxGuests == null) {
      // No capacity info â€” treat as alternative (larger)
      larger.push(room);
      continue;
    }
    if (maxGuests === requested.totalGuests) {
      exact.push(room);
    } else if (maxGuests > requested.totalGuests) {
      larger.push(room);
    } else {
      insufficient.push(room);
    }
  }

  return { exact, larger, insufficient };
}

// â”€â”€ Categorized room section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type BadgeKind = "exact" | "larger" | "insufficient";

const BADGE_STYLES: Record<BadgeKind, string> = {
  exact: "bg-emerald-50 text-emerald-700 border-emerald-200",
  larger: "bg-blue-50 text-blue-700 border-blue-200",
  insufficient: "bg-amber-50 text-amber-700 border-amber-200",
};

const BADGE_LABELS: Record<BadgeKind, string> = {
  exact: "Exact match",
  larger: "Larger room",
  insufficient: "Smaller than requested",
};

interface CategorizedSectionProps {
  label: string;
  rooms: GroupedRoom[];
  selectedRateKey: string | null;
  nights: number;
  onSelect: (rateId: string) => void;
  requestedGuests: number;
  badge: BadgeKind;
  galleryImages?: string[];
}

function CategorizedSection({
  label,
  rooms,
  selectedRateKey,
  nights,
  onSelect,
  requestedGuests,
  badge,
  galleryImages = [],
}: CategorizedSectionProps) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <h3 className="text-sm font-semibold text-charcoal dark:text-white">
          {label}
        </h3>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLES[badge]}`}
        >
          {BADGE_LABELS[badge]}
        </span>
        <span className="text-[11px] text-gray-400">
          {rooms.length} option{rooms.length !== 1 ? "s" : ""}
        </span>
      </div>
      {badge === "insufficient" && (
        <p className="mb-3 text-xs text-amber-600">
          These rooms accommodate fewer than {requestedGuests} guests. You may need to book multiple rooms.
        </p>
      )}
      <div className="grid gap-5">
        {rooms.map((room) => (
          <div key={room.roomKey}>
            <RoomCard
              room={room}
              selectedRateKey={selectedRateKey}
              nights={nights}
              onSelect={onSelect}
              occupancyBadge={badge}
              requestedGuests={requestedGuests}
              galleryImages={galleryImages}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function RoomList({
  providerSections,
  selectedRateKey,
  nights,
  onSelect,
  requestedOccupancy,
  galleryImages = [],
}: RoomListProps) {
  const t = useTranslations('Checkout');
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [sortAsc, setSortAsc] = useState(true);

  const rawRooms = useMemo(
    () => buildRoomView(providerSections),
    [providerSections],
  );

  const allFilteredRooms = useMemo(
    () => applyFilters(rawRooms, activeFilters, sortAsc),
    [rawRooms, activeFilters, sortAsc],
  );

  // When occupancy is known, categorize rooms into exact/larger/insufficient
  const categorized = useMemo(() => {
    if (!requestedOccupancy) return null;
    return categorizeRooms(allFilteredRooms, requestedOccupancy);
  }, [allFilteredRooms, requestedOccupancy]);

  const rooms = categorized
    ? [...categorized.exact, ...categorized.larger, ...categorized.insufficient]
    : allFilteredRooms;

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveFilters(new Set());
  }, []);

  const toggleSort = useCallback(() => {
    setSortAsc((prev) => !prev);
  }, []);

  return (
    <div>
      <RoomFilterBar
        activeFilters={activeFilters}
        onToggle={toggleFilter}
        onReset={resetFilters}
        roomCount={rooms.length}
        rateCount={rooms.reduce((sum, r) => sum + r.rates.length, 0)}
        sortAsc={sortAsc}
        onToggleSort={toggleSort}
      />

      <div className="mt-6 grid gap-5">
        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgba(3,61,74,0.12)] py-12 text-center text-sm text-[#7d7d7d] dark:border-white/10 dark:text-gray-500">
            {activeFilters.size > 0
              ? `No rooms match the selected filters.`
              : "No rooms available for this hotel."}
          </div>
        ) : categorized ? (
          <>
            {/* Exact matches section */}
            {categorized.exact.length > 0 && (
              <CategorizedSection
                label="Best match for your search"
                rooms={categorized.exact}
                selectedRateKey={selectedRateKey}
                nights={nights}
                onSelect={onSelect}
                requestedGuests={requestedOccupancy!.totalGuests}
                badge="exact"
                galleryImages={galleryImages}
              />
            )}

            {/* Larger room alternatives */}
            {categorized.larger.length > 0 && (
              <CategorizedSection
                label={categorized.exact.length > 0 ? "Other available rooms" : "Available rooms"}
                rooms={categorized.larger}
                selectedRateKey={selectedRateKey}
                nights={nights}
                onSelect={onSelect}
                requestedGuests={requestedOccupancy!.totalGuests}
                badge="larger"
                galleryImages={galleryImages}
              />
            )}

            {/* Insufficient capacity â€” only show if no exact/larger found */}
            {categorized.insufficient.length > 0 && categorized.exact.length === 0 && categorized.larger.length === 0 && (
              <CategorizedSection
                label="Rooms available (smaller than requested)"
                rooms={categorized.insufficient}
                selectedRateKey={selectedRateKey}
                nights={nights}
                onSelect={onSelect}
                requestedGuests={requestedOccupancy!.totalGuests}
                badge="insufficient"
                galleryImages={galleryImages}
              />
            )}
          </>
        ) : (
          allFilteredRooms.map((room) => (
            <div key={room.roomKey}>
              <RoomCard
                room={room}
                selectedRateKey={selectedRateKey}
                nights={nights}
                onSelect={onSelect}
                galleryImages={galleryImages}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
