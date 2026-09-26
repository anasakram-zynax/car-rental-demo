'use client';

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  SearchKind,
  SearchLifecycle,
  SearchSupplierProgress,
  SearchProgressEvent,
} from '@/features/search-progress/types/search-job';

// ─── State ────────────────────────────────────────────────────────────────────

export interface SearchProgressState {
  searchId: string | null;
  kind: SearchKind | null;
  lifecycle: SearchLifecycle;
  suppliers: SearchSupplierProgress[];
  totalResults: number | null;
  progressiveResultCount: number;
  startedAt: number | null;
  /** Per-supplier partial results as they arrive (for progressive listing) */
  partialResults: Record<string, unknown[]>;
}

export interface SearchProgressPresentation {
  visible: boolean;
  totalSuppliers: number;
  settledSuppliers: number;
  remainingSuppliers: number;
  successfulSuppliers: number;
  displayProgress: number;
  /** Public-safe copy — shown to everyone. Never reveals supplier counts,
   *  names, or availability. */
  headline: string;
  detail: string;
  /** Operational copy for staff/admin users only (gated via
   *  useSupplierAccess().canViewSupplier in the UI). May reference supplier
   *  counts and availability. */
  staffHeadline: string;
  staffDetail: string;
  kindLabel: string;
}

const INITIAL_STATE: SearchProgressState = {
  searchId: null,
  kind: null,
  lifecycle: 'idle',
  suppliers: [],
  totalResults: null,
  progressiveResultCount: 0,
  startedAt: null,
  partialResults: {},
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'START_JOB'; searchId: string; kind: SearchKind; suppliers: Array<{ key: string; label: string }> }
  | { type: 'BIND_JOB'; searchId: string }
  | { type: 'EVENT'; event: SearchProgressEvent }
  | { type: 'UPDATE_PROGRESSIVE_COUNT'; count: number }
  | { type: 'DISMISS' }
  | { type: 'RESET' };

