"use client";

import * as Slider from "@radix-ui/react-slider";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CarSearchFormProps {
  cities: string[];
  selectedCity?: string;
  currency: string;
  priceBounds: [number, number];
  priceValue: [number, number];
  hasActiveFilters: boolean;
  disabled?: boolean;
  onCityChange: (city?: string) => void;
  onPriceChange: (value: [number, number]) => void;
  onPriceCommit: (value: [number, number]) => void;
  onReset: () => void;
}

export function CarSearchForm({
  cities,
  currency,
  disabled = false,
  hasActiveFilters,
  onCityChange,
  onPriceChange,
  onPriceCommit,
  onReset,
  priceBounds,
  priceValue,
  selectedCity,
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

      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-foreground">Location</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={!selectedCity}
            onClick={() => onCityChange()}
            className={cn(
              "min-h-10 rounded-control border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
              !selectedCity
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface-elevated text-muted hover:text-foreground",
            )}
          >
            All
          </button>
          {cities.map((city) => (
            <button
              key={city}
              type="button"
              aria-pressed={selectedCity === city}
              onClick={() => onCityChange(city)}
              className={cn(
                "min-h-10 rounded-control border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
                selectedCity === city
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-elevated text-muted hover:text-foreground",
              )}
            >
              {city}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold text-foreground">Daily price</legend>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-muted">
          <span>{formatCurrency(priceValue[0], currency)}</span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
          <span>{formatCurrency(priceValue[1], currency)}</span>
        </div>
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
            aria-label="Minimum daily price"
            className="block size-5 rounded-full border-2 border-white bg-accent-secondary shadow-[0_2px_10px_rgba(21,27,35,0.28)] outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          />
          <Slider.Thumb
            aria-label="Maximum daily price"
            className="block size-5 rounded-full border-2 border-white bg-accent-secondary shadow-[0_2px_10px_rgba(21,27,35,0.28)] outline-none transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--ring)] disabled:opacity-50"
          />
        </Slider.Root>
        <p className="mt-2 text-xs leading-5 text-muted">
          Drag either handle. Results update when you release it.
        </p>
      </fieldset>
    </div>
  );
}
