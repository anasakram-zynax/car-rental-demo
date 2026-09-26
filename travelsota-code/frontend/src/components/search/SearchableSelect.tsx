"use client";

import { useState, useRef, useEffect, useMemo, useCallback, useId } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { Popover } from '@/components/ui/popover';
import { useTravelAutocomplete } from "@/features/autocomplete/hooks";
import type { TravelSuggestion, AutocompleteModule } from "@/features/autocomplete/types";

// ─── Types ────────────────────────────────────────────────

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  selectedSuggestion: TravelSuggestion | null;
  onSelect: (suggestion: TravelSuggestion) => void;
  onClear: () => void;
  module?: AutocompleteModule;
  /** When set, only suggestions whose `type` is in this list are shown. */
  allowedTypes?: readonly string[];
  placeholder?: string;
  inputClassName?: string;
  debounceMs?: number;
  error?: string;
  enableRecentSearches?: boolean;
  icon?: "search" | "pin" | "hotel" | "plane";
  disabled?: boolean;
  "aria-label"?: string;
}

interface GroupedSuggestions {
  label: string;
  items: TravelSuggestion[];
}

interface RecentSearch {
  label: string;
  code?: string;
  type: string;
  module: string;
  searchPayload?: Record<string, unknown>;
  ts: number;
}

function recentKey(mod?: AutocompleteModule) {
  return mod ? `travq_recent_${mod}` : "travq_recent_searches";
}
const MAX_RECENT = 5;

const ease = [0.16, 1, 0.3, 1] as const;

// ─── Helpers ──────────────────────────────────────────────

function groupSuggestions(suggestions: TravelSuggestion[], labels: Record<string, string>): GroupedSuggestions[] {
  const groups: Record<string, TravelSuggestion[]> = {};
  for (const s of suggestions) {
    let group: string;
    if (s.type === "HOTEL_DESTINATION") group = labels.destinations;
    else if (s.type === "HOTEL") group = labels.hotels;
    else if (s.type === "METRO_AREA") group = labels.metroAreas;
    else if (s.type === "CITY") group = labels.cities;
    else group = labels.airports;
    (groups[group] ??= []).push(s);
  }
  const order = [labels.destinations, labels.hotels, labels.metroAreas, labels.cities, labels.airports];
  return order.filter((g) => groups[g]?.length).map((g) => ({ label: g, items: groups[g] }));
}

function getRecentSearches(mod?: AutocompleteModule): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(recentKey(mod));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(suggestion: TravelSuggestion) {
  if (typeof window === "undefined") return;
  try {
    const mod = suggestion.module as AutocompleteModule | undefined;
    const existing = getRecentSearches(mod);
    const filtered = existing.filter(
      (r) => !(r.type === suggestion.type && r.code === suggestion.code),
    );
    const entry: RecentSearch = {
      label: suggestion.label,
      code: suggestion.code,
      type: suggestion.type,
      module: suggestion.module,
      searchPayload: suggestion.searchPayload,
      ts: Date.now(),
    };
    const updated = [entry, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(recentKey(mod), JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function clearRecentSearches(mod?: AutocompleteModule) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(recentKey(mod));
  } catch {
    // ignore
  }
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-bold text-inherit">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Icons ────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
    </svg>
  );
}

function getTypeIcon(type: string) {
  const base = "h-5 w-5 shrink-0";
  switch (type) {
    case "AIRPORT":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5L21 12 3.5 4.5 6 12l-2.5 7.5Z" />
        </svg>
      );
    case "HOTEL":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
        </svg>
      );
    case "HOTEL_DESTINATION":
    case "CITY":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
    default:
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
        </svg>
      );
  }
}

