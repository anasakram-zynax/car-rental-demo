'use client';
import { useTranslations } from 'next-intl';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { FlightFilters, HotelFilters, FilterGroup, FilterOption } from '@/lib/filters/types';
import { countActiveFilters } from '@/lib/filters/types';
import { PriceRangeSlider } from './PriceRangeSlider';
import { StarRatingFilter } from './StarRatingFilter';
import { useAuth } from '@/hooks/useAuth';
import { useCurrencyDisplay } from '@/context/CurrencyContext';

const ease = [0.16, 1, 0.3, 1] as const;

interface FilterSidebarProps {
  mode: 'flights' | 'hotels';
  flightFilters?: FlightFilters;
  hotelFilters?: HotelFilters;
  onFlightFilterChange?: (filters: FlightFilters) => void;
  onHotelFilterChange?: (filters: HotelFilters) => void;
  dynamicGroups?: FilterGroup[];
  className?: string;
}

type TFn = (key: string, values?: Record<string, string | number>) => string;

function buildHotelGroups(th: TFn, tf: TFn): FilterGroup[] {
  return [
  {
    id: 'price', title: tf('priceRange'),
    icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    type: 'checkbox',
    options: [
      { label: '$0 – $100' }, { label: '$100 – $200' },
      { label: '$200 – $400' }, { label: '$400 – $800' }, { label: '$800+' },
    ],
  },
  {
    id: 'star_rating', title: th('starRatingTitle'),
    icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
    type: 'star_radio',
    options: [5, 4, 3, 2, 1].map((n) => ({ label: th('starOption', { n }) })),
  },
  {
    id: 'amenities', title: th('amenitiesTitle'),
    icon: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
    type: 'checkbox',
    options: [
      { label: th('amenityFreeWifi') }, { label: th('amenityPool') }, { label: th('amenitySpa') },
      { label: th('amenityGym') }, { label: th('amenityRestaurant') },
    ],
  },
  ];
}

function buildFlightGroups(t: TFn): FilterGroup[] {
  return [
  {
    id: 'price', title: t('priceRange'),
    icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    type: 'price_slider',
    options: [],
    priceRange: { min: 0, max: 10000 },
    pricePresets: [
      { label: '$0–$200', min: 0, max: 200 },
      { label: '$200–$500', min: 200, max: 500 },
      { label: '$500–$1500', min: 500, max: 1500 },
      { label: '$1500+', min: 1500, max: 10000 },
    ],
  },
  {
    id: 'stops', title: t('stops'),
    icon: 'M12 19.5v-15m0 0l-6.75 6.75M12 4.5l6.75 6.75',
    type: 'radio',
    options: [
      { label: t('directOnly'), key: '0' },
      { label: t('oneStop'), key: '1' },
      { label: t('twoPlusStops'), key: '2+' },
    ],
  },
  {
    id: 'departure_time', title: t('departure'),
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
    type: 'checkbox',
    options: [
      { label: t('earlyMorning'), key: 'early_morning' },
      { label: t('morning'), key: 'morning' },
      { label: t('afternoon'), key: 'afternoon' },
      { label: t('evening'), key: 'evening' },
    ],
  },
  {
    id: 'airlines', title: t('airlines'),
    icon: 'M21 16.23c0 .696-.56 1.262-1.25 1.262H4.25C3.56 17.492 3 16.926 3 16.23V7.77c0-.696.56-1.262 1.25-1.262h15.5c.69 0 1.25.566 1.25 1.262v8.46zM3 10.5h18',
    type: 'checkbox',
    options: [],
  },
  {
    id: 'cabin_class', title: t('cabinClass'),
    icon: 'M8.25 9V5.25A2.25 2.25 0 0110.5 3h6a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0116.5 21h-6a2.25 2.25 0 01-2.25-2.25V15m-3 0l3-3m0 0l3 3m-3-3V7.5',
    type: 'checkbox',
    options: [
      { label: t('cabinEconomy') },
      { label: t('cabinPremiumEconomy') },
      { label: t('cabinBusiness') },
      { label: t('cabinFirst') },
    ],
  },
  ];
}