function reducer(state: SearchProgressState, action: Action): SearchProgressState {
  switch (action.type) {
    case 'START_JOB':
      return {
        searchId: action.searchId,
        kind: action.kind,
        lifecycle: 'searching',
        suppliers: action.suppliers.map((s) => ({
          key: s.key,
          label: s.label,
          phase: 'queued' as const,
          resultCount: null,
        })),
        totalResults: null,
        progressiveResultCount: 0,
        startedAt: Date.now(),
        partialResults: {},
      };

    case 'BIND_JOB':
      // Re-bind an optimistically-claimed run to the real server-side
      // searchId. Keeps lifecycle, suppliers and progress untouched so the
      // bar never resets mid-search.
      return { ...state, searchId: action.searchId };

    case 'UPDATE_PROGRESSIVE_COUNT':
      return {
        ...state,
        progressiveResultCount: action.count,
      };

    case 'EVENT': {
      const { event } = action;
      // Reject stale events
      if (state.searchId && 'searchId' in event && event.searchId !== state.searchId) return state;
      if (state.lifecycle !== 'searching' && state.lifecycle !== 'idle') return state;

      switch (event.type) {
        case 'search_started':
          return {
            ...state,
            searchId: event.searchId,
            kind: event.kind,
            lifecycle: 'searching',
            suppliers: event.suppliers.map((s) => ({
              key: s.key,
              label: s.label,
              phase: 'queued' as const,
              resultCount: null,
            })),
          };

        case 'supplier_started':
          return {
            ...state,
            suppliers: state.suppliers.map((s) =>
              s.key === event.supplierKey ? { ...s, phase: event.phase } : s,
            ),
          };

        case 'supplier_completed':
          return {
            ...state,
            suppliers: state.suppliers.map((s) =>
              s.key === event.supplierKey
                ? { ...s, phase: 'completed', resultCount: event.resultCount, elapsedMs: event.elapsedMs }
                : s,
            ),
          };

        case 'supplier_failed':
          return {
            ...state,
            suppliers: state.suppliers.map((s) =>
              s.key === event.supplierKey
                ? {
                    ...s,
                    phase: event.code === 'TIMEOUT' ? 'timed_out' : 'failed',
                    errorCode: event.code,
                    elapsedMs: event.elapsedMs,
                  }
                : s,
            ),
          };

        case 'supplier_results':
          return {
            ...state,
            partialResults: {
              ...state.partialResults,
              [event.supplierKey]: event.results,
            },
          };

        case 'search_completed':
          return {
            ...state,
            lifecycle: event.partial ? 'partial' : 'succeeded',
            totalResults: event.totalResults,
          };

        case 'search_failed':
          return {
            ...state,
            lifecycle: 'failed',
          };

        default:
          return state;
      }
    }

    case 'DISMISS':
      if (state.lifecycle === 'succeeded' || state.lifecycle === 'partial' || state.lifecycle === 'failed') {
        return { ...INITIAL_STATE };
      }
      return state;

    case 'RESET':
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─── Derived selectors ────────────────────────────────────────────────────────

const SUPPLIER_KIND_LABELS: Record<SearchKind, string> = {
  flights: 'flight',
  hotels: 'hotel',
};

export function derivePresentation(state: SearchProgressState): SearchProgressPresentation {
  if (state.lifecycle === 'idle') {
    return {
      visible: false,
      totalSuppliers: 0,
      settledSuppliers: 0,
      remainingSuppliers: 0,
      successfulSuppliers: 0,
      displayProgress: 0,
      headline: '',
      detail: '',
      staffHeadline: '',
      staffDetail: '',
      kindLabel: '',
    };
  }

  const total = state.suppliers.length;
  const settled = state.suppliers.filter((s) =>
    s.phase === 'completed' || s.phase === 'failed' || s.phase === 'timed_out',
  ).length;
  const remaining = total - settled;
  const successful = state.suppliers.filter((s) => s.phase === 'completed').length;
  const inFlight = total - settled;
  
  // Smoother progress calculation with result-based interpolation
  // Start near zero (small head-start so the puck clears the rounded cap)
  // and fill gradually as suppliers connect and results arrive.
  const baseProgress = 4;
  const remainingProgress = 91; // 4% to 95% during search
  const perSupplierShare = total > 0 ? remainingProgress / total : 0;
  
  // Base progress from supplier status
  const inFlightContribution = inFlight * perSupplierShare * 0.15; // 15% of share while connecting
  const settledContribution = settled * perSupplierShare; // Full share when settled
  
  // Additional progress from results arriving (up to 10% extra)
  const progressiveCount = state.progressiveResultCount;
  const expectedResults = state.suppliers.reduce((sum, s) => sum + (s.resultCount ?? 0), 0);
  const resultProgress = expectedResults > 0 
    ? Math.min((progressiveCount / expectedResults) * 10, 10) 
    : 0;
  
  const rawProgress = baseProgress + inFlightContribution + settledContribution + resultProgress;
  const displayProgress = state.lifecycle === 'searching' ? Math.min(rawProgress, 95) : 100;

  const kindLabel = state.kind ? SUPPLIER_KIND_LABELS[state.kind] : '';
  const kindPlural = state.kind === 'flights' ? 'flights' : 'hotels';
  const supplierWord = remaining === 1 ? 'supplier' : 'suppliers';

  let headline = '';
  let detail = '';

  switch (state.lifecycle) {
    case 'searching': {
      const progressiveCount = state.progressiveResultCount;
      if (total === 0) {
        // Optimistic start: the supplier list populates with the first SSE
        // event, so the brief claim window gets its own honest copy instead
        // of "Searching 0 sources".
        headline = `Connecting to travel providers…`;
        detail = `Starting your search…`;
      } else if (remaining === total) {
        headline = `Searching ${total} ${kindLabel} source${total !== 1 ? 's' : ''}`;
        detail = `Querying all available providers…`;
      } else if (remaining > 0) {
        headline = `Searching ${remaining} remaining ${kindLabel} ${supplierWord}`;
        if (progressiveCount > 0) {
          detail = `${progressiveCount} ${kindPlural} found so far`;
        } else {
          const done = state.suppliers.filter((s) => s.phase === 'completed' && s.resultCount !== null);
          if (done.length > 0) {
            const d = done[0];
            detail = `Found ${d.resultCount} result${d.resultCount !== 1 ? 's' : ''}`;
          } else {
            detail = `${successful} source${successful !== 1 ? 's' : ''} completed`;
          }
        }
      } else {
        headline = `Gathering results…`;
        detail = `${successful} of ${total} providers responded`;
      }
      break;
    }

    case 'succeeded':
      headline = `${state.totalResults ?? 0} ${kindPlural} found`;
      detail = `${total} supplier${total !== 1 ? 's' : ''} searched`;
      break;

    case 'partial': {
      const failedCount = total - successful;
      headline = `${state.totalResults ?? 0} ${kindPlural} found`;
      detail = `${failedCount} of ${total} supplier${total !== 1 ? 's' : ''} was unavailable`;
      break;
    }

    case 'failed':
      headline = `We couldn't reach ${kindLabel} suppliers`;
      detail = 'Try your search again';
      break;

    default:
      break;
  }

  // Public-safe default copy (RBAC): the copy above is operational and can
  // reveal how many suppliers we use and which ones are up/down. Everyone
  // sees the neutral copy below; staff see the operational one via
  // staffHeadline/staffDetail (role-gated in SearchProgressHeader).
  let publicHeadline = headline;
  let publicDetail = detail;
  switch (state.lifecycle) {
    case 'searching': {
      if (total === 0) break; // optimistic claim window — copy is already neutral
      publicHeadline = `Searching for the best ${kindPlural}…`;
      publicDetail =
        state.progressiveResultCount > 0
          ? `${state.progressiveResultCount} ${kindPlural} found so far`
          : 'Checking live availability…';
      break;
    }
    case 'succeeded':
      publicDetail = 'Search complete';
      break;
    case 'partial':
      publicDetail = 'Some options couldn\'t be checked — showing everything we found';
      break;
    case 'failed':
      publicHeadline = `We couldn\'t complete your search`;
      publicDetail = 'Please try again';
      break;
    default:
      break;
  }

  return {
    visible: true,
    totalSuppliers: total,
    settledSuppliers: settled,
    remainingSuppliers: remaining,
    successfulSuppliers: successful,
    displayProgress,
    headline: publicHeadline,
    detail: publicDetail,
    staffHeadline: headline,
    staffDetail: detail,
    kindLabel,
  };
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface SearchProgressContextValue {
  state: SearchProgressState;
  presentation: SearchProgressPresentation;
  dispatch: (action: Action) => void;
}

const SearchProgressContext = createContext<SearchProgressContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SearchProgressProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presentation = derivePresentation(state);

  // Auto-dismiss on terminal states
  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }

    if (state.lifecycle === 'succeeded') {
      dismissTimer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), 2500);
    } else if (state.lifecycle === 'partial') {
      dismissTimer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), 3500);
    } else if (state.lifecycle === 'failed') {
      dismissTimer.current = setTimeout(() => dispatch({ type: 'DISMISS' }), 4000);
    }

    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [state.lifecycle]);

  const ctx: SearchProgressContextValue = {
    state,
    presentation,
    dispatch,
  };

  return (
    <SearchProgressContext.Provider value={ctx}>
      {children}
    </SearchProgressContext.Provider>
  );
}

