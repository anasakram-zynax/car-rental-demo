"use client";
import { useTranslations } from 'next-intl';


import { useMemo, useState, useEffect, useCallback } from "react";
import { ErrorBox } from "@/components/ui/state/error-box";
import { decodeSeat as decodeSeatBase, decodeBaggage, decodeService, decodeMeal } from "@/features/flights/utils/ancillary-utils";
import { useCurrency } from "@/context/CurrencyContext";
import type { DecodedSeat } from "@/features/flights/utils/ancillary-utils";
import { SeatMapModal } from "./seat-map-modal";
import { BaggageOptionsModal } from "./baggage-options-modal";
import {
  unifiedSeatsToApiData,
  catalogBaggageToApiOptions,
  catalogMealsToMealOptions,
} from "@/features/flights/api/ancillaries";
import { useFlightAncillaryCatalog } from "@/features/flights/hooks";
import type {
  ApiSeatData,
  ApiBaggageOption,
  SeatMapRowLayout,
  UnifiedAncillaryCatalog,
  IncludedBaggage,
  PaidBaggage,
  UnifiedMealOption,
  AncillaryCatalogOption,
} from "@/features/flights/api/ancillaries";
import { MealOptionsModal } from "./meal-options-modal";
import { ServiceOptionsModal } from "./services-options-modal";
import type { MealOption as CatalogMealOption } from "./meal-options-modal";

type SeatOption = DecodedSeat & { id: string };

type BaggageSelection = {
  productId: string;
  label: string;
  priceText?: string;
  travelerRef?: string;
};

export type AncillaryPriceSummary = {
  seats: number;
  baggage: number;
  services: number;
  meals: number;
  total: number;
  currency: string;
};

interface Props {
  offerId: string;
  searchKey?: string;
  snapshotId?: string;
  from?: string;
  to?: string;
  departureDate: string;
  travelerCount: number;
  provider?: string;
  seatProductIds: string[];
  baggageProductIds: string[];
  serviceProductIds: string[];
  mealSelectionIds: string[];
  onSeatProductIdsChange(next: string[]): void;
  onBaggageProductIdsChange(next: string[]): void;
  onServiceProductIdsChange(next: string[]): void;
  onMealSelectionIdsChange(next: string[]): void;
  travelerNames?: string[];
  sessionCatalog?: {
    baggage: AncillaryCatalogOption[];
    services: AncillaryCatalogOption[];
    meals: AncillaryCatalogOption[];
    unavailableReasons?: {
      baggage?: string;
      services?: string;
      meals?: string;
    };
  };
  onAncillaryTotalChange?: (summary: AncillaryPriceSummary) => void;
  /** Included baggage label from the fare (e.g. "Carry-on + Checked bag") */
  includedBaggageLabel?: string;
  /** Supplier/charge currency for the offer (e.g. "USD") — used as fallback when price text is unavailable */
  supplierCurrency?: string;
  /** When false, catalog fetch is disabled (e.g. until traveler form submitted). Default true. */
  enabled?: boolean;
}

/* ─── Tile Icons ─── */

function SeatIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    </svg>
  );
}

function BaggageIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function MealIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12" />
    </svg>
  );
}

function ServicesIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

/* ─── AncillaryTile ─── */

type SummaryItem = { text: string; price?: string; id?: string };

type AncillaryTileProps = {
  icon: React.ReactNode;
  title: string;
  statusLabel: string;
  priceLabel?: string;
  summaryItems?: SummaryItem[];
  selectedCount: number;
  hasSelections: boolean;
  disabled?: boolean;
  loading?: boolean;
  unavailableReason?: string;
  actionLabel: string;
  onClick: () => void;
  onRemoveItem?: (id: string) => void;
};