function AccordionGroup({
  group,
  defaultOpen = false,
  selectedKeys,
  onToggle,
  priceRange,
  onPriceRangeChange,
  selectedStar,
  onStarChange,
}: {
  group: FilterGroup;
  defaultOpen?: boolean;
  selectedKeys?: string[];
  onToggle?: (groupId: string, key: string) => void;
  priceRange?: [number, number];
  onPriceRangeChange?: (range: [number, number]) => void;
  selectedStar?: number | null;
  onStarChange?: (stars: number | null) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { selectedCurrency } = useCurrencyDisplay();

  const hasActiveFilters =
    (group.type === 'price_slider' && priceRange && onPriceRangeChange &&
      !(priceRange[0] === (group.priceRange?.min ?? 0) && priceRange[1] === (group.priceRange?.max ?? 0))) ||
    (group.type === 'star_radio' && selectedStar != null) ||
    (selectedKeys && selectedKeys.length > 0);

  const handleToggle = (key: string) => {
    onToggle?.(group.id, key);
  };

  return (
    <div className="border-b border-zinc-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-1 py-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <svg className="h-4 w-4 shrink-0 text-brand-teal/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d={group.icon} />
          </svg>
          <span className="text-[13px] font-semibold text-charcoal">{group.title}</span>
          {hasActiveFilters && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
          )}
        </span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease }}
            className="overflow-hidden"
          >
            <div className="pb-3 pt-1">
              {group.type === 'price_slider' && group.priceRange ? (
                <PriceRangeSlider
                  min={group.priceRange.min}
                  max={group.priceRange.max}
                  value={priceRange ?? [group.priceRange.min, group.priceRange.max]}
                  onChange={onPriceRangeChange ?? (() => {})}
                  presets={group.pricePresets}
                  resultCount={group.resultCount}
                  currency={selectedCurrency.code}
                  currencySymbol={selectedCurrency.symbol}
                />
              ) : group.type === 'star_radio' ? (
                <StarRatingFilter
                  selected={selectedStar ?? null}
                  onSelect={onStarChange ?? (() => {})}
                  counts={group.starCounts}
                />
              ) : group.type === 'toggle' ? (
                <ToggleFilter
                  options={group.options}
                  checked={(selectedKeys?.length ?? 0) > 0}
                  onChange={() => handleToggle('__toggle__')}
                />
              ) : group.type === 'rating' ? (
                <RatingFilter
                  options={group.options}
                  selectedKeys={selectedKeys ?? []}
                  onSelect={handleToggle}
                />
              ) : group.type === 'radio' ? (
                <RadioFilter
                  name={group.id}
                  options={group.options}
                  selected={selectedKeys?.[0] ?? null}
                  onSelect={handleToggle}
                />
              ) : group.type === 'text_input' ? (
                <TextInputFilter
                  placeholder={group.placeholder ?? ''}
                  value={selectedKeys?.[0] ?? ''}
                  onChange={handleToggle}
                />
              ) : (
                <CheckboxFilter
                  options={group.options}
                  selectedKeys={selectedKeys ?? []}
                  onToggle={handleToggle}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CheckboxFilter({
  options,
  selectedKeys,
  onToggle,
}: {
  options: FilterOption[];
  selectedKeys: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((opt) => {
        const key = opt.key ?? opt.label;
        const checked = selectedKeys.includes(key);
        const disabled = opt.count === 0;
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150 ${
              disabled
                ? 'opacity-40 cursor-not-allowed'
                : checked
                  ? 'bg-brand-teal/5 text-brand-teal font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <span
              className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                checked
                  ? 'border-brand-teal bg-brand-teal'
                  : 'border-zinc-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(key)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              {checked && (
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </span>
            <span className="flex-1">{opt.label}</span>
            {opt.count != null && (
              <span className="text-xs text-zinc-400">{opt.count}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function RadioFilter({
  name,
  options,
  selected,
  onSelect,
}: {
  name: string;
  options: FilterOption[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((opt) => {
        const key = opt.key ?? opt.label;
        const checked = selected === key;
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150 ${
              checked
                ? 'bg-brand-teal/5 text-brand-teal font-medium'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <span
              className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
                checked ? 'border-brand-teal' : 'border-zinc-200 bg-white'
              }`}
            >
              <input
                type="radio"
                name={name}
                checked={checked}
                onChange={() => onSelect(key)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              {checked && (
                <span className="h-2 w-2 rounded-full bg-brand-teal" />
              )}
            </span>
            <span className="flex-1">{opt.label}</span>
            {opt.count != null && (
              <span className="text-xs text-zinc-400">{opt.count}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function ToggleFilter({
  options,
  checked,
  onChange,
}: {
  options: FilterOption[];
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="px-2.5">
      <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
        <span className="text-sm text-zinc-600">{options[0]?.label}</span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={onChange}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/30 ${
            checked ? 'bg-brand-teal' : 'bg-zinc-200'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </label>
    </div>
  );
}

function RatingFilter({
  options,
  selectedKeys,
  onSelect,
}: {
  options: FilterOption[];
  selectedKeys: string[];
  onSelect: (key: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      {options.map((opt) => {
        const stars = parseInt(opt.label);
        const key = opt.key ?? opt.label;
        const checked = selectedKeys.includes(key);
        return (
          <label
            key={key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150 ${
              checked
                ? 'bg-brand-teal/5 text-brand-teal font-medium'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            <span
              className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                checked
                  ? 'border-brand-teal bg-brand-teal'
                  : 'border-zinc-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onSelect(key)}
                className="peer absolute inset-0 cursor-pointer opacity-0"
              />
              {checked && (
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </span>
            <span className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <svg key={i} className={`h-3.5 w-3.5 ${i < stars ? 'text-amber-400' : 'text-zinc-200'}`} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              ))}
            </span>
            {opt.count != null && (
              <span className="ml-auto text-xs text-zinc-400">{opt.count}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

function TextInputFilter({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="px-2.5">
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 transition-all duration-150 focus:border-brand-teal/30 focus:outline-none focus:ring-2 focus:ring-brand-teal/5"
      />
    </div>
  );
}

export function FilterSidebar({
  mode,
  flightFilters,
  hotelFilters,
  onFlightFilterChange,
  onHotelFilterChange,
  dynamicGroups,
  className = '',
}: FilterSidebarProps) {
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const th = useTranslations('Hotels');
  const { isAdmin } = useAuth();
  const groups = useMemo(
    () => dynamicGroups ?? (mode === 'flights' ? buildFlightGroups(t) : buildHotelGroups(th, t)),
    [dynamicGroups, mode, t, th],
  );
  const filters = mode === 'flights' ? flightFilters : hotelFilters;
  const activeCount = filters ? countActiveFilters(filters) : 0;

  // Determine which groups should be open by default
  const defaultOpenGroups = useMemo(() => {
    const openIds = new Set<string>();
    groups.forEach((group, i) => {
      // Open first 2 groups always
      if (i < 2) openIds.add(group.id);
      // Open groups that have active filters
      const selectedKeys = getSelectedKeys(group.id);
      if (selectedKeys.length > 0) openIds.add(group.id);
    });
    return openIds;
  }, [groups, filters]);

  // Flight filter handler - explicit group-based routing
  const handleFlightToggle = useCallback(
    (groupId: string, key: string) => {
      if (!flightFilters || !onFlightFilterChange) return;
      const next = { ...flightFilters };

      switch (groupId) {
        case 'price':
          // Price slider is handled separately via onPriceRangeChange
          break;
        case 'airlines':
          next.airlines = toggleArray(next.airlines, key);
          break;
        case 'stops':
          next.stops = next.stops === key ? null : key;
          break;
        case 'departure_time':
        case 'departureTimes':
          next.departureTimes = toggleArray(next.departureTimes, key);
          break;
        case 'arrival_time':
        case 'arrivalTimes':
          next.arrivalTimes = toggleArray(next.arrivalTimes, key);
          break;
        case 'duration':
          next.durations = next.durations === key ? null : key;
          break;
        case 'cabin_class':
        case 'cabinClasses':
          next.cabinClasses = toggleArray(next.cabinClasses, key);
          break;
        case 'free_cancellation':
          next.freeCancellation = !next.freeCancellation;
          break;
        case 'refundable':
          next.refundable = !next.refundable;
          break;
        case 'suppliers':
          next.supplierFilters = toggleArray(next.supplierFilters, key);
          break;
        case 'flight_number':
          next.flightNumber = key || undefined;
          break;
        default:
          // Unknown group - try to intelligently route
          if (key === '__toggle__') {
            next.refundable = !next.refundable;
          }
          break;
      }

      onFlightFilterChange(next);
    },
    [flightFilters, onFlightFilterChange],
  );

  // Hotel filter handler - explicit group-based routing
  const handleHotelToggle = useCallback(
    (groupId: string, key: string) => {
      if (!hotelFilters || !onHotelFilterChange) return;
      const next = { ...hotelFilters };

      switch (groupId) {
        case 'price':
          // Price slider is handled separately via onPriceRangeChange
          break;
        case 'star_rating':
          const starNum = parseInt(key);
          if (!isNaN(starNum)) {
            next.starRating = next.starRating.includes(starNum)
              ? next.starRating.filter((s) => s !== starNum)
              : [...next.starRating, starNum];
          }
          break;
        case 'guest_rating':
          next.guestRating = next.guestRating === key ? null : key;
          break;
        case 'amenities':
          next.amenities = toggleArray(next.amenities, key);
          break;
        case 'free_cancellation':
          next.freeCancellation = !next.freeCancellation;
          break;
        case 'property_type':
        case 'propertyTypes':
          next.propertyTypes = toggleArray(next.propertyTypes, key);
          break;
        case 'meal_options':
        case 'mealOptions':
          next.mealOptions = toggleArray(next.mealOptions, key);
          break;
        case 'board_basis':
        case 'boardBasis':
          next.boardBasis = toggleArray(next.boardBasis, key);
          break;
        case 'distance':
          next.distance = next.distance === key ? null : key;
          break;
        case 'suppliers':
          next.supplierFilters = toggleArray(next.supplierFilters, key);
          break;
        case 'hotel_name':
          next.hotelName = key || undefined;
          break;
        default:
          // Unknown group - try to intelligently route
          if (key === '__toggle__') {
            next.freeCancellation = !next.freeCancellation;
          }
          break;
      }

      onHotelFilterChange(next);
    },
    [hotelFilters, onHotelFilterChange],
  );

  const handleReset = useCallback(() => {
    if (mode === 'flights' && onFlightFilterChange) {
      onFlightFilterChange({
        priceRanges: [], airlines: [], stops: null,
        departureTimes: [], arrivalTimes: [], durations: null,
        cabinClasses: [], refundable: false, freeCancellation: false,
        baggageIncluded: null, supplierFilters: [], flightNumber: undefined,
        priceMin: undefined, priceMax: undefined,
      });
    } else if (mode === 'hotels' && onHotelFilterChange) {
      onHotelFilterChange({
        priceRanges: [], starRating: [], guestRating: null,
        propertyTypes: [], amenities: [], mealOptions: [],
        freeCancellation: false, distance: null, boardBasis: [],
        supplierFilters: [], hotelName: undefined,
        priceMin: undefined, priceMax: undefined,
      });
    }
  }, [mode, onFlightFilterChange, onHotelFilterChange]);

  // Type-safe getSelectedKeys - returns correct key format for each group
  function getSelectedKeys(groupId: string): string[] {
    if (!filters) return [];
    
    if (mode === 'flights') {
      const f = filters as FlightFilters;
      switch (groupId) {
        case 'flight_number':
          return f.flightNumber ? [f.flightNumber] : [];
        case 'price':
          return f.priceRanges;
        case 'airlines':
          return f.airlines;
        case 'stops':
          return f.stops ? [f.stops] : [];
        case 'departure_time':
        case 'departureTimes':
          return f.departureTimes;
        case 'arrival_time':
        case 'arrivalTimes':
          return f.arrivalTimes;
        case 'duration':
          return f.durations ? [f.durations] : [];
        case 'cabin_class':
        case 'cabinClasses':
          return f.cabinClasses;
        case 'free_cancellation':
          return f.freeCancellation ? ['free_cancellation'] : [];
        case 'refundable':
          return f.refundable ? ['refundable'] : [];
        case 'suppliers':
          return f.supplierFilters;
        default:
          return [];
      }
    } else {
      const f = filters as HotelFilters;
      switch (groupId) {
        case 'hotel_name':
          return f.hotelName ? [f.hotelName] : [];
        case 'price':
          return f.priceRanges;
        case 'star_rating':
          // Return numeric strings for star rating
          return f.starRating.map(String);
        case 'guest_rating':
          return f.guestRating ? [f.guestRating] : [];
        case 'amenities':
          return f.amenities;
        case 'free_cancellation':
          return f.freeCancellation ? ['free_cancellation'] : [];
        case 'property_type':
        case 'propertyTypes':
          return f.propertyTypes;
        case 'meal_options':
        case 'mealOptions':
          return f.mealOptions;
        case 'board_basis':
        case 'boardBasis':
          return f.boardBasis;
        case 'distance':
          return f.distance ? [f.distance] : [];
        case 'suppliers':
          return f.supplierFilters;
        default:
          return [];
      }
    }
  }

  function getPriceRange(): [number, number] {
    if (!filters) return [0, 100];
    const f = filters as FlightFilters | HotelFilters;
    if (typeof f.priceMin === 'number' && typeof f.priceMax === 'number') {
      return [f.priceMin, f.priceMax];
    }
    const priceGroup = groups.find((g) => g.id === 'price');
    if (priceGroup?.priceRange) {
      return [priceGroup.priceRange.min, priceGroup.priceRange.max];
    }
    return [0, 100];
  }

  // Price range change - clears bucket presets when slider is used
  function handlePriceRangeChange(range: [number, number]) {
    if (mode === 'flights' && flightFilters && onFlightFilterChange) {
      onFlightFilterChange({
        ...flightFilters,
        priceRanges: [], // Clear bucket presets
        priceMin: range[0],
        priceMax: range[1],
      });
    } else if (mode === 'hotels' && hotelFilters && onHotelFilterChange) {
      onHotelFilterChange({
        ...hotelFilters,
        priceRanges: [], // Clear bucket presets
        priceMin: range[0],
        priceMax: range[1],
      });
    }
  }

  function getSelectedStar(): number | null {
    if (mode === 'hotels' && hotelFilters) {
      return hotelFilters.starRating.length === 1 ? hotelFilters.starRating[0] : null;
    }
    return null;
  }

  function handleStarChange(stars: number | null) {
    if (mode === 'hotels' && hotelFilters && onHotelFilterChange) {
      onHotelFilterChange({
        ...hotelFilters,
        starRating: stars != null ? [stars] : [],
      });
    }
  }

  return (
    <aside className={`w-full ${className}`}>
      <div className="rounded-2xl border border-zinc-200/60 bg-white shadow-[0_4px_24px_rgba(3,61,74,0.06)]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3.5">
          <div className="flex items-center gap-2">
            <svg className="h-4 w-4 text-brand-teal" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
            <h3 className="text-sm font-semibold text-charcoal">{tc('filters')}</h3>
            {activeCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal text-[10px] font-bold text-white">
                {activeCount}
              </span>
            )}
          </div>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs font-semibold text-brand-teal transition-colors hover:text-[#012830]"
            >
              {tc('clear')}
            </button>
          )}
        </div>

        <div className="px-3 pb-4 pt-1">
          {mode === 'flights' && (
            <div className="border-b border-zinc-100 py-3">
              <div className="flex items-center gap-2 mb-1.5">
                <svg className="h-4 w-4 text-brand-teal/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
                <span className="text-[13px] font-semibold text-charcoal">{t('flightNumber')}</span>
              </div>
              <input
                type="text"
                placeholder={t('flightNumberPlaceholder')}
                value={flightFilters?.flightNumber ?? ''}
                onChange={(e) => {
                  handleFlightToggle('flight_number', e.target.value);
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 transition-all duration-150 focus:border-brand-teal/30 focus:outline-none focus:ring-2 focus:ring-brand-teal/5"
              />
              <p className="mt-1 text-[11px] text-zinc-400">{t('flightNumberHint')}</p>
            </div>
          )}

          {mode === 'hotels' && (
            <div className="border-b border-zinc-100 py-3">
              <label className="mb-1.5 block text-[13px] font-semibold text-charcoal">{th('searchByName')}</label>
              <input
                type="text"
                placeholder={th('hotelNamePlaceholder')}
                value={hotelFilters?.hotelName ?? ''}
                onChange={(e) => {
                  handleHotelToggle('hotel_name', e.target.value);
                }}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 placeholder:text-zinc-400 transition-all duration-150 focus:border-brand-teal/30 focus:outline-none focus:ring-2 focus:ring-brand-teal/5"
              />
            </div>
          )}

          {groups.map((group) => (
            <AccordionGroup
              key={group.id}
              group={group}
              defaultOpen={defaultOpenGroups.has(group.id)}
              selectedKeys={getSelectedKeys(group.id)}
              onToggle={mode === 'flights' ? handleFlightToggle : handleHotelToggle}
              priceRange={group.type === 'price_slider' ? getPriceRange() : undefined}
              onPriceRangeChange={group.type === 'price_slider' ? handlePriceRangeChange : undefined}
              selectedStar={group.type === 'star_radio' ? getSelectedStar() : undefined}
              onStarChange={group.type === 'star_radio' ? handleStarChange : undefined}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function toggleArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item];
}
