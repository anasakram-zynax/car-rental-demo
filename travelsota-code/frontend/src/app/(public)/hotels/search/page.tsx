'use client';
import { useTranslations } from 'next-intl';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { SearchSection } from '@/components/search/SearchSection';
import { FilterSidebar } from '@/components/search/FilterSidebar';
import { SortBar } from '@/components/search/SortBar';
import type { FormState, RoomForm } from '@/features/hotels/types/search-form';
import type { HotelFilters } from '@/lib/filters/types';
import { defaultHotelFilters } from '@/lib/filters/types';
import { searchHotels } from '@/features/hotels/api/search-hotels';
import type { HotelSearchInput } from '@/features/hotels/api/search-hotels';
import type { CombinedHotelCard, CombinedHotelSearchResponse } from '@/lib/schema/hotel';

import { HotelResultCard } from '@/features/hotels/components/hotel-result-card';
import { HotelSearchSkeleton } from '@/features/hotels/components/HotelSearchSkeleton';
import { PremiumError, PremiumEmpty } from '@/components/ui/state/premium-states';
import { HotelSearchEmptyState } from '@/components/search/HotelSearchEmptyState';
import { ActiveFilterChips } from '@/components/search/ActiveFilterChips';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/context/CurrencyContext';
import { SearchProgressProvider, useSearchProgress } from '@/context/SearchProgressContext';
import { SearchProgressHeader } from '@/components/search/SearchProgressHeader';
import { startSearchJob, subscribeToSearchJobEvents, fetchSearchJobResult } from '@/features/search-progress/api/search-jobs';
import type { SearchProgressEvent } from '@/features/search-progress/types/search-job';
import type { FlightSearchFormState } from '@/components/search/FlightSearchForm';
import { retrieveSearchBridge, clearSearchBridge, storeSearchBridge } from '@/lib/search-bridge';
import {
  canonicalSearchKey,
  consumeScrollAnchor,
  loadSearchCache,
  saveLastUrl,
  saveSearchCache,
} from '@/lib/utils/search-cache';

interface HotelCachePayload {
  hotels: CombinedHotelCard[];
  searchKey?: string;
  originalTotal?: number;
  partialResults?: boolean;
  agentRates?: [string, Array<{ rateId: string; roomName: string; boardName: string; net: number; currency: string }>][];
}
import { buildHotelSearchPayload } from '@/features/hotels/utils/build-search-payload';
import { applyHotelFilters, computeHotelFilterOptions } from '@/lib/filters/hotel-filters';
import type { PriceSpace } from '@/lib/filters/flight-filters';
import { useDebouncedValue } from '@/hooks/useDebouncedFilter';
import { useLoadMore } from '@/hooks/useSearchPersistence';
import { upsertMerge, upsertMergeLocked, sortOnce } from '@/lib/utils/search-ordering';
import { getPriceBreakdownSetting } from '@/features/admin/api/admin-settings';
import { startTransition } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;

type SearchMode = 'flights' | 'hotels';

// WS2.4: cap skeleton placeholders to roughly one viewport. A large
// multi-supplier search used to mount hundreds of skeleton cards
// (1,200+ nodes), freezing the main thread; 6 rows is enough.
const SKELETON_COUNT = 6;


