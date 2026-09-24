"use client";

import * as Slider from "@radix-ui/react-slider";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";

interface CarSearchFormProps {
  transmissionOptions: string[];
  fuelTypeOptions: string[];
  selectedTransmission?: string;
  selectedFuelType?: string;
  selectedMinBaggage?: number;
  maxBaggage: number;
  currency: string;
  priceBounds: [number, number];
  priceValue: [number, number];
  hasActiveFilters: boolean;
  disabled?: boolean;
  onTransmissionChange: (transmission?: string) => void;
  onFuelTypeChange: (fuelType?: string) => void;
  onMinBaggageChange: (minBaggage?: number) => void;
  onPriceChange: (value: [number, number]) => void;
  onPriceCommit: (value: [number, number]) => void;
  onReset: () => void;
}

export function CarSearchForm({
  currency,
  disabled = false,
  fuelTypeOptions,
  hasActiveFilters,
  maxBaggage,
  onFuelTypeChange,
  onMinBaggageChange,
  onPriceChange,
  onPriceCommit,
  onReset,
  onTransmissionChange,
  priceBounds,
  priceValue,
  selectedFuelType,
  selectedMinBaggage,
  selectedTransmission,
  transmissionOptions,
}: CarSearchFormProps) {
  return (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-[-0.025em]">Filters</h2>
        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" className="-mr-2" onClick={onReset}>
            <RotateCcw aria-hidden="true" size={15} />
            Clear
          </Button>
        ) : null}
      </div>

      <fieldset disabled={disabled} className="grid gap-4">
        <legend className="sr-only">Vehicle filters</legend>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Transmission
          <select
            value={selectedTransmission ?? ""}
            onChange={(event) => onTransmissionChange(event.target.value || undefined)}
            className="h-11 w-full rounded-control border border-border bg-surface-elevated px-3 text-sm font-normal text-foreground shadow-sm outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]"
          >
            <option value="">Any transmission</option>
            {transmissionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Fuel type
          <select
            value={selectedFuelType ?? ""}
            onChange={(event) => onFuelTypeChange(event.target.value || undefined)}
            className="h-11 w-full rounded-control border border-border bg-surface-elevated px-3 text-sm font-normal text-foreground shadow-sm outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]"
          >
            <option value="">Any fuel type</option>
            {fuelTypeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-foreground">
          Minimum baggage
          <select
            value={selectedMinBaggage ?? ""}
            onChange={(event) => onMinBaggageChange(event.target.value ? Number(event.target.value) : undefined)}
            className="h-11 w-full rounded-control border border-border bg-surface-elevated px-3 text-sm font-normal text-foreground shadow-sm outline-none focus:border-accent-secondary focus:ring-4 focus:ring-[var(--ring)]"
          >
            <option value="">Any capacity</option>
            {Array.from({ length: maxBaggage }, (_, index) => index + 1).map((capacity) => (
              <option key={capacity} value={capacity}>{capacity}+ bags</option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-foreground">Price range</legend>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-muted">
          <span>{formatCurrency(priceValue[0], currency)}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span>{formatCurrency(priceValue[1], currency)}</span>
        </div>
        {priceBounds[1] > priceBounds[0] ? (
          <Slider.Root
            className="relative mt-5 flex h-8 w-full touch-none items-center select-none"
            min={priceBounds[0]}
            max={priceBounds[1]}
            step={5}
            minStepsBetweenThumbs={1}
            value={priceValue}
            onValueChange={(value) => onPriceChange([value[0], value[1]])}
            onValueCommit={(value) => onPriceCommit([value[0], value[1]])}
            disabled={disabled}
          >
            <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-black/[0.1]">
              <Slider.Range className="absolute h-full rounded-full bg-accent-secondary" />
            </Slider.Track>
            <Slider.Thumb
              aria-label="Minimum price"
              className="block size-5 rounded-full border-2 border-white bg-accent-secondary shadow-[0_2px_10px_rgba(21,27,35,0.28)] outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            />
            <Slider.Thumb
              aria-label="Maximum price"
              className="block size-5 rounded-full border-2 border-white bg-accent-secondary shadow-[0_2px_10px_rgba(21,27,35,0.28)] outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-50"
            />
          </Slider.Root>
        ) : (
          <p className="mt-4 text-xs leading-5 text-muted">Price options are unavailable for this service.</p>
        )}
        <p className="mt-2 text-xs leading-5 text-muted">
          Drag either handle. Results update when you release it.
        </p>
      </fieldset>
    </div>
  );
}