function getGroupIcon(label: string, labels?: Record<string, string>) {
  const base = "h-3.5 w-3.5 shrink-0";
  if (labels && label === labels.airports) {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.5 19.5 21 12 3.5 4.5 6 12l-2.5 7.5Z" />
      </svg>
    );
  }
  if (labels && label === labels.hotels) {
    return (
      <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
      </svg>
    );
  }
  return (
    <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

// ─── Country flag from ISO code ─────────────────────────────

function countryFlag(cc?: string): string {
  if (!cc || cc.length !== 2) return "";
  return String.fromCodePoint(0x1F1E6 + cc.charCodeAt(0) - 65, 0x1F1E6 + cc.charCodeAt(1) - 65);
}

// Extract a 2-letter country code from a destination subtitle when it's a bare
// ISO code (e.g. "NG"); otherwise return null (subtitle is a full country name).
function extractCountryCode(subtitle?: string): string | null {
  if (!subtitle) return null;
  const t = subtitle.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return null;
}

// ─── Reusable Suggestion Row ─────────────────────────────────

function SuggestionRow({
  item,
  query,
  idx,
  highlightIdx,
  onHighlight,
  onSelect,
  instanceId,
  rowRef,
}: {
  item: TravelSuggestion;
  query: string;
  idx: number;
  highlightIdx: number;
  onHighlight: (i: number) => void;
  onSelect: (item: TravelSuggestion) => void;
  instanceId: string;
  rowRef?: React.RefCallback<HTMLDivElement>;
}) {
  const isDest = item.type === "HOTEL_DESTINATION";
  const isHotel = item.type === "HOTEL";
  const tHotel = useTranslations('Hotels');
  const countryCode = isDest ? extractCountryCode(item.subtitle) : null;
  const flag = countryCode ? countryFlag(countryCode) : "";
  const active = idx === highlightIdx;

  return (
    <div
      id={`${instanceId}-opt-${idx}`}
      role="option"
      aria-selected={active}
      ref={rowRef}
      className={`mx-1.5 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors duration-150 ${
        active ? "bg-brand-teal/[0.07] text-slate-900" : "text-slate-700 hover:bg-slate-50"
      }`}
      onMouseEnter={() => onHighlight(idx)}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect(item);
      }}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
          active ? "bg-brand-teal/15 text-brand-teal" : "bg-slate-100 text-slate-400"
        }`}
      >
        {getTypeIcon(item.type)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {flag && (
            <span className="text-base leading-none" aria-hidden="true">{flag}</span>
          )}
          <div
            className={`truncate text-[15px] leading-snug font-semibold ${
              active ? "text-slate-900" : "text-slate-800"
            }`}
          >
            {highlightMatch(item.label, query)}
          </div>
        </div>
        {item.subtitle && (
          <div
            className={`mt-0.5 truncate text-xs leading-tight ${
              active ? "text-slate-500" : "text-slate-400"
            }`}
          >
            {isHotel ? `${tHotel('hotel')} · ${item.subtitle}` : item.subtitle}
          </div>
        )}
      </div>

      {/* IATA code badge (destinations only) */}
      {isDest && item.code && (
        <span
          className={`ml-1 shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-bold tracking-wide ${
            active ? "bg-brand-teal/10 text-brand-teal" : "bg-slate-100 text-slate-500"
          }`}
        >
          {item.code}
        </span>
      )}
    </div>
  );
}

// ─── Skeleton Loader ──────────────────────────────────────

function SkeletonRows() {
  const tc = useTranslations('Common');
  return (
    <div className="space-y-1 px-1" aria-busy="true" aria-label={tc('loadingSuggestions')}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3">
          <div className="h-5 w-5 shrink-0 animate-pulse rounded-lg bg-zinc-150" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded-md bg-zinc-200" style={{ animationDelay: `${i * 80}ms` }} />
            <div className="h-2.5 w-1/2 animate-pulse rounded-md bg-zinc-100" style={{ animationDelay: `${i * 80 + 40}ms` }} />
          </div>
          <div className="h-6 w-11 shrink-0 animate-pulse rounded-md bg-zinc-150" style={{ animationDelay: `${i * 80 + 20}ms` }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

export function SearchableSelect({
  value,
  onChange,
  selectedSuggestion,
  onSelect,
  onClear,
  module: mod,
  allowedTypes,
  placeholder,
  inputClassName,
  debounceMs = 250,
  error,
  enableRecentSearches = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  icon: _icon = "search",
  disabled = false,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const instanceId = useId();
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [anchorEl, setAnchorEl] = useState<HTMLDivElement | null>(null);
  const ref = anchorEl;
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const { query, setQuery, suggestions, popularSuggestions, isLoading, isPopularLoading } = useTravelAutocomplete({ module: mod, debounceMs });
  const reducedMotion = useReducedMotion();
  const tc = useTranslations('Common');
  const tf = useTranslations('Flights');
  const th = useTranslations('Hotels');
  const placeholderText = placeholder ?? tc('searchPlaceholder');
  const groupLabels = useMemo(() => ({
    destinations: tc('groupDestinations'),
    hotels: tc('groupHotels'),
    metroAreas: tc('groupMetroAreas'),
    cities: tc('groupCities'),
    airports: tc('groupAirports'),
  }), [tc]);

  const [recentClearTick, setRecentClearTick] = useState(0);

  const recentSearches = useMemo(() => {
    if (!enableRecentSearches || !open || query.trim()) return [];
    return getRecentSearches(mod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableRecentSearches, open, query, recentClearTick]);

  useEffect(() => {
    setQuery(value);
  }, [value, setQuery]);

  const filteredSuggestions = useMemo(() => {
    if (!allowedTypes || allowedTypes.length === 0) return suggestions;
    return suggestions.filter((s) => allowedTypes.includes(s.type));
  }, [suggestions, allowedTypes]);

  const filteredPopular = useMemo(() => {
    if (!allowedTypes || allowedTypes.length === 0) return popularSuggestions;
    return popularSuggestions.filter((s) => allowedTypes.includes(s.type));
  }, [popularSuggestions, allowedTypes]);

  const grouped = useMemo(() => groupSuggestions(filteredSuggestions, groupLabels), [filteredSuggestions, groupLabels]);
  const groupedPopular = useMemo(() => groupSuggestions(filteredPopular, groupLabels), [filteredPopular, groupLabels]);
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  const showRecent = enableRecentSearches && open && !query.trim() && recentSearches.length > 0;
  const showPopular = open && !query.trim() && groupedPopular.length > 0 && !showRecent;
  const totalItems = showRecent ? recentSearches.length : showPopular ? groupedPopular.flatMap(g => g.items).length : flatItems.length;
  const showDropdown = open && (grouped.length > 0 || isLoading || showRecent || showPopular || isPopularLoading);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref && !ref.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setHighlightIdx(-1), 0);
    return () => clearTimeout(id);
  }, [suggestions, open]);

  useEffect(() => {
    if (highlightIdx < 0) return;
    const el = optionRefs.current.get(highlightIdx);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightIdx]);

  const handleSelect = useCallback(
    (suggestion: TravelSuggestion) => {
      onSelect(suggestion);
      setQuery(suggestion.label);
      setOpen(false);
      saveRecentSearch(suggestion);
    },
    [onSelect],
  );

  const clearRecents = useCallback(() => {
    clearRecentSearches(mod);
    setRecentClearTick((t) => t + 1);
  }, [mod]);

  const handleRecentSelect = useCallback(
    (recent: RecentSearch) => {
      const fake: TravelSuggestion = {
        id: `recent-${recent.code ?? recent.label}`,
        module: recent.module as "hotels" | "flights",
        type: recent.type as TravelSuggestion["type"],
        label: recent.label,
        subtitle: "",
        code: recent.code,
        searchPayload: recent.searchPayload ?? {},
      };
      onSelect(fake);
      setQuery(recent.label);
      setOpen(false);
    },
    [onSelect],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIdx((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIdx((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightIdx >= 0) {
          if (showRecent && highlightIdx < recentSearches.length) {
            handleRecentSelect(recentSearches[highlightIdx]);
          } else if (!showRecent) {
            const adjustedIdx = showRecent ? highlightIdx - recentSearches.length : highlightIdx;
            if (adjustedIdx >= 0 && adjustedIdx < flatItems.length) {
              handleSelect(flatItems[adjustedIdx]);
            }
          }
        }
        break;
      case "Tab":
        if (highlightIdx >= 0 && showDropdown) {
          e.preventDefault();
          if (showRecent && highlightIdx < recentSearches.length) {
            handleRecentSelect(recentSearches[highlightIdx]);
          } else if (!showRecent) {
            const adjustedIdx = showRecent ? highlightIdx - recentSearches.length : highlightIdx;
            if (adjustedIdx >= 0 && adjustedIdx < flatItems.length) {
              handleSelect(flatItems[adjustedIdx]);
            }
          }
        }
        break;
      case "Escape":
        setOpen(false);
        break;
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    onChange("");
    onClear();
    // Clear empties the selection. Close the dropdown AND blur so it does not
    // immediately reopen via onFocus. User taps × → panel closes, clean slate.
    setOpen(false);
    setHighlightIdx(-1);
    inputRef.current?.blur();
  }

  function handleFocus() {
    if (!disabled) setOpen(true);
  }

  const hasSelection = selectedSuggestion !== null;
  const showError = !!error;

  return (
    <div ref={setAnchorEl} className="relative w-full" role="combobox" aria-expanded={showDropdown} aria-haspopup="listbox" aria-controls={`${instanceId}-listbox`} aria-owns={`${instanceId}-listbox`}>
      <input
        ref={inputRef}
        className={
          inputClassName ??
          "w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        }
        placeholder={placeholderText}
        value={query}
        onChange={(e) => {
          onChange(e.target.value);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="searchbox"
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={highlightIdx >= 0 ? `${instanceId}-opt-${highlightIdx}` : undefined}
        aria-describedby={showError ? `${instanceId}-error` : undefined}
        disabled={disabled}
      />
      {hasSelection && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          aria-label={tc('clearSelection')}
          className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
        >
          <CloseIcon />
        </button>
      )}

      {showError && (
        <p id={`${instanceId}-error`} className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Dropdown */}
      {showDropdown && (
        <Popover open={showDropdown} onClose={() => setOpen(false)} anchorEl={ref} matchMinWidth scroll={false}>
          <motion.div
            id={`${instanceId}-listbox`}
            ref={listRef}
            role="listbox"
            initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.15, ease }}
            className="w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_64px_rgba(3,61,74,0.16)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <h2 className="text-sm font-bold text-slate-900">
                {mod === "flights"
                  ? tf('searchWhereFlying')
                  : th('searchWhereStay')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  inputRef.current?.blur();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                aria-label={tc('closeSuggestions')}
              >
                <CloseIcon />
              </button>
            </div>

            <div className="max-h-[min(22rem,calc(100dvh-12rem))] overflow-y-auto overscroll-contain custom-scrollbar px-2 pb-2">{/* suggestion list */}
            {showRecent && (
              <div role="group" aria-label={tc('recent')}>
                <div className="flex items-center justify-between px-4 py-1.5">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                    <ClockIcon />
                    {tc('recent')}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearRecents();
                    }}
                    className="text-[11px] font-medium text-zinc-300 transition-colors hover:text-zinc-500"
                  >
                    {tc('clear')}
                  </button>
                </div>
                {recentSearches.map((recent, idx) => (
                  <SuggestionRow
                    key={`recent-${recent.code ?? recent.label}-${idx}`}
                    instanceId={instanceId}
                    idx={idx}
                    item={{
                      id: `recent-${idx}`,
                      module: (recent.module === "all" ? "hotels" : recent.module) as TravelSuggestion["module"],
                      type: recent.type as TravelSuggestion["type"],
                      label: recent.label,
                      subtitle: "",
                      code: recent.code,
                      searchPayload: recent.searchPayload ?? {},
                    }}
                    query={query}
                    highlightIdx={highlightIdx}
                    onHighlight={setHighlightIdx}
                    onSelect={() => handleRecentSelect(recent)}
                  />
                ))}
                {grouped.length > 0 && <div className="mx-4 my-1 border-t border-zinc-100" />}
              </div>
            )}

            {/* Popular suggestions (when no query typed) */}
            {showPopular && (
              <div role="group" aria-label={tc('popular')}>
                <div className="flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                  </svg>
                  {tc('popular')}
                </div>
                {isPopularLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={`pop-sk-${i}`} className="mx-2 flex items-center gap-3 rounded-xl px-3 py-2.5">
                      <div className="h-5 w-5 rounded bg-zinc-100 animate-pulse" />
                      <div className="h-4 flex-1 rounded bg-zinc-100 animate-pulse" />
                    </div>
                  ))
                ) : (
                  groupedPopular.flatMap(g => g.items).map((item, idx) => (
                    <SuggestionRow
                      key={`pop-${item.type}-${item.id}`}
                      instanceId={instanceId}
                      idx={idx}
                      item={item}
                      query={query}
                      highlightIdx={highlightIdx}
                      onHighlight={setHighlightIdx}
                      onSelect={handleSelect}
                    />
                  ))
                )}
                {grouped.length > 0 && <div className="mx-4 my-1 border-t border-zinc-100" />}
              </div>
            )}

            {/* Grouped suggestions */}
            {grouped.map((group) => (
              <div key={group.label} role="group" aria-label={group.label}>
                <div className="flex items-center gap-2 px-4 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400" role="presentation">
                  <span className="text-zinc-300">{getGroupIcon(group.label, groupLabels)}</span>
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const gIdx = showRecent ? recentSearches.length + flatItems.indexOf(item) : flatItems.indexOf(item);
                  return (
                    <SuggestionRow
                      key={`${item.type}-${item.id}`}
                      instanceId={instanceId}
                      idx={gIdx}
                      item={item}
                      query={query}
                      highlightIdx={highlightIdx}
                      onHighlight={setHighlightIdx}
                      onSelect={handleSelect}
                      rowRef={(el) => {
                        if (el) optionRefs.current.set(gIdx, el);
                        else optionRefs.current.delete(gIdx);
                      }}
                    />
                  );
                })}
              </div>
            ))}

            {/* Loading state */}
            {isLoading && <SkeletonRows />}

            {/* Empty state */}
            {!isLoading && flatItems.length === 0 && !showRecent && (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
                  <svg className="h-6 w-6 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" />
                    <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-900">{tc('noMatches', { query: query.trim() })}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400 max-w-[230px]">
                  {tc('searchEmptyHint')}
                </p>
              </div>
            )}
            </div>

            {/* Footer hint */}
            {(grouped.length > 0 || showPopular || showRecent) && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
                <span className="text-[11px] text-slate-400">
                  <kbd className="rounded bg-slate-100 px-1 py-0.5 font-sans text-[10px] text-slate-500">↑↓</kbd>{" "}{tc('navigateHint')}
                  <span className="mx-1.5 text-slate-200">·</span>
                  <kbd className="rounded bg-slate-100 px-1 py-0.5 font-sans text-[10px] text-slate-500">↵</kbd>{" "}{tc('selectHint')}
                </span>
                <span className="text-[11px] text-slate-400">{tc('escToClose')}</span>
              </div>
            )}
          </motion.div>
        </Popover>
      )}
    </div>
  );
}
