'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { fetchActiveCurrencies, type PublicCurrencyDto } from '@/lib/api/currencies';
import { getStoredUser } from '@/lib/auth/storage';

export interface CurrencyInfo {
  code: string;
  symbol: string;
  name: string;
  exchangeRate: number;
  decimals: number;
  isDefault?: boolean;
}

// ─── Hardcoded fallbacks (last resort when nothing cached in localStorage) ──────

const FALLBACK_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$',     name: 'US Dollar',       exchangeRate: 1,     decimals: 2 },
  { code: 'EUR', symbol: '€',     name: 'Euro',             exchangeRate: 0.92,  decimals: 2 },
  { code: 'GBP', symbol: '£',     name: 'British Pound',    exchangeRate: 0.79,  decimals: 2 },
  { code: 'KWD', symbol: 'KD',    name: 'Kuwaiti Dinar',    exchangeRate: 0.31,  decimals: 3 },
  { code: 'BHD', symbol: 'BD',    name: 'Bahraini Dinar',   exchangeRate: 0.38,  decimals: 3 },
  { code: 'AED', symbol: 'د.إ',   name: 'UAE Dirham',       exchangeRate: 3.67,  decimals: 2 },
  { code: 'SAR', symbol: '﷼',     name: 'Saudi Riyal',      exchangeRate: 3.75,  decimals: 2 },
  { code: 'JPY', symbol: '¥',     name: 'Japanese Yen',     exchangeRate: 157,   decimals: 0 },
  { code: 'CNY', symbol: '¥',     name: 'Chinese Yuan',     exchangeRate: 7.24,  decimals: 2 },
  { code: 'INR', symbol: '₹',     name: 'Indian Rupee',     exchangeRate: 83.5,  decimals: 2 },
  { code: 'PKR', symbol: '₨',     name: 'Pakistani Rupee',  exchangeRate: 278,   decimals: 2 },
  { code: 'TRY', symbol: '₺',     name: 'Turkish Lira',     exchangeRate: 32.4,  decimals: 2 },
];

const DEFAULT_CODE = 'USD';

const STORAGE_KEY = 'travelsota_currency';
const RATES_STORAGE_KEY = 'travelsota_currency_rates';
const REFETCH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Context shapes ────────────────────────────────────────────────
//
// Split into two contexts so components that only need stable data
// (formatPriceRaw, supportedCurrencies, etc.) skip re-renders when
// the user switches currency.
//

/** Stable values — do NOT change when the user switches currency. */
interface CurrencyDataContextValue {
  supportedCurrencies: CurrencyInfo[];
  ratesMap: Record<string, number>;
  decimalsMap: Record<string, number>;
  isLoading: boolean;
  lastFetchedAt: number;
  setSelectedCurrency: (currency: CurrencyInfo) => void;
  formatPriceRaw: (amount: number, currency: string) => string;
}

/** Volatile values — change every time the user switches currency. */
interface CurrencyDisplayContextValue {
  selectedCurrency: CurrencyInfo;
  convertAmount: (amount: number, fromCurrency: string) => number;
  formatPrice: (amount: number, originalCurrency: string) => string;
}

/** Combined convenience type — matches the old single-context API. */
type CurrencyContextValue = CurrencyDataContextValue & CurrencyDisplayContextValue;

const CurrencyDataContext = createContext<CurrencyDataContextValue | null>(null);
const CurrencyDisplayContext = createContext<CurrencyDisplayContextValue | null>(null);

// ─── Helpers ─────────────────────────────────────────────────────

function buildRatesMap(currencies: CurrencyInfo[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of currencies) map[c.code] = c.exchangeRate;
  return map;
}

function buildDecimalsMap(currencies: CurrencyInfo[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of currencies) map[c.code] = c.decimals;
  return map;
}

function mapApiDto(dto: PublicCurrencyDto): CurrencyInfo {
  return {
    code: dto.code,
    symbol: dto.symbol,
    name: dto.name,
    exchangeRate: Number(dto.exchangeRate),
    decimals: dto.decimals,
    isDefault: dto.isDefault,
  };
}

