'use client';
import { useTranslations } from 'next-intl';

import { useState, useEffect, useMemo, useCallback, useRef, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { SearchSection } from '@/components/search/SearchSection';

import { FilterSidebar } from '@/components/search/FilterSidebar';
import { SortBar } from '@/components/search/SortBar';
import type { FormState, RoomForm } from '@/features/hotels/types/search-form';
import type { FlightFilters } from '@/lib/filters/types';
import { defaultFlightFilters } from '@/lib/filters/types';
import { applyFlightFilters, computeFlightFilterOptions, getOfferDisplayMoney, type PriceSpace } from '@/lib/filters/flight-filters';
import { searchFlights } from '@/features/flights/api/search-flights';
import type { FlightSearchInput } from '@/features/flights/api/search-flights';
import type { FlightSearchView } from '@/lib/schema/flight';
import type { FlightOfferView } from '@/lib/schema/flight';
import type { MarkedUpOffer } from '@/features/agent/api/agent-bookings';
import { FlightResultCard } from '@/features/flights/components/flight-result-card';
import { validateSearchInput } from '@/features/flights/utils/validation';
import { PremiumError, PremiumEmpty } from '@/components/ui/state/premium-states';
import { ActiveFilterChips } from '@/components/search/ActiveFilterChips';
import { useToast } from '@/hooks/useToast';
import { useAuth } from '@/hooks/useAuth';
import { useCurrency } from '@/context/CurrencyContext';
import { FlightSearchSkeleton } from '@/features/flights/components/FlightSearchSkeleton';
import { SearchProgressProvider, useSearchProgress } from '@/context/SearchProgressContext';
import { SearchProgressHeader } from '@/components/search/SearchProgressHeader';
import { FlightSearchEmptyState } from '@/components/search/FlightSearchEmptyState';
import { startSearchJob, subscribeToSearchJobEvents, fetchSearchJobResult } from '@/features/search-progress/api/search-jobs';
import type { SearchProgressEvent } from '@/features/search-progress/types/search-job';
import { retrieveSearchBridge, storeSearchBridge } from '@/lib/search-bridge';
import { searchTravelLocations } from '@/features/autocomplete/api';
import type { TravelSuggestion } from '@/features/autocomplete/types';
import {
  canonicalSearchKey,
  consumeScrollAnchor,
  loadSearchCache,
  saveLastUrl,
  saveSearchCache,
} from '@/lib/utils/search-cache';

interface FlightCachePayload {
  offers: FlightOfferView[];
  searchKey?: string;
}
import { useDebouncedValue } from '@/hooks/useDebouncedFilter';
import { useLoadMore } from '@/hooks/useSearchPersistence';
import { upsertMergeLocked, sortOnce, flightOfferKey } from '@/lib/utils/search-ordering';
import { getPriceBreakdownSetting } from '@/features/admin/api/admin-settings';
import { startTransition } from 'react';

const ease = [0.16, 1, 0.3, 1] as const;

// WS2.4: cap skeleton placeholders to roughly one viewport. A large
// multi-supplier search used to mount hundreds of skeleton cards
// (1,200+ nodes), freezing the main thread; 6 rows is enough.
const SKELETON_COUNT = 6;


interface FlightFormState {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  tripType: 'one_way' | 'round_trip' | 'multi_city';
  adults: number;
  cabinClass: string;
  legs: { origin: string; destination: string; departureDate: string }[];
  legSuggestions: (import('@/features/autocomplete/types').TravelSuggestion | null)[];
  originSuggestion: import('@/features/autocomplete/types').TravelSuggestion | null;
  destinationSuggestion: import('@/features/autocomplete/types').TravelSuggestion | null;
}

type SearchMode = 'flights' | 'hotels';

const DEFAULT_HOTEL_ROOMS: RoomForm[] = [
  { adults: '2', children: '0', childAges: '' },
];

function getDate(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

const CABIN_CLASSES = ['Economy', 'PremiumEconomy', 'Business', 'First', 'PremiumFirst'] as const;

// Deep-link safety: accept any casing (economy, BUSINESS, First) and map to
// the PascalCase values the backend validates against. Unknown values fall
// back to Economy instead of failing the whole search with a 400.
function normalizeCabinClass(raw: string | null): string {
  if (!raw) return 'Economy';
  const compact = raw.replace(/[^a-z]/gi, '').toLowerCase();
  const hit = CABIN_CLASSES.find((c) => c.toLowerCase() === compact);
  return hit ?? 'Economy';
}

function parseSearchParams(sp: URLSearchParams): FlightFormState {
  const bridge = retrieveSearchBridge<{
    originSuggestion: import('@/features/autocomplete/types').TravelSuggestion | null;
    destinationSuggestion: import('@/features/autocomplete/types').TravelSuggestion | null;
  }>('flights', { clear: false });

  const originSuggestion = bridge?.originSuggestion ?? null;
  const destinationSuggestion = bridge?.destinationSuggestion ?? null;

  

  // Deep-link default: hand-typed URLs without tripType/returnDate mean a
  // one-way search (defaulting to round_trip would just error on the
  // missing return date). Canonical URLs generated by the app always set
  // tripType explicitly, so this only affects shared/bookmarked links.
  const explicitTripType = sp.get('tripType') as 'one_way' | 'round_trip' | 'multi_city' | null;
  const tripType = explicitTripType || (sp.get('returnDate') ? 'round_trip' : 'one_way');
  let legs: { origin: string; destination: string; departureDate: string }[] = [];
  if (tripType === 'multi_city') {
    try {
      const parsed = JSON.parse(sp.get('legs') ?? '[]');
      if (Array.isArray(parsed)) legs = parsed;
    } catch { /* invalid JSON */ }
  }

  return {
    origin: originSuggestion?.label ?? (sp.get('origin') || ''),
    destination: destinationSuggestion?.label ?? (sp.get('destination') || ''),
    departureDate: sp.get('departureDate') || '',
    returnDate: sp.get('returnDate') || '',
    tripType,
    cabinClass: normalizeCabinClass(sp.get('cabinClass')),
    adults: Number(sp.get('adults')) || 1,
    legs,
    legSuggestions: new Array(legs.length).fill(null),
    originSuggestion,
    destinationSuggestion,
  };
}

function hasValidSearchParams(sp: URLSearchParams): boolean {
  if (sp.get('tripType') === 'multi_city') {
    try {
      const legs = JSON.parse(sp.get('legs') ?? '[]');
      return Array.isArray(legs) && legs.length >= 2;
    } catch { return false; }
  }
  return !!(sp.get('origin') && sp.get('destination') && sp.get('departureDate'));
}

function FlightSearchResultsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { isAgent, isAdmin, user, isAuthLoading } = useAuth();
  // Agent module guard (backend enforces too): agents without the booking
  // permission go back to /agent — guests/customers/staff unaffected.
  useEffect(() => {
    if (isAuthLoading || !isAgent || (user?.permissions ?? []).includes('agent:book_flights')) return;
    toast.error('Flights booking is not enabled for your account.');
    router.replace('/agent');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isAgent, user, router]);
  const { convertAmount, formatPrice, selectedCurrency } = useCurrency();

  // Form state
  const [form, setForm] = useState<FlightFormState>(() => parseSearchParams(searchParams));
  const formRef = useRef<FlightFormState>(form);

  // Empty-state route cards: apply the route to form state, then run the
  // search once the updated form has committed (performSearch reads
  // formRef.current; the nonce keeps repeat clicks of the same route live).
  const pendingRouteSearchRef = useRef<{ route: string; nonce: number } | null>(null);
  function searchFromEmptyState(origin: string, destination: string) {
    pendingRouteSearchRef.current = { route: `${origin}→${destination}`, nonce: Date.now() };
    const next: FlightFormState = {
      ...formRef.current,
      origin,
      destination,
      tripType: 'round_trip',
      departureDate: getDate(14),
      returnDate: getDate(21),
      legs: [
        { origin, destination, departureDate: getDate(14) },
        { origin: destination, destination: origin, departureDate: getDate(21) },
      ],
    };
    formRef.current = next;
    setForm(next);
  }
  useEffect(() => {
    const pending = pendingRouteSearchRef.current;
    if (pending === null) return;
    const f = formRef.current;
    if (f.origin === pending.route.split('→')[0] && f.destination === pending.route.split('→')[1]) {
      pendingRouteSearchRef.current = null;
      performSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  const [searchMode, setSearchMode] = useState<SearchMode>('flights');
  const [hotelForm, setHotelForm] = useState<FormState>({
    checkIn: getDate(1),
    checkOut: getDate(3),
    destinationName: '',
    selectedDestinationCode: '',
    selectedDestination: null,
    hotelName: '',
    selectedHotel: null,
    roomsList: DEFAULT_HOTEL_ROOMS,
    nationality: 'AE',
  });

  // Results state
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allOffers, setAllOffers] = useState<FlightOfferView[]>([]);
  const [progressiveCount, setProgressiveCount] = useState(0);
  const [isProgressive, setIsProgressive] = useState(false);
  const [partialResults, setPartialResults] = useState(false);
  const [searchKey, setSearchKey] = useState<string | undefined>(undefined);
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [flightFilters, setFlightFilters] = useState<FlightFilters>(defaultFlightFilters());

  // Price filters live in the ACTIVE display currency (slider bounds, preset
  // ranges, comparisons). A currency switch invalidates stored bounds, so
  // reset just the price slice — other filters (airlines, stops) survive.
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
    setFlightFilters((f) => ({ ...f, priceRanges: [], priceMin: undefined, priceMax: undefined }));
  }
  const [currentSort, setCurrentSort] = useState<'price_asc' | 'price_desc' | 'rating' | 'name'>('price_asc');
  // WS6: same ordering contract as hotels — arrival order while streaming,
  // explicit user sort applies immediately, one authoritative sort on completion.
  const [sortTouched, setSortTouched] = useState(false);
  const isStreaming = loading && isProgressive;
  // Seeded from the URL's own trip type (via `form`, not a hardcoded guess)
  // so a fresh page load never mislabels the very first render before any
  // search runs.
  const [searchedTripType, setSearchedTripType] = useState<'one_way' | 'round_trip' | 'multi_city'>(form.tripType);
  const [originalTotal, setOriginalTotal] = useState(0);
  const [agentMarkups, setAgentMarkups] = useState<Map<string, MarkedUpOffer>>(new Map());
  const { dispatch } = useSearchProgress();
  const sseRef = useRef<{ close: () => void } | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const searchAbortControllerRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allOffersRef = useRef<FlightOfferView[]>([]);
  const lastAutoSearchKeyRef = useRef<string | null>(null);
  const searchParamsKey = searchParams.toString();

  useEffect(() => {
    allOffersRef.current = allOffers;
  }, [allOffers]);

  // Pre-warm the price-breakdown setting so the very first card never waits
  // on a settings fetch at render time (shared React Query cache).
  useEffect(() => {
    getPriceBreakdownSetting().catch(() => {});
  }, []);

  // Restore scroll to the offer the user came back from (consume-once anchor).
  useEffect(() => {
    if (loading || !hasSearched || allOffers.length === 0) return;
    const anchor = consumeScrollAnchor('flights');
    if (!anchor) return;
    const t = setTimeout(() => {
      document
        .querySelector(`[data-offer-id="${CSS.escape(anchor)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasSearched, allOffers.length]);

  // Auto-search whenever a valid URL search arrives, including client-side
  // navigation from the homepage hero. Fresh TTL cache short-circuits the
  // network so back-navigation restores instantly.
  useEffect(() => {
    if (hasValidSearchParams(searchParams)) {
      const cached = loadSearchCache<FlightCachePayload>('flights', canonicalSearchKey(searchParams));
      if (cached && cached.offers.length > 0) {
        const raf = requestAnimationFrame(() => {
          lastAutoSearchKeyRef.current = searchParamsKey;
          const nextForm = parseSearchParams(searchParams);
          formRef.current = nextForm;
          setForm(nextForm);
          setAllOffers(cached.offers);
          setSearchKey(cached.searchKey);
          setSearchedTripType(nextForm.tripType);
          setHasSearched(true);
        });
        return () => cancelAnimationFrame(raf);
      }
      if (lastAutoSearchKeyRef.current === searchParamsKey) return;
      lastAutoSearchKeyRef.current = searchParamsKey;
      const nextForm = parseSearchParams(searchParams);
      formRef.current = nextForm;
      setForm(nextForm);
      performSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsKey]);

  // Cleanup: close SSE, clear watchdog, abort requests, and mark search as stale on unmount
  useEffect(() => {
    return () => {
      searchAbortControllerRef.current?.abort();
      activeJobIdRef.current = null;
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, []);

  // Update URL after results are committed (not inside async .then to avoid state race)
  const pendingUrlUpdate = useRef(false);
  useEffect(() => {
    if (!pendingUrlUpdate.current) return;
    pendingUrlUpdate.current = false;
    const params = new URLSearchParams();
    if (form.tripType === 'multi_city' && form.legs.length >= 2) {
      params.set('tripType', 'multi_city');
      params.set('cabinClass', form.cabinClass);
      params.set('adults', String(form.adults));
      params.set('legs', JSON.stringify(form.legs));
    } else if (form.tripType === 'one_way') {
      params.set('origin', form.origin);
      params.set('destination', form.destination);
      params.set('departureDate', form.departureDate);
      params.set('tripType', 'one_way');
      params.set('cabinClass', form.cabinClass);
      params.set('adults', String(form.adults));
    } else {
      params.set('origin', form.origin);
      params.set('destination', form.destination);
      params.set('departureDate', form.departureDate);
      params.set('tripType', form.tripType);
      params.set('cabinClass', form.cabinClass);
      params.set('adults', String(form.adults));
      if (form.returnDate) {
        params.set('returnDate', form.returnDate);
      }
    }
    const nextSearchKey = params.toString();
    lastAutoSearchKeyRef.current = nextSearchKey;
    const url = `/flights/search?${nextSearchKey}`;
    saveLastUrl('flights-search', url);
    router.replace(url, { scroll: false });
  }, [allOffers, form, router]);

  function handleStateChange(updates: Partial<FlightFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...updates };
      formRef.current = next;
      return next;
    });
  }

  function updateHotelField<K extends keyof FormState>(key: K, value: string) {
    setHotelForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateHotelRoom(index: number, key: keyof RoomForm, value: string) {
    setHotelForm((prev) => {
      const roomsList = [...prev.roomsList];
      roomsList[index] = { ...roomsList[index], [key]: value };
      return { ...prev, roomsList };
    });
  }

  // Build the base search payload (filtering is local, so no filter/sort payload sent)
  function buildBasePayload(source: FlightFormState = formRef.current): FlightSearchInput {
    if (source.tripType === 'multi_city' && source.legs.length >= 2) {
      const firstLeg = source.legs[0];
      const lastLeg = source.legs[source.legs.length - 1];
      return {
        from: firstLeg.origin.trim().toUpperCase(),
        to: lastLeg.destination.trim().toUpperCase(),
        departureDate: firstLeg.departureDate,
        tripType: 'multi_city',
        legs: source.legs.map((l) => ({
          origin: l.origin.trim().toUpperCase(),
          destination: l.destination.trim().toUpperCase(),
          departureDate: l.departureDate,
        })),
        cabinClass: source.cabinClass as FlightSearchInput['cabinClass'],
        adults: source.adults || 1,
        currency: selectedCurrency.code,
        page: 1,
        pageSize: 100,
      };
    }
    return {
      from: source.originSuggestion?.code ?? source.origin.trim().toUpperCase(),
      to: source.destinationSuggestion?.code ?? source.destination.trim().toUpperCase(),
      departureDate: source.departureDate,
      tripType: source.tripType as 'one_way' | 'round_trip',
      returnDate: source.tripType === 'round_trip' ? source.returnDate : undefined,
      cabinClass: source.cabinClass as FlightSearchInput['cabinClass'],
      adults: source.adults || 1,
      currency: selectedCurrency.code,
      page: 1,
      pageSize: 100,
    };
  }

  // ── Local filtering with debouncing ──
  const debouncedFilters = useDebouncedValue(flightFilters, 150);
  
  const filteredOffers = useMemo(() => {
    if (allOffers.length === 0) {
      return { items: [] as FlightOfferView[], total: 0 };
    }

    const filtered = applyFlightFilters(allOffers, debouncedFilters, priceSpace);

    // WS6: freeze ordering while streaming; sort once on completion or on an
    // explicit user sort.
    const sorted = isStreaming && !sortTouched
      ? filtered
      : sortOnce(
          filtered,
          currentSort === 'name' ? 'name' : currentSort,
          (o) => {
            const m = getOfferDisplayMoney(o);
            return priceSpace.toSelected(m.amount, m.currency) || Infinity;
          },
          () => 0,
          () => '',
        );

    return { items: sorted, total: filtered.length };
  }, [allOffers, debouncedFilters, isStreaming, sortTouched, currentSort, priceSpace]);

  // ── Load More pagination ──
  // Capped low: each card mounts motion + SSE enrichment listeners, so 200
  // initial cards froze low-end devices (Bug-009 class). content-visibility
  // handles the rest; button appears while anything remains.
  const { displayedItems, hasMore, remainingCount, showLoadMore, loadMore } = useLoadMore(
    filteredOffers.items,
    50, // initial count — first viewport + buffer
    50, // increment — one screen per tap
    1, // show button while anything remains
  );

  const hasItems = hasMore || displayedItems.length > 0;

  function handleHotelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    storeSearchBridge('hotels', {
      selectedDestination: hotelForm.selectedDestination,
      selectedHotel: hotelForm.selectedHotel,
    });
    const params = new URLSearchParams();
    params.set('destinationName', hotelForm.destinationName);
    params.set('selectedDestinationCode', hotelForm.selectedDestinationCode);
    params.set('hotelName', hotelForm.hotelName);
    params.set('checkIn', hotelForm.checkIn);
    params.set('checkOut', hotelForm.checkOut);
    params.set('nationality', hotelForm.nationality);
    params.set('rooms', JSON.stringify(hotelForm.roomsList));
    router.push(`/hotels/search?${params.toString()}`);
  }

  async function performSearch() {
    const searchForm = formRef.current;
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setAllOffers([]);
    setProgressiveCount(0);
    setIsProgressive(false);
    setPartialResults(false);
    setActiveSearchId(null);
    // WS6: a new search returns to arrival-order streaming.
    setSortTouched(false);
    dispatch({ type: 'RESET' });
    // Set the trip-type label immediately, before any results stream in.
    // Previously this only updated when the SSE "result" (final reconciliation)
    // event fired — but progressive cards render, and are selectable, well
    // before that. Switching tabs (e.g. round-trip -> one-way) and searching
    // again left `searchedTripType` at its stale previous value for the
    // whole progressive-streaming window, so an offer selected from an early
    // card got the WRONG trip type baked into its snapshot (mislabeled
    // "Round Trip" in the UI, and sent as the wrong tripType at checkout).
    const originCode = (searchForm.originSuggestion?.code ?? searchForm.origin).trim().toUpperCase();
    const destCode = (searchForm.destinationSuggestion?.code ?? searchForm.destination).trim().toUpperCase();

    const validationError = searchForm.tripType !== 'multi_city'
      ? validateSearchInput({
          from: originCode,
          to: destCode,
          departureDate: searchForm.departureDate,
        })
      : null;
    if (validationError) {
      setError(validationError);
      setLoading(false);
      return;
    }
    if (searchForm.tripType === 'round_trip' && !searchForm.returnDate) {
      setError('Return date is required for round-trip searches.');
      setLoading(false);
      return;
    }
    if (searchForm.tripType === 'multi_city') {
      if (!searchForm.legs || searchForm.legs.length < 2) {
        setError('Multi-city search requires at least 2 legs.');
        setLoading(false);
        return;
      }
      for (let i = 0; i < searchForm.legs.length; i++) {
        const leg = searchForm.legs[i];
        const lFrom = ((searchForm.legSuggestions?.[i] as any)?.code ?? leg.origin).trim().toUpperCase();
        const lTo = leg.destination.trim().toUpperCase();
        if (lFrom && lTo && lFrom === lTo) {
          setError(`Flight ${i + 1}: Origin and destination cannot be the same.`);
          setLoading(false);
          return;
        }
      }
    }

    storeSearchBridge('flights', {
      originSuggestion: searchForm.originSuggestion,
      destinationSuggestion: searchForm.destinationSuggestion,
    });

    const requestPayload = buildBasePayload(searchForm);
    requestPayload.tripType = searchForm.tripType as 'one_way' | 'round_trip';

    // Deep-link support: with no autocomplete bridge (shared URL / bookmark),
    // URL params may be raw city names (e.g. origin=Dubai) — the backend
    // rejects anything that is not a 3-letter IATA code (400 → "Search
    // failed"). Resolve unknown non-IATA locations via the travel
    // autocomplete API before starting the job.
    const isIata = (v?: string) => /^[A-Z]{3}$/.test((v ?? '').trim().toUpperCase());
    // The autocomplete backend 400s on all-caps queries (e.g. "DUBAI"), so try
    // the value as-is first, then retry title-cased before giving up.
    const titleCase = (v: string) =>
      v
        .toLowerCase()
        .split(/\s+/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
    const iataCache = (() => {
      try {
        return new Map<string, string>(JSON.parse(sessionStorage.getItem('iata-resolve-cache') ?? '[]'));
      } catch {
        return new Map<string, string>();
      }
    })();
    const cacheIata = (q: string, code: string) => {
      iataCache.set(q.trim().toUpperCase(), code);
      try {
        sessionStorage.setItem('iata-resolve-cache', JSON.stringify([...iataCache.entries()].slice(-40)));
      } catch { /* storage unavailable */ }
    };
    const resolveIata = async (value: string, slot: 'origin' | 'destination') => {
      if (!value || isIata(value)) return value;
      const cacheKey = value.trim().toUpperCase();
      const cachedHit = iataCache.get(cacheKey);
      if (cachedHit) return cachedHit;
      const candidates = value !== titleCase(value) ? [value, titleCase(value)] : [value];
      // Race candidates in parallel (as-is + Title Case) — sequential attempts
      // doubled deep-link latency when the first candidate 400'd.
      const settled = await Promise.allSettled(
        candidates.map((q) =>
          searchTravelLocations({ q, module: 'flights', limit: 5 }),
        ),
      );
      for (const outcome of settled) {
        if (outcome.status !== 'fulfilled') continue;
        const hit = outcome.value.find((s) => s.code && s.type !== 'HOTEL');
        if (hit?.code) {
          cacheIata(value, hit.code);
          const suggestion: TravelSuggestion = {
            ...hit,
            module: 'flights',
          };
          setForm((f) => ({
            ...f,
            ...(slot === 'origin'
              ? { originSuggestion: suggestion }
              : { destinationSuggestion: suggestion }),
          }));
          return hit.code;
        }
      }
      return value;
    };
    if (!isIata(requestPayload.from) || !isIata(requestPayload.to)) {
      const [resolvedFrom, resolvedTo] = await Promise.all([
        resolveIata(requestPayload.from, 'origin'),
        resolveIata(requestPayload.to, 'destination'),
      ]);
      requestPayload.from = resolvedFrom;
      requestPayload.to = resolvedTo;
    }

    // Multi-city: the safety net above only fixes the top-level from/to
    // (first leg's origin, last leg's destination — used just for the job's
    // identity). The `legs[]` array is what the backend actually validates
    // per-slice, and buildBasePayload() only .toUpperCase()s whatever text
    // sits in each leg field — it never confirmed that text is an IATA code.
    // A leg left as typed city text (e.g. "Dubai" instead of "DXB", easy to
    // hit since nothing forces picking a dropdown suggestion) previously sailed
    // through untouched and 400'd at the backend ("Each slice origin must be
    // a 3-letter IATA code"), surfaced to the user as an opaque "Search
    // failed" / "Failed to fetch" with no indication of which field or why.
    if (searchForm.tripType === 'multi_city' && Array.isArray(requestPayload.legs)) {
      const legs = requestPayload.legs as { origin: string; destination: string; departureDate: string }[];
      const needsResolve = legs.some((l) => !isIata(l.origin) || !isIata(l.destination));
      if (needsResolve) {
        const resolvedLegs = await Promise.all(
          legs.map(async (l) => ({
            ...l,
            origin: await resolveIata(l.origin, 'origin'),
            destination: await resolveIata(l.destination, 'destination'),
          })),
        );
        requestPayload.legs = resolvedLegs;
        requestPayload.from = resolvedLegs[0]?.origin ?? requestPayload.from;
        requestPayload.to = resolvedLegs[resolvedLegs.length - 1]?.destination ?? requestPayload.to;
        const stillInvalid = resolvedLegs.find((l) => !isIata(l.origin) || !isIata(l.destination));
        if (stillInvalid) {
          const badField = !isIata(stillInvalid.origin) ? stillInvalid.origin : stillInvalid.destination;
          setError(`"${badField}" isn't a recognized airport — please pick one from the dropdown suggestions for each flight.`);
          setLoading(false);
          return;
        }
      }
    }

    // Unified pipeline Phase 7: agents ride the same progressive search-jobs
    // pipeline as everyone else — the backend prices agent cards server-side.
    requestPayload.returnDate = searchForm.tripType === 'round_trip' ? searchForm.returnDate : undefined;

    // Abort previous in-flight requests and close SSE connection
    searchAbortControllerRef.current?.abort();
    searchAbortControllerRef.current = new AbortController();
    sseRef.current?.close();
    sseRef.current = null;

    // Generate a unique ID for this search invocation to prevent stale results
    const jobId = `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeJobIdRef.current = jobId;

    try {
      // Progress bar appears INSTANTLY: claim the progress context with a
      // local pending id BEFORE the network round-trip (same fix as hotels).
      dispatch({
        type: 'START_JOB',
        searchId: jobId,
        kind: 'flights',
        suppliers: [],
      });

      // Start background search job
      const job = await startSearchJob('flights', requestPayload as unknown as Record<string, unknown>);

      // If another search started while we were waiting for the job, bail out
      if (activeJobIdRef.current !== jobId) return;

      setSearchKey(undefined);
      setActiveSearchId(job.searchId);

      // Re-bind the same run to the real server-side searchId without
      // resetting run state (keeps the bar moving smoothly).
      dispatch({ type: 'BIND_JOB', searchId: job.searchId });

      // Subscribe to SSE events for real-time progress
      let completed = false;
      const seenOfferKeys = new Set<string>();
      const { close } = subscribeToSearchJobEvents(
        job.searchId,
        job.eventsUrl,
        (event: SearchProgressEvent) => {
          if (activeJobIdRef.current !== jobId) {
            return;
          }
          dispatch({ type: 'EVENT', event });

          // Progressive: consume enriched display-ready chunks (fast first paint)
          if (event.type === 'supplier_results_ready' && !completed) {
            const readyOffers = (event.results ?? []) as FlightOfferView[];
            if (readyOffers.length > 0) {
              if (event.searchKey && !searchKey) {
                setSearchKey(event.searchKey);
              }
              setIsProgressive(true);
              const newOffers: FlightOfferView[] = [];
              for (const offer of readyOffers) {
                const key = `${offer.provider ?? ''}:${offer.offerId}:${offer.productId}`;
                if (!seenOfferKeys.has(key)) {
                  seenOfferKeys.add(key);
                  newOffers.push(offer);
                }
              }
              if (newOffers.length > 0) {
                setAllOffers((prev) => {
                  const next = [...prev, ...newOffers];
                  setProgressiveCount(next.length);
                  dispatch({ type: 'UPDATE_PROGRESSIVE_COUNT', count: next.length });
                  return next;
                });
              }
            }
          }

          // Enrichment patch: WS6 — price-locked fill (content only, first-
          // painted price never moves) merged in place at the existing index.
          if (event.type === 'supplier_results_enriched' && !completed) {
            const enrichedOffers = (event.results ?? []) as FlightOfferView[];
            if (enrichedOffers.length > 0) {
              setAllOffers((prev) =>
                upsertMergeLocked(
                  prev,
                  enrichedOffers,
                  (o) => flightOfferKey(`${o.provider ?? ''}:${o.offerId}`, o.productId),
                  ['provider', 'offerId', 'productId'],
                ),
              );
            }
          }

          if (event.type === 'search_completed' && !completed) {
            completed = true;
            if (watchdogRef.current) {
              clearTimeout(watchdogRef.current);
              watchdogRef.current = null;
            }
            sseRef.current?.close();
            sseRef.current = null;
            setActiveSearchId(null);
            setIsProgressive(false);

            fetchSearchJobResult<FlightSearchView>(job.resultUrl)
              .then((result) => {
                if (activeJobIdRef.current !== jobId) {
                  return;
                }
                const responseOffers = Array.isArray(result.offers) ? result.offers : [];

                // WS6: /result is reconciliation-only — price-locked merge
                // (fills content; never repaints prices) inside a
                // startTransition so the final reconciliation doesn't freeze
                // the streaming UI.
                startTransition(() => {
                  setSearchKey(result.searchKey);
                  for (const offer of responseOffers) {
                    seenOfferKeys.add(`${offer.provider ?? ''}:${offer.offerId}:${offer.productId}`);
                  }
                  setAllOffers((prev) =>
                    upsertMergeLocked(
                      prev,
                      responseOffers,
                      (o) => flightOfferKey(`${o.provider ?? ''}:${o.offerId}`, o.productId),
                      ['provider', 'offerId', 'productId'],
                    ),
                  );
                  const merged = upsertMergeLocked(
                    allOffersRef.current,
                    responseOffers,
                    (o) => flightOfferKey(`${o.provider ?? ''}:${o.offerId}`, o.productId),
                    ['provider', 'offerId', 'productId'],
                  );
                  // Cache final results for instant back-navigation restore
                  saveSearchCache<FlightCachePayload>('flights', canonicalSearchKey(searchParams), {
                    offers: merged,
                    searchKey: result.searchKey,
                  });
                  setSearchedTripType(searchForm.tripType as 'one_way' | 'round_trip' | 'multi_city');

                  if (typeof (result as unknown as Record<string, unknown>).originalTotal === 'number') {
                    setOriginalTotal((result as unknown as Record<string, unknown>).originalTotal as number);
                  }

                  pendingUrlUpdate.current = true;
                });
              })
              .catch((err) => {
                if (activeJobIdRef.current !== jobId) return;
                if (err instanceof Error && (err.name === 'AbortError' || err.message === 'Failed to fetch')) {
                  return;
                }
                const msg = err instanceof Error ? err.message : 'Failed to fetch results.';
                setError(msg);
                setAllOffers([]);
                toast.error('Flight search failed', msg);
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
            setIsProgressive(false);
            // User cancelled by clicking an offer — keep current UI state silently
            if (event.code === 'CANCELLED') {
              setLoading(false);
              return;
            }
            // Keep progressive results if some providers already delivered —
            // wiping them for a supplier-level failure loses good data.
            if (allOffersRef.current.length > 0) {
              setPartialResults(true);
              setLoading(false);
              return;
            }
            // Show specific error based on failure code
            let msg = 'All providers failed. Please try again.';
            if (event.code === 'ALL_SUPPLIERS_FAILED') {
              msg = 'No flight providers could be reached. Please try again later.';
            } else if (event.code === 'TIMEOUT') {
              msg = 'Search timed out. Some providers may be experiencing delays.';
            }
            setError(msg);
            setAllOffers([]);
            toast.error('Flight search failed', msg);
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
            fallbackSearch(requestPayload, jobId);
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
          if (allOffersRef.current.length > 0) {
            setPartialResults(true);
          } else {
            const msg = 'Search timed out. Please try again.';
            setError(msg);
            toast.error('Flight search timed out', msg);
          }
        }
      }, 90_000);
    } catch {
      // Job creation failed — fall back to synchronous search
      setActiveSearchId(null);
      if (activeJobIdRef.current === jobId) {
        fallbackSearch(requestPayload, jobId);
      }
    }
  }

  async function fallbackSearch(requestPayload: FlightSearchInput, forJobId?: string) {
    if (forJobId && activeJobIdRef.current !== forJobId) return;
    try {
      const response = await searchFlights(requestPayload);
      if (forJobId && activeJobIdRef.current !== forJobId) return;

      const responseOffers = Array.isArray(response.offers) ? response.offers : [];

      setSearchKey(response.searchKey);
      setAllOffers(responseOffers);
      setSearchedTripType(requestPayload.tripType ?? 'one_way');

      const r = response as unknown as Record<string, unknown>;
      if (typeof r.originalTotal === 'number') setOriginalTotal(r.originalTotal);

      pendingUrlUpdate.current = true;
    } catch (err) {
      if (forJobId && activeJobIdRef.current !== forJobId) return;
      if (err instanceof Error && (err.name === 'AbortError' || err.message === 'Failed to fetch')) {
        return;
      }
      dispatch({ type: 'RESET' }); // job never started — no phantom searching bar
      const msg = err instanceof Error ? err.message : 'Search failed.';
      setError(msg);
      setAllOffers([]);
      toast.error('Flight search failed', msg);
    } finally {
      if (!forJobId || activeJobIdRef.current === forJobId) {
        setLoading(false);
      }
    }
  }

  const lastSearchTimeRef = useRef<number>(0);
  const handleSearch = useCallback(() => {
    const now = Date.now();
    if (now - lastSearchTimeRef.current < 500) return;
    lastSearchTimeRef.current = now;
    performSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const displayOffers = filteredOffers.items;
  const filteredHasItems = displayOffers.length > 0;

  // Build filter groups from computed data
  const flightFilterGroups = useMemo(() => {
    if (allOffers.length === 0) return undefined;
    const options = computeFlightFilterOptions(allOffers, priceSpace);
    const groups: import('@/lib/filters/types').FilterGroup[] = [];

    const realMaxPrice = Math.max(
      2000,
      ...allOffers.map((o) => {
        const m = getOfferDisplayMoney(o);
        return priceSpace.toSelected(m.amount, m.currency);
      }),
    );
    const sliderMax = Math.ceil(realMaxPrice / 100) * 100;
    if (sliderMax > 0) {
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
        resultCount: allOffers.length,
        pricePresets: [
          preset(0, 200),
          preset(200, 500),
          preset(500, 1000),
          preset(1000, 2000),
          preset(2000, null),
        ],
      });
    }

    if (options.airlines.length > 0) {
      groups.push({
        id: 'airlines', title: 'Airlines',
        icon: 'M21 16.23c0 .696-.56 1.262-1.25 1.262H4.25C3.56 17.492 3 16.926 3 16.23V7.77c0-.696.56-1.262 1.25-1.262h15.5c.69 0 1.25.566 1.25 1.262v8.46zM3 10.5h18',
        type: 'checkbox',
        options: options.airlines,
      });
    }

    if (options.stops.length > 0) {
      groups.push({
        id: 'stops', title: 'Stops',
        icon: 'M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5',
        type: 'radio',
        options: options.stops.map((s) => ({
          label: s.key === '0' ? 'Nonstop' : s.key === '1' ? '1 stop' : `${s.key} stops`,
          count: s.count,
        })),
      });
    }

    if (options.cabinClasses.length > 1) {
      groups.push({
        id: 'cabinClasses', title: 'Cabin class',
        icon: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
        type: 'checkbox',
        options: options.cabinClasses,
      });
    }

    if (options.departureTimes.length > 1) {
      const labelMap: Record<string, string> = {
        early_morning: 'Early morning (00:00\u201306:00)',
        morning: 'Morning (06:00\u201312:00)',
        afternoon: 'Afternoon (12:00\u201318:00)',
        evening: 'Evening (18:00\u201300:00)',
      };
      groups.push({
        id: 'departureTimes', title: 'Departure time',
        icon: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
        type: 'checkbox',
        options: options.departureTimes.map((t) => ({
          label: labelMap[t.key ?? ''] ?? t.label,
          count: t.count,
          key: t.key,
        })),
      });
    }

    // Free cancellation — only show when at least one offer qualifies
    const freeCancellationCount = allOffers.filter(
      (o) =>
        o.capabilities?.freeCancellation === true ||
        o.display?.refundPolicy?.free === true ||
        (o.display?.refundPolicy?.allowed === true &&
          Number(o.display?.refundPolicy?.penaltyAmount) === 0),
    ).length;
    if (freeCancellationCount > 0) {
      groups.push({
        id: 'free_cancellation',
        title: 'Fare options',
        icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        type: 'checkbox',
        options: [{ key: 'free_cancellation', label: 'Free cancellation', count: freeCancellationCount }],
      });
    }

    // Supplier filter — admin only
    if (isAdmin) {
      const supplierMap = new Map<string, number>();
      for (const offer of allOffers) {
        const provider = offer.provider ?? 'unknown';
        supplierMap.set(provider, (supplierMap.get(provider) ?? 0) + 1);
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

    return groups.length > 0 ? groups : undefined;
  }, [allOffers, isAdmin, priceSpace]);

  const routeDisplay = `${form.origin} → ${form.destination}`;

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
              flightForm={form}
              onFlightFormChange={handleStateChange}
              onFlightSearch={handleSearch}
              flightPending={loading}
              flightError={error}
              hotelForm={hotelForm}
              onHotelFieldChange={updateHotelField}
              onHotelRoomChange={updateHotelRoom}
              onHotelSubmit={handleHotelSubmit}
              onHotelFormSet={setHotelForm}
              hotelMinDate={getDate(1)}
              hotelPending={false}
              showInternalSwitcher={false}
            />
          </motion.div>
        </div>
      </div>

      <SearchProgressHeader onDismiss={() => dispatch({ type: 'DISMISS' })} />

      {/* Main Content */}
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
          {/* Mobile filter toggle - only show after search */}
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
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal/10 text-[10px] font-bold text-brand-teal">
                {filteredOffers.total}
              </span>
            </button>

            {hasItems && (
              <p className="text-sm text-[#7d7d7d]">
                <span className="font-semibold text-charcoal">{filteredOffers.total}</span> results
              </p>
            )}
          </div>
          )}

          {/* Filter sidebar */}
          {/* Filter sidebar */}
          <AnimatePresence initial={false}>
            {(mobileFilterOpen || false) && (
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
                    mode="flights"
                    flightFilters={flightFilters}
                    onFlightFilterChange={setFlightFilters}
                    dynamicGroups={flightFilterGroups}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Desktop sidebar - only show after search with real data */}
          {hasSearched && (
            <div className="hidden w-60 shrink-0 lg:block">
              <div className="lg:sticky lg:top-[88px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1 custom-scrollbar">
                <FilterSidebar
                  mode="flights"
                  flightFilters={flightFilters}
                  onFlightFilterChange={setFlightFilters}
                  dynamicGroups={flightFilterGroups}
                />
              </div>
            </div>
          )}

          {/* Results */}
          <main className="min-w-0 flex-1 overflow-hidden">

            {/* Loading skeleton — only show when no progressive results yet */}
            {loading && !hasItems && !error && progressiveCount === 0 && (
              <FlightSearchSkeleton count={SKELETON_COUNT} />
            )}

            {/* Progressive loading indicator — show when results are arriving */}
            {loading && isProgressive && progressiveCount > 0 && allOffers.length === 0 && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3">
                <div className="relative h-5 w-5">
                  <div className="absolute inset-0 rounded-full border-2 border-sky-200" />
                  <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sky-500" />
                </div>
                <span className="text-sm font-medium text-sky-900">
                  Loading more flights from other suppliers…
                </span>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="mb-6">
                <PremiumError message={error} onRetry={() => { setError(null); performSearch(); }} />
              </div>
            )}

            {/* Partial results banner — some suppliers failed but we have results */}
            {!loading && partialResults && hasSearched && allOffers.length > 0 && hasItems && (
              <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-900">
                    Some suppliers were unavailable
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Showing {allOffers.length} flight{allOffers.length !== 1 ? 's' : ''} from available suppliers. Results may be incomplete.
                  </p>
                </div>
              </div>
            )}

            {/* Empty - no results from API */}
            {!loading && !error && hasSearched && !allOffers.length && !isProgressive && (
              <PremiumEmpty
                title="No flights found"
                message="Try adjusting your dates, route, or cabin class."
                icon="plane"
              />
            )}

            {/* Empty - all results filtered out */}
            {!loading && !error && hasSearched && allOffers.length > 0 && !hasItems && (
              <div className="mb-6">
                <PremiumEmpty
                  title="No results match your filters"
                  message="Try adjusting or clearing your filters to see more results."
                  icon="plane"
                />
              </div>
            )}

            {/* Active filter chips + SortBar */}
            {(hasItems || (isProgressive && allOffers.length > 0)) && filteredHasItems && (
              <ActiveFilterChips
                filters={flightFilters}
                onReset={() => { setFlightFilters(defaultFlightFilters()); }}
                resultCount={filteredOffers.total}
                totalCount={originalTotal || filteredOffers.total}
              />
            )}

            {/* Results header with SortBar */}
            {(hasItems || (isProgressive && allOffers.length > 0)) && filteredHasItems && (
              <SortBar
                total={filteredOffers.total}
                destination={routeDisplay}
                currentSort={currentSort}
                onSortChange={(sort) => { setSortTouched(true); setCurrentSort(sort); }}
              />
            )}

            {/* Results list — plain divs: per-card motion stagger over 50+
                cards cost frames on every filter keystroke. */}
            {hasItems && (
              <div className="space-y-4 mt-4 overflow-hidden">
                <div className="grid gap-4 min-w-0 overflow-hidden">
                  {displayedItems.map((offer) => (
                    <div
                      key={`${offer.provider ?? ''}:${offer.offerId}:${offer.productId}`}
                      className="search-result-card min-w-0"
                      data-offer-id={offer.offerId}
                    >
                      <FlightResultCard
                        offer={offer}
                        searchKey={searchKey}
                        searchId={activeSearchId ?? undefined}
                        adults={Number(form.adults) || 1}
                        tripType={searchedTripType}
                        returnDate={searchedTripType === 'round_trip' ? form.returnDate : undefined}
                        from={form.originSuggestion?.code ?? form.origin.trim().toUpperCase()}
                        to={form.destinationSuggestion?.code ?? form.destination.trim().toUpperCase()}
                        mode={isAgent ? 'agent' : 'customer'}
                        markups={agentMarkups.get(offer.offerId)}
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
              <FlightSearchEmptyState onSearch={searchFromEmptyState} />
            )}

          </main>
        </div>
      </div>

    </div>
  );
}

export default function FlightSearchResultsPage() {
  const t = useTranslations('Flights');
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
        <FlightSearchResultsInner />
      </SearchProgressProvider>
    </Suspense>
  );
}