function defaultCheckIn(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function defaultCheckOut(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

function getFlightDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const DEFAULT_ROOMS: RoomForm[] = [
  { adults: '2', children: '0', childAges: '' },
];

function parseSearchParams(sp: URLSearchParams): FormState {
  let roomsList = DEFAULT_ROOMS;
  try {
    const roomsParam = sp.get('rooms');
    if (roomsParam) {
      const parsed = JSON.parse(roomsParam);
      if (Array.isArray(parsed) && parsed.length > 0) {
        roomsList = parsed;
      }
    }
  } catch { /* ignore */ }

  const bridge = retrieveSearchBridge<{
    selectedDestination: import('@/features/autocomplete/types').TravelSuggestion | null;
    selectedHotel: import('@/features/autocomplete/types').TravelSuggestion | null;
  }>('hotels');

  const selectedDestination = bridge?.selectedDestination ?? null;
  const selectedHotel = bridge?.selectedHotel ?? null;

  if (bridge) clearSearchBridge('hotels');

  // Deep-link support: a shared/bookmarked URL has no session bridge, so
  // synthesize the destination suggestion from the URL params. Without this,
  // validation rejects the search with "Please select a destination from the
  // suggestions" even though destinationName + code are present.
  const destinationName = sp.get('destinationName') || '';
  const destinationCode = sp.get('selectedDestinationCode') || '';
  let synthesizedDestination: import('@/features/autocomplete/types').TravelSuggestion | null = null;
  if (!selectedDestination && (destinationName.trim() || destinationCode.trim())) {
    const cleanName = destinationName.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || destinationCode;
    synthesizedDestination = {
      id: destinationCode || `deep-link:${cleanName}`,
      module: 'hotels',
      type: 'HOTEL_DESTINATION',
      label: destinationName,
      subtitle: '',
      code: destinationCode || undefined,
      destinationCode: destinationCode || undefined,
      searchPayload: {
        ...(destinationCode && !destinationCode.startsWith('gn-') ? { destinationCode } : {}),
        destinationName: cleanName,
      },
    };
  }

  return {
    checkIn: sp.get('checkIn') || defaultCheckIn(),
    checkOut: sp.get('checkOut') || defaultCheckOut(),
    destinationName,
    selectedDestinationCode: destinationCode,
    selectedDestination: selectedDestination ?? synthesizedDestination,
    hotelName: sp.get('hotelName') || '',
    selectedHotel,
    roomsList,
    nationality: sp.get('nationality') || 'AE',
  };
}

function hasValidSearchParams(sp: URLSearchParams): boolean {
  return !!(sp.get('destinationName') || sp.get('hotelName'));
}

function HotelSearchResultsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { isAgent, isAdmin, user, isAuthLoading } = useAuth();
  // Agent module guard (backend enforces too): agents without the booking
  // permission go back to /agent — guests/customers/staff unaffected.
  useEffect(() => {
    if (isAuthLoading || !isAgent || (user?.permissions ?? []).includes('agent:book_hotels')) return;
    toast.error('Hotels booking is not enabled for your account.');
    router.replace('/agent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAgent, user, router]);
  const { convertAmount, formatPrice, selectedCurrency } = useCurrency();

  // Form state
  const [form, setForm] = useState<FormState>(() => parseSearchParams(searchParams));
  const [searchMode, setSearchMode] = useState<SearchMode>('hotels');
  const [flightForm, setFlightForm] = useState<FlightSearchFormState>({
    origin: '',
    destination: '',
    departureDate: getFlightDate(14),
    returnDate: getFlightDate(21),
    tripType: 'round_trip',
    cabinClass: 'Economy',
    adults: 1,
    originSuggestion: null,
    destinationSuggestion: null,
    legs: [
      { origin: '', destination: '', departureDate: getFlightDate(14) },
      { origin: '', destination: '', departureDate: getFlightDate(21) },
    ],
    legSuggestions: [null, null],
  });

  // Results state
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allHotels, setAllHotels] = useState<CombinedHotelCard[]>([]);
  const [progressiveCount, setProgressiveCount] = useState(0);
  const [isProgressive, setIsProgressive] = useState(false);
  const [searchKey, setSearchKey] = useState<string>('');
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [partialResults, setPartialResults] = useState(false);
  const [hotelFilters, setHotelFilters] = useState<HotelFilters>(defaultHotelFilters());

  // Price filters live in the ACTIVE display currency. A currency switch
  // invalidates stored bounds, so reset just the price slice.
  const priceSpace = useMemo<PriceSpace>(
    () => ({
      toSelected: (amount: number, currency: string) => convertAmount(amount, currency),
      formatRange: (min: number, max: number | null) =>
        max == null
          ? `${formatPrice(min, selectedCurrency.code)}+`
          : `${formatPrice(min, selectedCurrency.code)} – ${formatPrice(max, selectedCurrency.code)}`,
    }),
    [convertAmount, formatPrice, selectedCurrency.code],
  );
  // Price filters live in the ACTIVE display currency — reset just the price
  // slice when it changes (render-phase adjustment, the React-endorsed
  // derived-state pattern; avoids a setState-in-effect cascade).
  const prevCurrencyRef = useRef(selectedCurrency.code);
  if (prevCurrencyRef.current !== selectedCurrency.code) {
    prevCurrencyRef.current = selectedCurrency.code;
    setHotelFilters((f) => ({ ...f, priceRanges: [], priceMin: undefined, priceMax: undefined }));
  }
  const [currentSort, setCurrentSort] = useState<'price_asc' | 'price_desc' | 'rating' | 'name'>('price_asc');
  // WS1.2: an explicit user sort applies immediately — even mid-stream.
  // Until the user touches the sort bar (or the search completes), results
  // render in supplier arrival order so late chunks never reshuffle cards.
  const [sortTouched, setSortTouched] = useState(false);
  const isStreaming = loading && isProgressive;
  const [originalTotal, setOriginalTotal] = useState(0);

  const { state: progState, presentation: progPres, dispatch } = useSearchProgress();
  const sseRef = useRef<{ close: () => void } | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allHotelsRef = useRef<CombinedHotelCard[]>([]);

  useEffect(() => {
    allHotelsRef.current = allHotels;
  }, [allHotels]);

  // Pre-warm the price-breakdown setting so the very first card never waits
  // on a settings fetch at render time (shared React Query cache).
  useEffect(() => {
    getPriceBreakdownSetting().catch(() => {});
  }, []);

  // Restore scroll to the hotel the user came back from (consume-once anchor).
  useEffect(() => {
    if (loading || !hasSearched || allHotels.length === 0) return;
    const anchor = consumeScrollAnchor('hotels');
    if (!anchor) return;
    const t = setTimeout(() => {
      document
        .querySelector(`[data-offer-id="${CSS.escape(anchor)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasSearched, allHotels.length]);

  // Empty-state destination chips: apply the destination to form state,
  // then run the search once the updated form has committed (performSearch
  // reads `form` from closure and would otherwise see a stale value).
  const pendingChipSearchRef = useRef<{ destination: string; nonce: number } | null>(null);
  function searchFromEmptyState(destinationName: string) {
    // Nonce makes every card click unique, so re-clicking the same
    // destination (no form change) still triggers the effect below
    // instead of silently doing nothing.
    pendingChipSearchRef.current = {
      destination: destinationName,
      nonce: Date.now(),
    };
    // Synthesize the suggestion exactly like a deep-link search does
    // (parseSearchParams). Without a selectedDestination object, validation
    // rejects the chip search with "Please select a destination from the
    // suggestions", and the autocomplete input shows an unselected string
    // that forces the user to re-pick the same destination from the modal.
    const cleanName = destinationName.replace(/\s*\([^)]*\)\s*/g, ' ').trim() || destinationName;
    const chipSuggestion: import('@/features/autocomplete/types').TravelSuggestion = {
      id: `chip:${cleanName.toLowerCase()}`,
      module: 'hotels',
      type: 'HOTEL_DESTINATION',
      label: destinationName,
      subtitle: '',
      searchPayload: { destinationName: cleanName },
    };
    setForm((prev) => ({
      ...prev,
      destinationName,
      selectedDestination: chipSuggestion,
      selectedDestinationCode: '',
      hotelName: '',
      selectedHotel: null,
    }));
  }
  useEffect(() => {
    const pending = pendingChipSearchRef.current;
    if (pending === null || form.destinationName !== pending.destination) return;
    pendingChipSearchRef.current = null;
    performSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.destinationName, pendingChipSearchRef.current?.nonce]);

  const minDate = useMemo(() => {
    const today = new Date();
    today.setDate(today.getDate() + 1);
    return today.toISOString().slice(0, 10);
  }, []);

  // Auto-search on mount. Fresh TTL cache short-circuits the network so
  // back-navigation from a hotel detail page restores instantly.
  useEffect(() => {
    if (hasValidSearchParams(searchParams)) {
      const cached = loadSearchCache<HotelCachePayload>('hotels', canonicalSearchKey(searchParams));
      if (cached && cached.hotels.length > 0) {
        const raf = requestAnimationFrame(() => {
          setForm(parseSearchParams(searchParams));
          setAllHotels(cached.hotels);
          setSearchKey(cached.searchKey ?? '');
          setOriginalTotal(cached.originalTotal ?? cached.hotels.length);
          if (cached.partialResults != null) setPartialResults(cached.partialResults);

          setLoading(false);
          setHasSearched(true);
        });
        return () => cancelAnimationFrame(raf);
      } else {
        performSearch();
      }
    }
    // Cleanup: close SSE and mark search as stale on unmount
    return () => {
      activeJobIdRef.current = null;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      sseRef.current?.close();
      sseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update URL after results are committed (not inside async .then to avoid state race)
  const pendingUrlUpdate = useRef(false);
  useEffect(() => {
    if (!pendingUrlUpdate.current) return;
    pendingUrlUpdate.current = false;
    const params = new URLSearchParams();
    params.set('destinationName', form.destinationName);
    params.set('selectedDestinationCode', form.selectedDestinationCode);
    params.set('hotelName', form.hotelName);
    params.set('checkIn', form.checkIn);
    params.set('checkOut', form.checkOut);
    params.set('nationality', form.nationality);
    params.set('rooms', JSON.stringify(form.roomsList));
    const url = `/hotels/search?${params.toString()}`;
    saveLastUrl('hotels-search', url);
    router.replace(url, { scroll: false });
  }, [allHotels, form, router]);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateRoomField(index: number, key: keyof RoomForm, value: string) {
    setForm((prev) => {
      const next = [...prev.roomsList];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, roomsList: next };
    });
  }

  function handleFlightSearch() {
    storeSearchBridge('flights', {
      originSuggestion: flightForm.originSuggestion,
      destinationSuggestion: flightForm.destinationSuggestion,
    });
    const params = new URLSearchParams();
    params.set('origin', flightForm.originSuggestion?.code ?? flightForm.origin);
    params.set('destination', flightForm.destinationSuggestion?.code ?? flightForm.destination);
    params.set('departureDate', flightForm.departureDate);
    params.set('tripType', flightForm.tripType);
    params.set('cabinClass', flightForm.cabinClass);
    params.set('adults', String(flightForm.adults));
    if (flightForm.tripType === 'round_trip' && flightForm.returnDate) {
      params.set('returnDate', flightForm.returnDate);
    }
    router.push(`/flights/search?${params.toString()}`);
  }

  // Map frontend sort to backend sort field
  function mapSortToBackend(sort: string): { field: string; order: 'asc' | 'desc' } {
    switch (sort) {
      case 'price_asc': return { field: 'price', order: 'asc' };
      case 'price_desc': return { field: 'price', order: 'desc' };
      case 'rating': return { field: 'rating', order: 'desc' };
      case 'name': return { field: 'name', order: 'asc' };
      default: return { field: 'price', order: 'asc' };
    }
  }

  // ── Local filtering with debouncing ──
  const debouncedFilters = useDebouncedValue(hotelFilters, 150);
  
  const filteredHotels = useMemo(() => {
    if (allHotels.length === 0) return { items: [], total: 0 };

    const filtered = applyHotelFilters(allHotels, debouncedFilters, priceSpace);

    // WS1.1: freeze ordering while streaming — arrival order, no implicit
    // re-sort per chunk. Sorting happens once on completion or immediately
    // when the user explicitly picks a sort (WS1.2).
    const sorted = isStreaming && !sortTouched
      ? filtered
      : sortOnce(
          filtered,
          currentSort,
          (h) => {
            const dp = h.pricing?.displayPrice;
            const amount = dp?.amount ?? h.minPrice?.amount ?? Infinity;
            const currency = dp?.currency ?? h.minPrice?.currency ?? selectedCurrency.code;
            return priceSpace.toSelected(amount, currency);
          },
          (h) => h.starRating ?? 0,
          (h) => (h.displayName ?? '').toLowerCase(),
        );

    return { items: sorted, total: filtered.length };
  }, [allHotels, debouncedFilters, isStreaming, sortTouched, currentSort, priceSpace]);

  // ── Load More pagination ──
  // Capped low (same Bug-009 class as flights): 200 initial hotel cards
  // froze low-end devices. Button shows while anything remains.
  const { displayedItems, hasMore, remainingCount, showLoadMore, loadMore } = useLoadMore(
    filteredHotels.items,
    50, // initial count — first viewport + buffer
    50, // increment — one screen per tap
    1, // show button while anything remains
  );

  const hasItems = hasMore || displayedItems.length > 0;

  function parseCsvNumbers(value: string): number[] {
    return value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((num) => Number.isFinite(num));
  }

  function validateForm(): string | null {
    if (!form.checkIn.trim() || !form.checkOut.trim()) {
      return 'Check-in and check-out dates are required.';
    }
    if (!isIsoDate(form.checkIn) || !isIsoDate(form.checkOut)) {
      return 'Dates must be YYYY-MM-DD.';
    }
    if (!Array.isArray(form.roomsList) || form.roomsList.length === 0) {
      return 'At least one room occupancy is required.';
    }
    for (let i = 0; i < form.roomsList.length; i++) {
      const room = form.roomsList[i];
      const adults = Number(room.adults) || 1;
      const children = Number(room.children) || 0;
      if (adults < 1) {
        return `Adults is required for room #${i + 1} (min 1).`;
      }
      const childAges = room.childAges.trim() ? parseCsvNumbers(room.childAges) : [];
      if (children > 0 && childAges.length !== children) {
        return `Provide child ages for each child in room #${i + 1} (comma-separated).`;
      }
      if (children === 0 && childAges.length > 0) {
        return `Remove child ages when children is 0 in room #${i + 1}.`;
      }
    }
    if (!form.destinationName.trim() && !form.hotelName.trim()) {
      return 'Enter a destination or a hotel name to search.';
    }
    if (form.destinationName.trim() && !form.selectedDestination && !form.selectedHotel) {
      return 'Please select a destination from the suggestions.';
    }
    if (form.hotelName.trim() && !form.selectedHotel) {
      return 'Please select a hotel from the suggestions.';
    }
    // Hotel-name search is independent of destination — no destination/geo
    // required when a specific hotel was chosen from the suggestions.
    return null;
  }

  async function performSearch() {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setPartialResults(false);
    setActiveSearchId(null);
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }

    const requestPayload = buildHotelSearchPayload(form, { page: 1, pageSize: 100, currency: selectedCurrency.code });

    // Close any previous SSE connection
    sseRef.current?.close();
    sseRef.current = null;
    setProgressiveCount(0);
    setIsProgressive(false);
    setPartialResults(false);
    // WS1.2: a new search returns to arrival-order streaming.
    setSortTouched(false);
    dispatch({ type: 'RESET' });

    // Generate a unique ID for this search invocation to prevent stale results
    const jobId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeJobIdRef.current = jobId;

    try {
      // Progress bar appears INSTANTLY: claim the progress context with a
      // local pending id BEFORE the network round-trip. The job POST can take
      // 1-3s; previously the bar waited for its response, which users read
      // as a broken delay. Suppliers populate with the first SSE event.
      dispatch({
        type: 'START_JOB',
        searchId: jobId,
        kind: 'hotels',
        suppliers: [],
      });

      // Start background search job
      const job = await startSearchJob('hotels', requestPayload);

      // If another search started while we were waiting for the job, bail out
      if (activeJobIdRef.current !== jobId) return;

      setSearchKey('');
      setActiveSearchId(job.searchId);

      // Re-bind the same run to the real server-side searchId without
      // resetting run state (keeps the bar moving smoothly).
      dispatch({ type: 'BIND_JOB', searchId: job.searchId });

      // Subscribe to SSE events for real-time progress
      let completed = false;
      const seenHotelGroupIds = new Set<string>();
      const { close } = subscribeToSearchJobEvents(
        job.searchId,
        job.eventsUrl,
        (event: SearchProgressEvent) => {
          // Ignore events from a stale search
          if (activeJobIdRef.current !== jobId) {
            return;
          }
          dispatch({ type: 'EVENT', event });

          // Progressive: consume enriched display-ready hotel chunks
          if (event.type === 'supplier_results_ready' && !completed) {
            const readyHotels = (event.results ?? []) as CombinedHotelCard[];
            if (readyHotels.length > 0) {
              if (event.searchKey && !searchKey) {
                setSearchKey(event.searchKey);
              }
              setIsProgressive(true);

              if (event.appendMode === 'merge') {
                // WS1.5: upsert in place — new suppliers append at the bottom,
                // existing cards never move.
                setAllHotels((prev) => {
                  const next = upsertMerge(prev, readyHotels, (h) => h.hotelGroupId);
                  for (const hotel of readyHotels) seenHotelGroupIds.add(hotel.hotelGroupId);
                  setProgressiveCount(next.length);
                  dispatch({ type: 'UPDATE_PROGRESSIVE_COUNT', count: next.length });
                  return next;
                });
              } else {
                const newHotels: CombinedHotelCard[] = [];
                for (const hotel of readyHotels) {
                  if (!seenHotelGroupIds.has(hotel.hotelGroupId)) {
                    seenHotelGroupIds.add(hotel.hotelGroupId);
                    newHotels.push(hotel);
                  }
                }
                if (newHotels.length > 0) {
                  setAllHotels((prev) => {
                    const next = [...prev, ...newHotels];
                    setProgressiveCount(next.length);
                    dispatch({ type: 'UPDATE_PROGRESSIVE_COUNT', count: next.length });
                    return next;
                  });
                }
              }
            }
          }

          // Enrichment patch: WS1.4 — fill content fields only. The
          // first-painted minPrice is locked so enrichment can never move a
          // card's price (or its position) after the user has seen it.
          if (event.type === 'supplier_results_enriched' && !completed) {
            const enrichedHotels = (event.results ?? []) as CombinedHotelCard[];
            if (enrichedHotels.length > 0) {
              setAllHotels((prev) => upsertMergeLocked(prev, enrichedHotels, (h) => h.hotelGroupId));
            }
          }

          // On terminal event, fetch the final result
          if (event.type === 'search_completed' && !completed) {
            completed = true;
            if (watchdogRef.current) {
              clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
            setActiveSearchId(null);

            fetchSearchJobResult<CombinedHotelSearchResponse>(job.resultUrl)
              .then((result) => {
                if (activeJobIdRef.current !== jobId) {
                  return;
                }
                const responseHotels: CombinedHotelCard[] = Array.isArray(result.hotels) ? result.hotels : [];
                const providerResults = result.providerResults ?? [];

                const anyOk = providerResults.some((pr) => pr.status === 'ok');
                const allOk = providerResults.every((pr) => pr.status === 'ok');
                setPartialResults(!allOk && anyOk);

                // WS2.2 + WS1.4: /result is reconciliation-only — merge it
                // with price locking (fill missing content, never repaint
                // prices) inside a startTransition so the authoritative
                // reconciliation happens once, off the critical path.
                startTransition(() => {
                  setSearchKey(result.searchKey ?? '');
                  setOriginalTotal(result.meta?.pagination?.total ?? responseHotels.length);
                  setIsProgressive(false);
                  setAllHotels((prev) =>
                    upsertMergeLocked(prev, responseHotels, (h) => h.hotelGroupId),
                  );
                  const merged = upsertMergeLocked(allHotelsRef.current, responseHotels, (h) => h.hotelGroupId);
                  saveSearchCache<HotelCachePayload>('hotels', canonicalSearchKey(searchParams), {
                    hotels: merged,
                    searchKey: result.searchKey ?? '',
                    originalTotal: result.meta?.pagination?.total ?? merged.length,
                    partialResults: !allOk && anyOk,
                  });
                  pendingUrlUpdate.current = true;
                });
              })
              .catch((err) => {
                if (activeJobIdRef.current !== jobId) return;
                const msg = err instanceof Error ? err.message : 'Failed to fetch results.';
                setError(msg);
                setAllHotels([]);
                toast.error('Hotel search failed', msg);
              })
              .finally(() => {
                if (activeJobIdRef.current !== jobId) return;
                setLoading(false);
              });
          }

          if (event.type === 'search_failed' && !completed) {
            completed = true;
            if (watchdogRef.current) {
              clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
            setActiveSearchId(null);
            // User cancelled by clicking an offer — keep current UI state silently
            if (event.code === 'CANCELLED') {
              setIsProgressive(false);
              setLoading(false);
              return;
            }
            // Keep progressive results if some providers already delivered —
            // wiping them for a supplier-level failure loses good data.
            if (allHotelsRef.current.length > 0) {
              setPartialResults(true);
              setIsProgressive(false);
              setLoading(false);
              return;
            }
            // Show specific error based on failure code
            let msg = 'All providers failed. Please try again.';
            if (event.code === 'ALL_SUPPLIERS_FAILED') {
              msg = 'No hotel providers could be reached. Please try again later.';
            } else if (event.code === 'TIMEOUT') {
              msg = 'Search timed out. Some providers may be experiencing delays.';
            }
            setError(msg);
            setAllHotels([]);
            setIsProgressive(false);
            toast.error('Hotel search failed', msg);
            setLoading(false);
          }
        },
        () => {
          // SSE error — only fall back if this is still the active search
          if (!completed && activeJobIdRef.current === jobId) {
            completed = true;
            if (watchdogRef.current) {
              clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
            setActiveSearchId(null);
            fallbackSearch(requestPayload);
          }
        },
      );

      sseRef.current = { close };

      // Watchdog: if no terminal event arrives (backend hang, dead SSE),
      // stop the spinner and keep whatever results arrived progressively.
      watchdogRef.current = setTimeout(() => {
        if (!completed && activeJobIdRef.current === jobId) {
          completed = true;
          sseRef.current?.close();
          sseRef.current = null;
          setActiveSearchId(null);
          setIsProgressive(false);
          setLoading(false);
          if (allHotelsRef.current.length > 0) {
            setPartialResults(true);
          } else {
            const msg = 'Search timed out. Please try again.';
            setError(msg);
            toast.error('Hotel search timed out', msg);
          }
        }
      }, 90_000);
    } catch {
      // Job creation failed — fall back to synchronous search
      setActiveSearchId(null);
      if (activeJobIdRef.current === jobId) {
        fallbackSearch(requestPayload);
      }
    }
  }

  async function fallbackSearch(requestPayload: Record<string, unknown>) {
    try {
      const response = await searchHotels(requestPayload as unknown as HotelSearchInput);

      const responseHotels: CombinedHotelCard[] = Array.isArray(response.hotels) ? response.hotels : [];
      const providerResults = response.providerResults ?? [];

      const anyOk = providerResults.some((pr) => pr.status === 'ok');
      const allOk = providerResults.every((pr) => pr.status === 'ok');
      setPartialResults(!allOk && anyOk);

      setAllHotels(responseHotels);
      setSearchKey(response.searchKey ?? '');
      setOriginalTotal(responseHotels.length);

      pendingUrlUpdate.current = true;
    } catch (err) {
      dispatch({ type: 'RESET' }); // job never started — no phantom searching bar
      const msg = err instanceof Error ? err.message : 'Search failed.';
      setError(msg);
      setAllHotels([]);
      toast.error('Hotel search failed', msg);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    performSearch();
  }

  // Build filter groups from computed options (client-side)
  const computedFilterGroups = useMemo(() => {
    if (allHotels.length === 0) return undefined;
    const options = computeHotelFilterOptions(allHotels, priceSpace);
    const groups: import('@/lib/filters/types').FilterGroup[] = [];

    if (allHotels.some((h) => ((h.pricing?.displayPrice?.amount ?? h.minPrice?.amount) ?? 0) > 0)) {
      const maxPrice = Math.max(
        ...allHotels.map((h) => {
          const dp = h.pricing?.displayPrice;
          const amount = dp?.amount ?? h.minPrice?.amount ?? 0;
          const currency = dp?.currency ?? h.minPrice?.currency ?? selectedCurrency.code;
          return priceSpace.toSelected(amount, currency);
        }),
      );
      const sliderMax = Math.ceil(maxPrice / 50) * 50;
      const preset = (minUsd: number, maxUsd: number | null): { label: string; min: number; max: number } => {
        const min = priceSpace.toSelected(minUsd, 'USD');
        const max = maxUsd == null ? sliderMax : priceSpace.toSelected(maxUsd, 'USD');
        return { label: priceSpace.formatRange(min, maxUsd == null ? null : max), min, max };
      };
      groups.push({
        id: 'price', title: 'Price range',
        icon: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        type: 'price_slider',
        options: [],
        priceRange: { min: 0, max: sliderMax },
        pricePresets: [
          preset(0, 100),
          preset(100, 200),
          preset(200, 400),
          preset(400, 800),
          preset(800, null),
        ],
      });
    }

    groups.push({
      id: 'star_rating', title: 'Star rating',
      icon: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
      type: 'star_radio',
      options: [],
      starCounts: Object.fromEntries(options.starRating.map((s) => [parseInt(s.key ?? '0'), s.count ?? 0])),
    });

    if (options.amenities.length > 0) {
      groups.push({
        id: 'amenities', title: 'Amenities',
        icon: 'M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42',
        type: 'checkbox',
        options: options.amenities,
      });
    }

    groups.push({
      id: 'free_cancellation', title: 'Free Cancellation',
      icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      type: 'toggle',
      options: [{ label: 'Free cancellation' }],
    });

    // Supplier filter — admin only
    if (isAdmin) {
      const supplierMap = new Map<string, number>();
      for (const hotel of allHotels) {
        for (const provider of hotel.providers ?? []) {
          const key = provider.provider ?? 'unknown';
          supplierMap.set(key, (supplierMap.get(key) ?? 0) + 1);
        }
      }
      if (supplierMap.size > 1) {
        const supplierOptions = Array.from(supplierMap.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({
            key,
            label: key.charAt(0).toUpperCase() + key.slice(1),
            count,
          }));
        groups.push({
          id: 'suppliers',
          title: 'Supplier',
          icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
          type: 'checkbox',
          options: supplierOptions,
        });
      }
    }

    return groups;
  }, [allHotels, isAdmin, priceSpace]);

  const destDisplay = form.destinationName.replace(/\([^)]+\)/g, '').trim() || form.hotelName || 'Hotels';

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-zinc-50/50 via-white to-white overflow-x-hidden w-full">
      {/* Search Section */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pt-4 pb-2">
        <div className="flex flex-col items-center gap-2 py-2 sm:py-3">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full"
          >
            <SearchSection
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
              flightForm={flightForm}
              onFlightFormChange={(updates) => setFlightForm((prev) => ({ ...prev, ...updates }))}
              onFlightSearch={handleFlightSearch}
              hotelForm={form}
              onHotelFieldChange={updateField}
              onHotelRoomChange={updateRoomField}
              onHotelSubmit={handleSubmit}
              onHotelFormSet={setForm}
              hotelMinDate={minDate}
              hotelPending={loading}
              showInternalSwitcher={false}
            />
          </motion.div>
        </div>
      </div>

      <SearchProgressHeader onDismiss={() => dispatch({ type: 'DISMISS' })} />

      {/* Main Content */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
          {/* Mobile filter toggle */}
          {hasSearched && (
          <div className="flex items-center justify-between lg:hidden">
            <button
              type="button"
              onClick={() => setMobileFilterOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl border border-brand-teal/15 bg-white px-4 py-2.5 text-sm font-medium text-brand-teal shadow-sm transition-all hover:border-brand-teal/40 hover:bg-brand-teal/5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
              </svg>
              Filters
              {filteredHotels.total > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal/10 text-[10px] font-bold text-brand-teal">
                  {filteredHotels.total}
                </span>
              )}
            </button>

            {allHotels.length > 0 && (
              <p className="text-sm text-[#7d7d7d]">
                <span className="font-semibold text-charcoal">{filteredHotels.total}</span> of <span className="text-charcoal">{allHotels.length}</span> results
              </p>
            )}
          </div>
          )}

          {/* Filter sidebar - Mobile */}
          <AnimatePresence initial={false}>
            {mobileFilterOpen && (
              <motion.div
                key="sidebar"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease }}
                className="w-full shrink-0 overflow-hidden lg:hidden"
              >
                <div className="pb-4">
                  <FilterSidebar
                    mode="hotels"
                    hotelFilters={hotelFilters}
                    onHotelFilterChange={setHotelFilters}
                    dynamicGroups={computedFilterGroups}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop sidebar */}
          {hasSearched && allHotels.length > 0 && (
          <div className="hidden w-60 shrink-0 lg:block">
            <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1 custom-scrollbar">
              <FilterSidebar
                mode="hotels"
                hotelFilters={hotelFilters}
                onHotelFilterChange={setHotelFilters}
                dynamicGroups={computedFilterGroups}
              />
            </div>
          </div>
          )}

          {/* Results */}
          <main className="min-w-0 flex-1 overflow-hidden">

            {loading && allHotels.length === 0 && progressiveCount === 0 && !error && (
              <HotelSearchSkeleton count={SKELETON_COUNT} />
            )}

            {/* Progressive indicator */}
            {loading && isProgressive && progressiveCount > 0 && allHotels.length === 0 && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-brand-teal/15 bg-brand-teal/5 px-4 py-3 text-sm text-brand-teal/80 shadow-sm">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-teal" />
                <span>{progressiveCount} hotel{progressiveCount !== 1 ? 's' : ''} found so far — searching remaining sources...</span>
              </div>
            )}

            {/* Partial success banner */}
            {!loading && partialResults && hasSearched && allHotels.length > 0 && hasItems && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease }}
                className="mb-4"
              >
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-800 shadow-sm">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span>A few suppliers couldn't be reached — showing everything else we found.</span>
                </div>
              </motion.div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="mb-6">
                <PremiumError message={error} onRetry={() => { setError(null); performSearch(); }} />
              </div>
            )}

            {/* Zero results from initial search (no hotels at all) */}
            {!loading && !error && hasSearched && allHotels.length === 0 && !isProgressive && (
              <PremiumEmpty
                title="No hotels found"
                message="Try adjusting your dates, destination, or search criteria."
                icon="hotel"
              />
            )}

            {/* Zero results after filtering (hotels exist but none match filters) */}
            {!loading && !error && hasSearched && allHotels.length > 0 && !hasItems && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="mx-auto max-w-lg py-12 text-center"
              >
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50">
                  <svg className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-charcoal">No results match your filters</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#545454]">
                  We found <strong>{allHotels.length}</strong> hotel{allHotels.length !== 1 ? 's' : ''} for your search, but none match your current filter selections. Try adjusting or clearing your filters to see more options.
                </p>
                <button
                  type="button"
                  onClick={() => setHotelFilters(defaultHotelFilters())}
                  className="mt-5 inline-flex items-center gap-1.5 rounded-xl border border-brand-teal/20 bg-white px-4 py-2.5 text-sm font-semibold text-brand-teal shadow-sm transition-all hover:border-brand-teal/40 hover:bg-brand-teal/5 active:scale-[0.97]"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Clear all filters
                </button>
              </motion.div>
            )}

            {/* Active filter chips */}
            {!loading && hasItems && (
              <ActiveFilterChips
                filters={hotelFilters}
                onReset={() => setHotelFilters(defaultHotelFilters())}
                resultCount={filteredHotels.total}
                totalCount={allHotels.length}
              />
            )}

            {/* Results header with SortBar */}
            {!loading && hasItems && (
              <SortBar
                total={filteredHotels.total}
                destination={destDisplay}
                currentSort={currentSort}
                onSortChange={(sort) => { setSortTouched(true); setCurrentSort(sort); }}
              />
            )}

            {/* Results list — plain divs: per-card motion stagger over 50+
                cards cost frames on every filter keystroke. */}
            {hasItems && (
              <div className="space-y-4 mt-4 overflow-hidden">
                <div className="grid gap-4 min-w-0 overflow-hidden">
                  {displayedItems.map((hotel) => (
                    <div
                      key={hotel.hotelGroupId}
                      className="search-result-card min-w-0"
                      data-offer-id={hotel.hotelGroupId}
                    >
                      <HotelResultCard
                        hotel={hotel}
                        checkIn={form.checkIn}
                        checkOut={form.checkOut}
                        roomsList={form.roomsList}
                        searchKey={searchKey}
                        searchId={activeSearchId ?? undefined}
                        mode={isAgent ? 'agent' : 'customer'}

                      />
                    </div>
                  ))}
                </div>

                {/* Load More — while anything remains */}
                {showLoadMore && (
                  <div className="flex justify-center py-6">
                    <button
                      type="button"
                      onClick={loadMore}
                      className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
                    >
                      Load more ({remainingCount} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Initial state */}
            {!hasSearched && !loading && (
              <HotelSearchEmptyState onSearch={searchFromEmptyState} />
            )}

          </main>
        </div>
      </div>

    </div>
  );
}

export default function HotelSearchResultsPage() {
  const t = useTranslations('Hotels');
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-white">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-brand-teal/10 border-t-brand-teal" />
            <p className="text-sm font-medium text-[#545454]">Loading search...</p>
          </div>
        </div>
      }
    >
      <SearchProgressProvider>
        <HotelSearchResultsInner />
      </SearchProgressProvider>
    </Suspense>
  );
}