function loadCachedRates(): CurrencyInfo[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch { /* corrupted — ignore */ }
  return null;
}

function saveCachedRates(currencies: CurrencyInfo[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(currencies));
  } catch { /* quota exceeded — silently skip */ }
}

function resolveInitialCurrencies(): CurrencyInfo[] {
  return loadCachedRates() ?? FALLBACK_CURRENCIES;
}

// ─── Provider ────────────────────────────────────────────────────

interface CurrencyProviderProps {
  children: ReactNode;
  /** Currency code from the visitor's tq_currency cookie, read server-side
   *  in layout.tsx. Takes priority over localStorage/API-default resolution
   *  and — critically — is available during SSR too (unlike localStorage),
   *  so the very first server-rendered HTML already matches what the client
   *  will render, eliminating the hydration-time flash to the hardcoded USD
   *  default for returning visitors. */
  initialCurrencyCode?: string;
}

export function CurrencyProvider({ children, initialCurrencyCode }: CurrencyProviderProps) {
  const initialCurrencies = resolveInitialCurrencies();
  const [currencies, setCurrencies] = useState<CurrencyInfo[]>(initialCurrencies);
  const [ratesMap, setRatesMap] = useState<Record<string, number>>(() => buildRatesMap(initialCurrencies));
  const [decimalsMap, setDecimalsMap] = useState<Record<string, number>>(() => buildDecimalsMap(initialCurrencies));
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState(0);
  const [defaultCode, setDefaultCode] = useState(DEFAULT_CODE);
  const fetchedRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doFetch = useCallback(() => {
    fetchActiveCurrencies()
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          setIsLoading(false);
          return;
        }

        const mapped = data.map(mapApiDto);
        setCurrencies(mapped);
        setRatesMap(buildRatesMap(mapped));
        setDecimalsMap(buildDecimalsMap(mapped));
        setLastFetchedAt(Date.now());

        const defaultFromApi = mapped.find((c) => c.isDefault);
        if (defaultFromApi) setDefaultCode(defaultFromApi.code);

        saveCachedRates(mapped);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  // Initial fetch + periodic refetch
  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      doFetch();
    }

    intervalRef.current = setInterval(() => {
      doFetch();
    }, REFETCH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [doFetch]);

  // Selected currency — pref resolution: user profile > localStorage > SSR cookie > API default > USD
  // The cookie check runs unconditionally (not window-gated) so it applies
  // identically during SSR and client hydration — the actual flash fix.
  const [selectedCurrency, setSelectedCurrencyState] = useState<CurrencyInfo>(() => {
    if (typeof window !== 'undefined') {
      const user = getStoredUser();
      const prefCode = user?.preferredCurrency;
      if (prefCode) {
        const found = initialCurrencies.find((c) => c.code === prefCode);
        if (found) return found;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const found = initialCurrencies.find((c) => c.code === stored);
        if (found) return found;
      }
    }
    if (initialCurrencyCode) {
      const found = initialCurrencies.find((c) => c.code === initialCurrencyCode);
      if (found) return found;
    }
    const fallbackDefault = initialCurrencies.find((c) => c.code === DEFAULT_CODE);
    return fallbackDefault ?? initialCurrencies[0];
  });

  // Once API data arrives, reconcile selected currency
  useEffect(() => {
    if (isLoading || currencies.length === 0) return;
    const id = setTimeout(() => {
      setSelectedCurrencyState((prev) => {
        const stillExists = currencies.find((c) => c.code === prev.code);
        if (stillExists) return stillExists;

        const apiDefault = currencies.find((c) => c.code === defaultCode);
        return apiDefault ?? currencies[0] ?? prev;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [isLoading, currencies, defaultCode]);

  const setSelectedCurrency = useCallback((currency: CurrencyInfo) => {
    setSelectedCurrencyState(currency);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, currency.code);
      // Mirrors tq_branding: lets the SSR layout read this on the next
      // navigation/reload so CurrencyProvider's initial state already
      // matches instead of flashing the hardcoded default first.
      document.cookie = `tq_currency=${currency.code}; path=/; max-age=31536000; samesite=lax`;
    }
  }, []);

  // Persist preference on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, selectedCurrency.code);
    }
  }, [selectedCurrency]);

  // ─── Conversion (volatile — depends on selectedCurrency) ──────

  const convertAmount = useCallback(
    (amount: number, fromCurrency: string): number => {
      const fromRate = ratesMap[fromCurrency?.toUpperCase()] ?? 1;
      const toRate = ratesMap[selectedCurrency.code] ?? 1;
      const raw = (amount / fromRate) * toRate;
      const decimals = decimalsMap[selectedCurrency.code] ?? 2;
      const multiplier = Math.pow(10, decimals);
      return Math.round(raw * multiplier) / multiplier;
    },
    [selectedCurrency.code, ratesMap, decimalsMap],
  );

  const formatPrice = useCallback(
    (amount: number, originalCurrency: string): string => {
      const converted = convertAmount(amount, originalCurrency);
      const decimals = decimalsMap[selectedCurrency.code] ?? 2;

      const formatted = converted.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

      return `${formatted} ${selectedCurrency.code}`;
    },
    [selectedCurrency, convertAmount, decimalsMap],
  );

  // ─── Stable formatter (does NOT depend on selectedCurrency) ───

  const formatPriceRaw = useCallback(
    (amount: number, currency: string): string => {
      const code = currency?.toUpperCase() ?? 'USD';
      const decimals = decimalsMap[code] ?? 2;

      const formatted = amount.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

      return `${formatted} ${code}`;
    },
    [decimalsMap],
  );

  // ─── Memoised context values ──────────────────────────────────
  //
  // Stable value changes only on API fetch — NOT on currency switch.
  // Components subscribing to CurrencyDataContext skip re-renders
  // when the user picks a different currency.

  const dataValue = useMemo<CurrencyDataContextValue>(
    () => ({
      supportedCurrencies: currencies,
      ratesMap,
      decimalsMap,
      isLoading,
      lastFetchedAt,
      setSelectedCurrency,
      formatPriceRaw,
    }),
    [currencies, ratesMap, decimalsMap, isLoading, lastFetchedAt, setSelectedCurrency, formatPriceRaw],
  );

  const displayValue = useMemo<CurrencyDisplayContextValue>(
    () => ({
      selectedCurrency,
      convertAmount,
      formatPrice,
    }),
    [selectedCurrency, convertAmount, formatPrice],
  );

  return (
    <CurrencyDataContext.Provider value={dataValue}>
      <CurrencyDisplayContext.Provider value={displayValue}>
        {children}
      </CurrencyDisplayContext.Provider>
    </CurrencyDataContext.Provider>
  );
}

// ─── Hooks ──────────────────────────────────────────────────────

/** Full combined hook — backward compatible. Re-renders on either context change. */
export function useCurrency(): CurrencyContextValue {
  const data = useContext(CurrencyDataContext);
  const display = useContext(CurrencyDisplayContext);
  if (!data || !display) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return { ...data, ...display };
}

/** Stable-only hook. Does NOT re-render when user switches currency.
 *  Use this for components that only need formatPriceRaw, supportedCurrencies,
 *  or setSelectedCurrency (without reading selectedCurrency). */
export function useCurrencyData(): CurrencyDataContextValue {
  const data = useContext(CurrencyDataContext);
  if (!data) {
    throw new Error('useCurrencyData must be used within a CurrencyProvider');
  }
  return data;
}

/** Volatile-only hook. Re-renders when user switches currency.
 *  Use this for components that only need selectedCurrency or formatPrice. */
export function useCurrencyDisplay(): CurrencyDisplayContextValue {
  const display = useContext(CurrencyDisplayContext);
  if (!display) {
    throw new Error('useCurrencyDisplay must be used within a CurrencyProvider');
  }
  return display;
}