export function useSearchProgress() {
  const ctx = useContext(SearchProgressContext);
  if (!ctx) throw new Error('useSearchProgress must be used within SearchProgressProvider');
  return ctx;
}

// ─── Backward-compatible hook (maps old API to new reducer) ───────────────────

export interface LegacySearchProgress {
  state: {
    visible: boolean;
    status: 'idle' | 'searching' | 'completed' | 'failed';
    progress: number;
    message: string;
    searchType: SearchKind | null;
    suppliers: Array<{ key: string; label: string; status: string; resultCount: number }>;
    resultsCount: number;
  };
  startSearch: (type: SearchKind, supplierKeys: string[]) => void;
  updateSupplier: (key: string, status: string, resultCount?: number) => void;
  setProgress: (progress: number, message: string) => void;
  completeSearch: (resultsCount: number) => void;
  failSearch: (message: string) => void;
  reset: () => void;
}

export function useLegacySearchProgress(): LegacySearchProgress {
  const { state, presentation, dispatch } = useSearchProgress();

  const startSearch = useCallback(
    (type: SearchKind, supplierKeys: string[]) => {
      const labels: Record<string, string> = {
        hotelbeds: 'Hotelbeds',
        ratehawk: 'RateHawk',
        travelport: 'Travelport',
        duffel: 'Duffel',
      };
      dispatch({
        type: 'START_JOB',
        searchId: `legacy_${Date.now()}`,
        kind: type,
        suppliers: supplierKeys.map((key) => ({ key, label: labels[key] ?? key })),
      });
    },
    [dispatch],
  );

  return {
    state: {
      visible: presentation.visible,
      status: state.lifecycle === 'succeeded' || state.lifecycle === 'partial' ? 'completed'
        : state.lifecycle === 'failed' ? 'failed'
        : state.lifecycle === 'searching' ? 'searching'
        : 'idle',
      progress: presentation.displayProgress,
      message: presentation.headline || presentation.detail,
      searchType: state.kind,
      suppliers: state.suppliers.map((s) => ({
        key: s.key,
        label: s.label,
        status: s.phase,
        resultCount: s.resultCount ?? 0,
      })),
      resultsCount: state.totalResults ?? 0,
    },
    startSearch,
    updateSupplier: useCallback(() => {}, []),
    setProgress: useCallback(() => {}, []),
    completeSearch: useCallback(() => {}, []),
    failSearch: useCallback(() => {}, []),
    reset: useCallback(() => dispatch({ type: 'RESET' }), [dispatch]),
  };
}