function AncillaryTile({
  icon,
  title,
  statusLabel,
  priceLabel,
  summaryItems,
  selectedCount,
  hasSelections,
  disabled,
  loading,
  unavailableReason,
  actionLabel,
  onClick,
  onRemoveItem,
}: AncillaryTileProps) {
  const isUnavailable = !!unavailableReason;
  return (
    <div
      className={`group relative flex flex-col rounded-2xl border transition-all duration-200 ${
        hasSelections
          ? "border-brand-teal/30 bg-white shadow-sm shadow-brand-teal/5"
          : "border-zinc-200/80 bg-white hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-100"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3.5 px-5 pt-5 pb-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
            hasSelections
              ? "bg-brand-teal text-white shadow-sm shadow-brand-teal/20"
              : "bg-zinc-100 text-zinc-400 group-hover:bg-zinc-150 group-hover:text-zinc-500"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-zinc-900 tracking-tight">{title}</h3>
          <p className="text-[11px] text-zinc-400 mt-0.5 truncate">{statusLabel}</p>
        </div>
        {selectedCount > 0 && (
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-teal px-1.5 text-[10px] font-bold text-white tabular-nums">
            {selectedCount}
          </span>
        )}
      </div>

      {/* Summary items — each with inline remove */}
      {summaryItems && summaryItems.length > 0 && (
        <div className="mx-4 mb-3 space-y-1.5">
          {summaryItems.map((item, i) => (
            <div
              key={item.id ?? i}
              className="flex items-center justify-between gap-2 rounded-xl bg-zinc-50/80 border border-zinc-100 px-3 py-2 transition-colors hover:bg-zinc-50"
            >
              <span className="text-[11px] font-medium text-zinc-600 truncate">{item.text}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {item.price && (
                  <span className="text-[11px] font-semibold tabular-nums text-zinc-700">{item.price}</span>
                )}
                {onRemoveItem && item.id && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRemoveItem(item.id!); }}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-red-50 hover:text-red-500 cursor-pointer"
                    title="Remove"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Price hint */}
      {priceLabel && !hasSelections && (
        <div className="px-5 pb-1">
          <span className="text-[11px] font-medium tabular-nums text-zinc-400">{priceLabel}</span>
        </div>
      )}

      {/* Unavailable reason */}
      {isUnavailable && (
        <div className="mx-4 mb-3 rounded-xl bg-amber-50/80 border border-amber-100 px-3.5 py-2.5">
          <p className="text-[11px] text-amber-600 leading-snug">{unavailableReason}</p>
        </div>
      )}

      {/* Action */}
      <div className="mt-auto px-5 pb-5 pt-2">
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-zinc-200 border-t-brand-teal" />
            Loading...
          </div>
        ) : (
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full rounded-xl px-4 py-2.5 text-[12px] font-semibold tracking-tight transition-all duration-150 cursor-pointer ${
              hasSelections
                ? "bg-brand-teal/8 text-brand-teal hover:bg-brand-teal/15"
                : isUnavailable
                  ? "bg-zinc-100 text-zinc-400 cursor-default"
                  : "bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 shadow-sm"
            } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Helpers ─── */

function decodeSeat(value: string): SeatOption | undefined {
  const base = decodeSeatBase(value);
  if (!base) return undefined;
  return { ...base, id: value };
}

function decodeBaggageSelection(value: string): BaggageSelection | undefined {
  return decodeBaggage(value);
}

/* ─── Main Component ─── */

export function AncillarySelectionPanel(props: Props) {
  const t = useTranslations('Booking');
  const { formatPrice, selectedCurrency } = useCurrency();
  const [error, setError] = useState<string | null>(null);
  const [showSeatMap, setShowSeatMap] = useState(false);
  const [showBaggageOptions, setShowBaggageOptions] = useState(false);
  const [showMealOptions, setShowMealOptions] = useState(false);
  const [showServiceOptions, setShowServiceOptions] = useState(false);

  const [apiSeatData, setApiSeatData] = useState<ApiSeatData[] | undefined>(undefined);
  const [seatMapLayout, setSeatMapLayout] = useState<SeatMapRowLayout[] | undefined>(undefined);
  const [earlyExitCatalog, setEarlyExitCatalog] = useState<UnifiedAncillaryCatalog | null>(null);
  const [seatsLoading, setSeatsLoading] = useState(false);

  const hasCacheContext = !!(props.searchKey && props.offerId);

  // React Query: POST /flights/ancillaries/catalog/v2
  const { data: fetchedCatalog, isLoading: fetchLoading } = useFlightAncillaryCatalog(
    {
      searchKey: props.searchKey ?? '',
      offerId: props.offerId,
      travelerCount: props.travelerCount,
      provider: props.provider,
      includedBaggageLabel: props.includedBaggageLabel,
      snapshotId: props.snapshotId,
      displayCurrency: selectedCurrency.code,
    },
    { enabled: props.enabled !== false && hasCacheContext && !props.sessionCatalog },
  );

  const unifiedCatalog = fetchedCatalog ?? earlyExitCatalog;
  const catalogLoading = fetchLoading && !fetchedCatalog;

  // Derived state from unified catalog
  const paidBaggage = unifiedCatalog?.baggage?.paid ?? [];
  const includedBaggage = unifiedCatalog?.baggage?.included ?? [];
  const catalogMeals = unifiedCatalog?.meals ?? [];
  const unavailableReasons = unifiedCatalog?.unavailable ?? {};

  const baggageUnavailable = !catalogLoading && paidBaggage.length === 0 && !!unavailableReasons.paidBaggage && !catalogLoading;
  const mealsUnavailable = !catalogLoading && catalogMeals.length === 0 && !!unavailableReasons.meals && !catalogLoading;

  // Effective included baggage label: prefer unified catalog response, fallback to URL prop
  const effectiveIncludedBaggageLabel = includedBaggage.length > 0
    ? includedBaggage.map((ib) => ib.summaryLabel).join(' + ')
    : props.includedBaggageLabel;

  async function openSeatMap() {
    setError(null);
    setShowSeatMap(true);
    setSeatsLoading(true);
    setApiSeatData(undefined);
    setSeatMapLayout(undefined);
    try {
      // Use seat data from the unified catalog (already fetched on mount)
      if (unifiedCatalog?.seats && unifiedCatalog.seats.length > 0) {
        const { apiSeatData: seatData, layout: seatLayout } = unifiedSeatsToApiData(unifiedCatalog.seats);
        setApiSeatData(seatData);
        setSeatMapLayout(seatLayout);
      } else if (hasCacheContext) {
        // Fallback: catalog doesn't have seats yet, show unavailable
        setError(unifiedCatalog?.unavailable?.seats ?? "Seat map unavailable for this flight.");
      }
    } catch {
      setError("Unable to load seat map. Please try again.");
    } finally {
      setSeatsLoading(false);
    }
  }

  /* ── Price calculations ── */

  // Build price lookup maps from the backend catalog (structured pricing)
  const seatPriceMap = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string }>();
    for (const segment of unifiedCatalog?.seats ?? []) {
      for (const cabin of segment.cabins ?? []) {
        for (const row of cabin.rows ?? []) {
          for (const el of row.elements ?? []) {
            if (el.type !== 'seat' || !el.seatNumber) continue;
            const key = el.supplierRef?.raw?.serviceId as string ?? el.seatNumber;
            map.set(key, el.pricing.displayPrice ?? el.pricing.supplierPrice);
          }
        }
      }
    }
    return map;
  }, [unifiedCatalog]);

  const baggagePriceMap = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string }>();
    for (const b of paidBaggage) {
      map.set(b.id, b.pricing.displayPrice ?? b.pricing.supplierPrice);
    }
    return map;
  }, [paidBaggage]);

  const servicePriceMap = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string }>();
    for (const s of unifiedCatalog?.services ?? []) {
      map.set(s.id, s.pricing.displayPrice ?? s.pricing.supplierPrice);
    }
    return map;
  }, [unifiedCatalog]);

  const mealPriceMap = useMemo(() => {
    const map = new Map<string, { amount: number; currency: string }>();
    for (const m of catalogMeals) {
      map.set(m.id, m.pricing.displayPrice ?? m.pricing.supplierPrice);
    }
    return map;
  }, [catalogMeals]);

  // Derive display currency from the first available pricing block
  const displayCurrency = useMemo(() => {
    // Prefer the catalog's display currency from any pricing block
    for (const segment of unifiedCatalog?.seats ?? []) {
      for (const cabin of segment.cabins ?? []) {
        for (const row of cabin.rows ?? []) {
          for (const el of row.elements ?? []) {
            if (el.pricing.displayPrice?.currency) return el.pricing.displayPrice.currency;
          }
        }
      }
    }
    for (const b of paidBaggage) {
      if (b.pricing.displayPrice?.currency) return b.pricing.displayPrice.currency;
    }
    for (const s of unifiedCatalog?.services ?? []) {
      if (s.pricing.displayPrice?.currency) return s.pricing.displayPrice.currency;
    }
    for (const m of catalogMeals) {
      if (m.pricing.displayPrice?.currency) return m.pricing.displayPrice.currency;
    }
    return props.supplierCurrency ?? selectedCurrency.code;
  }, [unifiedCatalog, paidBaggage, catalogMeals, props.supplierCurrency, selectedCurrency.code]);

  const seatTotal = useMemo(() => {
    return props.seatProductIds.reduce((sum, id) => {
      const decoded = decodeSeat(id);
      if (!decoded) return sum;
      const key = decoded.ancillaryProductId ?? decoded.seat;
      const price = seatPriceMap.get(key);
      if (price) return sum + price.amount;
      return sum; // no catalog match — skip (do not parse from display text)
    }, 0);
  }, [props.seatProductIds, seatPriceMap]);

  const baggageTotal = useMemo(() => {
    return props.baggageProductIds.reduce((sum, id) => {
      const decoded = decodeBaggageSelection(id);
      if (!decoded) return sum;
      const price = baggagePriceMap.get(decoded.productId);
      if (price) return sum + price.amount;
      return sum; // no catalog match — skip (do not parse from display text)
    }, 0);
  }, [props.baggageProductIds, baggagePriceMap]);

  const serviceTotal = useMemo(() => {
    return props.serviceProductIds.reduce((sum, id) => {
      const decoded = decodeService(id);
      if (!decoded) return sum;
      const price = servicePriceMap.get(decoded.productId);
      if (price) return sum + price.amount;
      return sum; // no catalog match — skip (do not parse from display text)
    }, 0);
  }, [props.serviceProductIds, servicePriceMap]);

  const mealTotal = useMemo(() => {
    return props.mealSelectionIds.reduce((sum, id) => {
      if (!id) return sum;
      const decoded = decodeMeal(id);
      if (!decoded) return sum;
      const price = mealPriceMap.get(decoded.productId);
      if (price) return sum + price.amount;
      return sum; // no catalog match — skip (do not parse from display text)
    }, 0);
  }, [props.mealSelectionIds, mealPriceMap]);

  const currencyText = useMemo(() => {
    return displayCurrency;
  }, [displayCurrency]);

  // Summary-tile price text — always the backend display price (converted to
  // the selected currency), never the raw supplier priceText baked into the
  // encoded selection id. Falls back to the encoded text only when the item
  // has no catalog match (keeps honest rather than hiding the row).
  const displayPriceText = (
    price: { amount: number; currency: string } | undefined,
    fallback?: string,
  ): string | undefined =>
    price
      ? formatPrice(price.amount, price.currency)
      : fallback;

  const mealCount = useMemo(() => props.mealSelectionIds.filter(Boolean).length, [props.mealSelectionIds]);

  /* ── Notify parent of totals ── */
  useEffect(() => {
    props.onAncillaryTotalChange?.({
      seats: seatTotal,
      baggage: baggageTotal,
      services: serviceTotal,
      meals: mealTotal,
      total: seatTotal + baggageTotal + serviceTotal + mealTotal,
      currency: currencyText,
    });
  }, [seatTotal, baggageTotal, serviceTotal, mealTotal, currencyText, props.onAncillaryTotalChange]);

  /* ── Inline remove handlers ── */
  const removeSeat = useCallback((encodedId: string) => {
    props.onSeatProductIdsChange(props.seatProductIds.filter((s) => s !== encodedId));
  }, [props.seatProductIds, props.onSeatProductIdsChange]);

  const removeBaggage = useCallback((encodedId: string) => {
    props.onBaggageProductIdsChange(props.baggageProductIds.filter((b) => b !== encodedId));
  }, [props.baggageProductIds, props.onBaggageProductIdsChange]);

  const removeMeal = useCallback((encodedId: string) => {
    props.onMealSelectionIdsChange(props.mealSelectionIds.map((m) => m === encodedId ? "" : m));
  }, [props.mealSelectionIds, props.onMealSelectionIdsChange]);

  const removeService = useCallback((encodedId: string) => {
    props.onServiceProductIdsChange(props.serviceProductIds.filter((s) => s !== encodedId));
  }, [props.serviceProductIds, props.onServiceProductIdsChange]);

  /* ── Seat tile data ── */
  const seatSummaryItems = useMemo(() => {
    return props.seatProductIds.map((id) => {
      const decoded = decodeSeat(id);
      if (!decoded) return null;
      const paxIdx = decoded.passengerIndex ?? 0;
      const paxName = props.travelerNames?.[paxIdx];
      const key = decoded.ancillaryProductId ?? decoded.seat;
      return {
        id,
        text: `${decoded.seat}${paxName ? ` · ${paxName}` : ""}`,
        price: displayPriceText(seatPriceMap.get(key), decoded.priceText || undefined),
      };
    }).filter(Boolean) as SummaryItem[];
  }, [props.seatProductIds, props.travelerNames, seatPriceMap, displayPriceText]);

  const seatStatus = useMemo(() => {
    if (catalogLoading) return "Loading seats...";
    if (props.seatProductIds.length === 0) return "No seat selected";
    return `${props.seatProductIds.length} selected`;
  }, [props.seatProductIds, catalogLoading]);

  /* ── Baggage tile data ── */
  const baggageSummaryItems = useMemo(() => {
    // Decode selected baggage from encoded IDs
    const selectedItems = props.baggageProductIds.map((id) => {
      const decoded = decodeBaggageSelection(id);
      if (!decoded) return null;
      return {
        id,
        text: decoded.label,
        price: displayPriceText(baggagePriceMap.get(decoded.productId), decoded.priceText || "Free"),
      };
    }).filter(Boolean) as SummaryItem[];

    // If no selections but we have included baggage, show it
    if (selectedItems.length === 0 && effectiveIncludedBaggageLabel) {
      return [{ id: '__included', text: effectiveIncludedBaggageLabel, price: undefined }];
    }

    return selectedItems;
  }, [props.baggageProductIds, effectiveIncludedBaggageLabel, baggagePriceMap, displayPriceText]);

  const baggageStatus = useMemo(() => {
    if (catalogLoading) return "Loading baggage...";
    if (props.baggageProductIds.length > 0) return `${props.baggageProductIds.length} added`;
    if (effectiveIncludedBaggageLabel) return "Included";
    if (baggageUnavailable) return unavailableReasons.paidBaggage ?? "Not available";
    return "Included baggage";
  }, [props.baggageProductIds, baggageUnavailable, unavailableReasons.paidBaggage, effectiveIncludedBaggageLabel, catalogLoading]);

  /* ── Meals tile data ── */
  const mealSummaryItems = useMemo(() => {
    return props.mealSelectionIds
      .filter(Boolean)
      .map((id) => {
        const decoded = decodeMeal(id);
        if (!decoded) return null;
        const price = mealPriceMap.get(decoded.productId);
        return { id, text: decoded.mealName, price: price && price.amount > 0 ? displayPriceText(price) : undefined };
      })
      .filter(Boolean) as SummaryItem[];
  }, [props.mealSelectionIds, mealPriceMap, displayPriceText]);

  const mealStatus = useMemo(() => {
    if (mealsUnavailable) return unavailableReasons.meals ?? "Not available";
    if (mealCount === 0) return "Free request";
    return `${mealCount} selected`;
  }, [mealCount, mealsUnavailable, unavailableReasons.meals]);

  /* ── Handlers ── */
  function handleSeatMapConfirm(encodedSeats: string[]) {
    props.onSeatProductIdsChange(encodedSeats);
    setShowSeatMap(false);
  }

  function handleBaggageConfirm(encodedBaggage: string[]) {
    props.onBaggageProductIdsChange(encodedBaggage);
    setShowBaggageOptions(false);
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      {/* ── Tile Grid — 2 equal columns ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Seats */}
        <AncillaryTile
          icon={<SeatIcon />}
          title="Seats"
          statusLabel={catalogLoading ? "Loading seats..." : seatStatus}
          priceLabel={props.seatProductIds.length === 0 ? "Choose your seat" : undefined}
          summaryItems={seatSummaryItems.length > 0 ? seatSummaryItems : undefined}
          selectedCount={props.seatProductIds.length}
          hasSelections={props.seatProductIds.length > 0}
          disabled={catalogLoading}
          loading={seatsLoading}
          actionLabel={props.seatProductIds.length > 0 ? "Change seat" : "View seat map"}
          onClick={catalogLoading ? () => {} : openSeatMap}
          onRemoveItem={removeSeat}
        />

        {/* Baggage */}
        <AncillaryTile
          icon={<BaggageIcon />}
          title="Baggage"
          statusLabel={catalogLoading ? "Loading baggage..." : baggageStatus}
          priceLabel={
            props.baggageProductIds.length > 0
              ? `${props.baggageProductIds.length} bag${props.baggageProductIds.length !== 1 ? "s" : ""}`
              : effectiveIncludedBaggageLabel
                ? undefined
                : baggageUnavailable
                  ? undefined
                  : "Included"
          }
          summaryItems={
            baggageSummaryItems.length > 0
              ? baggageSummaryItems
              : effectiveIncludedBaggageLabel && props.baggageProductIds.length === 0
                ? [{ id: '__included', text: effectiveIncludedBaggageLabel, price: undefined }]
                : undefined
          }
          selectedCount={props.baggageProductIds.length}
          hasSelections={props.baggageProductIds.length > 0}
          loading={catalogLoading}
          unavailableReason={
            baggageUnavailable && !effectiveIncludedBaggageLabel
              ? unavailableReasons.paidBaggage
              : undefined
          }
          actionLabel={
            props.baggageProductIds.length > 0
              ? "View baggage"
              : effectiveIncludedBaggageLabel
                ? "View details"
                : baggageUnavailable
                  ? unavailableReasons.paidBaggage ?? "Unavailable"
                  : "Add baggage"
          }
          onClick={catalogLoading ? () => {} : () => { setError(null); setShowBaggageOptions(true); }}
          disabled={catalogLoading || (baggageUnavailable && !effectiveIncludedBaggageLabel)}
          onRemoveItem={removeBaggage}
        />

        {/* Meals */}
        <AncillaryTile
          icon={<MealIcon />}
          title="Meals"
          statusLabel={catalogLoading ? "Loading meals..." : mealStatus}
          summaryItems={mealSummaryItems.length > 0 ? mealSummaryItems : undefined}
          selectedCount={mealCount}
          hasSelections={mealCount > 0}
          loading={catalogLoading}
          unavailableReason={
            mealsUnavailable ? unavailableReasons.meals : undefined
          }
          actionLabel={
            mealsUnavailable
              ? unavailableReasons.meals ?? "Unavailable"
              : mealCount > 0
                ? "View meals"
                : "Select meals"
          }
          onClick={catalogLoading || mealsUnavailable ? () => {} : () => { setError(null); setShowMealOptions(true); }}
          disabled={catalogLoading || mealsUnavailable}
          onRemoveItem={removeMeal}
        />

        {/* Extra Services */}
        <AncillaryTile
          icon={<ServicesIcon />}
          title="Services"
          statusLabel={
            catalogLoading ? "Loading..."
            : props.serviceProductIds.length > 0
              ? `${props.serviceProductIds.length} selected`
              : (unifiedCatalog?.services ?? []).length > 0
                ? `${(unifiedCatalog?.services ?? []).length} available`
                : "Not available"
          }
          summaryItems={props.serviceProductIds.length > 0
            ? props.serviceProductIds.map((id) => {
                const decoded = decodeService(id);
                if (!decoded) return null;
                return { id, text: decoded.label, price: displayPriceText(servicePriceMap.get(decoded.productId), decoded.priceText) };
              }).filter(Boolean) as SummaryItem[]
            : undefined
          }
          selectedCount={props.serviceProductIds.length}
          hasSelections={props.serviceProductIds.length > 0}
          loading={catalogLoading}
          unavailableReason={
            (unifiedCatalog?.services ?? []).length === 0 && !catalogLoading
              ? unavailableReasons.services
              : undefined
          }
          actionLabel={
            props.serviceProductIds.length > 0
              ? "View services"
              : "Add services"
          }
          onClick={catalogLoading ? () => {} : () => { setError(null); setShowServiceOptions(true); }}
          disabled={catalogLoading || (unifiedCatalog?.services ?? []).length === 0}
          onRemoveItem={removeService}
        />


      </div>

      {/* ── Modals ── */}
      <SeatMapModal
        isOpen={showSeatMap}
        onClose={() => setShowSeatMap(false)}
        flightLabel={`${props.from ?? ""} → ${props.to ?? ""}`}
        travelerCount={props.travelerCount}
        existingSelections={props.seatProductIds}
        onConfirm={handleSeatMapConfirm}
        apiSeatData={apiSeatData}
        layout={seatMapLayout}
        loading={seatsLoading}
        travelerNames={props.travelerNames}
        formatPrice={formatPrice}
      />

      <BaggageOptionsModal
        isOpen={showBaggageOptions}
        onClose={() => setShowBaggageOptions(false)}
        existingSelections={props.baggageProductIds}
        onConfirm={handleBaggageConfirm}
        apiBaggageOptions={paidBaggage.map((b) => ({
          productId: b.id,
          label: b.label,
          description: b.description ?? '',
          weight: b.description ?? '23 kg',
          maxSize: '158 cm (total)',
          priceAmount: b.pricing.supplierPrice.amount,
          currency: b.pricing.supplierPrice.currency,
          icon: 'suitcase' as const,
        }))}
        loading={catalogLoading}
        error={unavailableReasons.paidBaggage}
        includedBaggageLabel={effectiveIncludedBaggageLabel}
        formatPrice={formatPrice}
      />

      <MealOptionsModal
        isOpen={showMealOptions}
        onClose={() => setShowMealOptions(false)}
        existingMealIds={props.mealSelectionIds}
        onConfirm={(ids) => { props.onMealSelectionIdsChange(ids); setShowMealOptions(false); }}
        catalogMealOptions={catalogMeals.map((m) => ({
          productId: m.id,
          mealName: m.mealName,
          mealCode: m.mealCode,
          dietaryType: m.dietaryType ?? '',
          description: m.description ?? '',
          price: m.pricing?.supplierPrice?.amount ?? 0,
          currency: m.pricing?.supplierPrice?.currency ?? 'USD',
        }))}
        catalogMealsLoading={catalogLoading}
        catalogMealsError={unavailableReasons.meals}
        travelerCount={props.travelerCount}
        formatPrice={formatPrice}
      />

      <ServiceOptionsModal
        isOpen={showServiceOptions}
        onClose={() => setShowServiceOptions(false)}
        existingSelections={props.serviceProductIds}
        onConfirm={(encoded) => { props.onServiceProductIdsChange(encoded); setShowServiceOptions(false); }}
        apiServiceOptions={(unifiedCatalog?.services ?? []).map((s) => ({
          productId: s.id,
          label: s.label,
          description: s.description ?? '',
          serviceType: s.id,
          priceAmount: s.pricing.supplierPrice.amount,
          currency: s.pricing.supplierPrice.currency,
        }))}
        loading={catalogLoading}
        error={unavailableReasons.services}
        travelerCount={props.travelerCount}
        formatPrice={formatPrice}
      />

    </div>
  );
}
