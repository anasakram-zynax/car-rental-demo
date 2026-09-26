'use client';
import { useTranslations } from 'next-intl';

import type { FlightFilters, HotelFilters } from '@/lib/filters/types';
import { countActiveFilters } from '@/lib/filters/types';
import { useCurrencyDisplay } from '@/context/CurrencyContext';

interface ActiveFilterChipsProps {
  filters: FlightFilters | HotelFilters;
  onReset: () => void;
  resultCount: number;
  totalCount: number;
  mode?: 'flights' | 'hotels';
}

function extractActiveFilters(filters: FlightFilters | HotelFilters, currencySymbol: string): Array<{ label: string; group: string }> {
  const chips: Array<{ label: string; group: string }> = [];

  if ('flightNumber' in filters && filters.flightNumber) {
    chips.push({ label: `Flight: ${filters.flightNumber}`, group: 'flightNumber' });
  }
  if ('hotelName' in filters && filters.hotelName) {
    chips.push({ label: filters.hotelName, group: 'hotelName' });
  }

  if ('stops' in filters && filters.stops) {
    const labels: Record<string, string> = { '0': 'Direct', '1': '1 Stop', '2+': '2+ Stops' };
    chips.push({ label: labels[filters.stops] ?? filters.stops, group: 'stops' });
  }

  if ('airlines' in filters && filters.airlines?.length) {
    filters.airlines.forEach((a) => chips.push({ label: a, group: 'airlines' }));
  }

  if ('cabinClasses' in filters && filters.cabinClasses?.length) {
    filters.cabinClasses.forEach((c) => chips.push({ label: c, group: 'cabinClass' }));
  }

  if ('departureTimes' in filters && filters.departureTimes?.length) {
    const labels: Record<string, string> = {
      early_morning: 'Early Morning', morning: 'Morning',
      afternoon: 'Afternoon', evening: 'Evening',
    };
    filters.departureTimes.forEach((t) => chips.push({ label: labels[t] ?? t, group: 'departure' }));
  }

  if ('arrivalTimes' in filters && filters.arrivalTimes?.length) {
    const labels: Record<string, string> = {
      early_morning: 'Arrive Early', morning: 'Arrive Morning',
      afternoon: 'Arrive Afternoon', evening: 'Arrive Evening',
    };
    filters.arrivalTimes.forEach((t) => chips.push({ label: labels[t] ?? t, group: 'arrival' }));
  }

  if ('refundable' in filters && filters.refundable) {
    chips.push({ label: 'Refundable', group: 'refundable' });
  }

  if ('baggageIncluded' in filters && filters.baggageIncluded) {
    const labels: Record<string, string> = { included: 'Baggage Included', paid: 'Baggage Paid' };
    chips.push({ label: labels[filters.baggageIncluded] ?? filters.baggageIncluded, group: 'baggage' });
  }

  if ('starRating' in filters && filters.starRating?.length) {
    filters.starRating.forEach((s) => chips.push({ label: `${s} Star`, group: 'starRating' }));
  }

  if ('propertyTypes' in filters && filters.propertyTypes?.length) {
    filters.propertyTypes.forEach((p) => chips.push({ label: p, group: 'propertyType' }));
  }

  if ('amenities' in filters && filters.amenities?.length) {
    filters.amenities.forEach((a) => chips.push({ label: a, group: 'amenities' }));
  }

  if ('mealOptions' in filters && filters.mealOptions?.length) {
    filters.mealOptions.forEach((m) => chips.push({ label: m, group: 'mealOptions' }));
  }

  if ('freeCancellation' in filters && filters.freeCancellation) {
    chips.push({ label: 'Free Cancellation', group: 'freeCancellation' });
  }

  if (filters.priceMin != null || filters.priceMax != null) {
    const min = filters.priceMin ?? 0;
    const max = filters.priceMax ?? '∞';
    chips.push({ label: `${currencySymbol}${min} - ${currencySymbol}${max}`, group: 'price' });
  }

  return chips;
}

export function ActiveFilterChips({
  filters,
  onReset,
  resultCount,
  totalCount,
}: ActiveFilterChipsProps) {
  const t = useTranslations('Flights');
  const { selectedCurrency } = useCurrencyDisplay();
  const activeCount = countActiveFilters(filters);
  const chips = extractActiveFilters(filters, selectedCurrency.symbol);

  if (activeCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <span className="text-xs font-medium text-zinc-500">
        {totalCount > 0 ? (
          <>{totalCount} total &bull; {resultCount} match your filters</>
        ) : (
          <>{resultCount} results</>
        )}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip, i) => (
          <span
            key={`${chip.group}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-brand-teal/5 px-2.5 py-1 text-[11px] font-medium text-brand-teal ring-1 ring-brand-teal/10"
          >
            {chip.label}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-500 transition-all hover:border-zinc-300 hover:text-zinc-700 active:scale-[0.96]"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Clear all
      </button>
    </div>
  );
}
