'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { fetchActiveLanguages, type PublicLanguageDto } from '@/lib/api/languages';
import { getStoredUser } from '@/lib/auth/storage';

export interface LanguageInfo {
  code: string;
  name: string;
  direction: string;
  isDefault?: boolean;
}

const FALLBACK_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', direction: 'LTR', isDefault: true },
];

const DEFAULT_CODE = 'en';
const STORAGE_KEY = 'travelsota_language';
const COOKIE_NAME = 'NEXT_LOCALE';

interface LanguageContextValue {
  selectedLanguage: LanguageInfo;
  setSelectedLanguage: (lang: LanguageInfo) => void;
  supportedLanguages: LanguageInfo[];
  isLoading: boolean;
  direction: string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function mapApiDto(dto: PublicLanguageDto): LanguageInfo {
  return {
    code: dto.code,
    name: dto.name,
    direction: dto.direction,
    isDefault: dto.isDefault,
  };
}

function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]*)/);
  const code = match ? decodeURIComponent(match[1]).trim().toLowerCase() : '';
  return /^[a-z]{2,5}(-[a-z]{2})?$/.test(code) ? code : null;
}

function setLocaleCookie(code: string) {
  if (typeof document === 'undefined') return;
  // Path=/, SameSite=Lax — readable by server on next navigation
  document.cookie = `${COOKIE_NAME}=${code}; path=/; max-age=${365 * 24 * 60 * 60}; SameSite=Lax`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [languages, setLanguages] = useState<LanguageInfo[]>(FALLBACK_LANGUAGES);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultCode, setDefaultCode] = useState(DEFAULT_CODE);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchActiveLanguages()
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) {
          setIsLoading(false);
          return;
        }
        const mapped = data.map(mapApiDto);
        setLanguages(mapped);
        const defaultFromApi = mapped.find((l) => l.isDefault);
        if (defaultFromApi) setDefaultCode(defaultFromApi.code);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, []);

  const [selectedLanguage, setSelectedLanguageState] = useState<LanguageInfo>(() => {
    if (typeof window !== 'undefined') {
      // Cookie first: freshest explicit choice, server already renders from it.
      // Full object (name/direction) reconciled from API list once loaded.
      const cookieCode = readLocaleCookie();
      if (cookieCode && cookieCode !== DEFAULT_CODE) {
        return { code: cookieCode, name: cookieCode, direction: 'LTR' };
      }
      const user = getStoredUser();
      const prefCode = user?.preferredLanguage;
      if (prefCode) {
        const found = FALLBACK_LANGUAGES.find((l) => l.code === prefCode);
        if (found) return found;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const found = FALLBACK_LANGUAGES.find((l) => l.code === stored);
        if (found) return found;
      }
    }
    const fallbackDefault = FALLBACK_LANGUAGES.find((l) => l.code === DEFAULT_CODE);
    return fallbackDefault ?? FALLBACK_LANGUAGES[0];
  });

  // Reconcile after API load
  useEffect(() => {
    if (isLoading || languages.length === 0) return;
    const id = setTimeout(() => {
      setSelectedLanguageState((prev) => {
        const stillExists = languages.find((l) => l.code === prev.code);
        if (stillExists) return stillExists;
        const apiDefault = languages.find((l) => l.code === defaultCode);
        return apiDefault ?? languages[0] ?? prev;
      });
    }, 0);
    return () => clearTimeout(id);
  }, [isLoading, languages, defaultCode]);

  const setSelectedLanguage = useCallback((lang: LanguageInfo) => {
    setSelectedLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang.code);
      setLocaleCookie(lang.code);
    }
    router.refresh();
  }, [router]);

  const direction = selectedLanguage.direction ?? 'LTR';

  // Persist preference on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, selectedLanguage.code);
    }
  }, [selectedLanguage]);

  // Sync cookie on change so next-intl server reads correct locale
  useEffect(() => {
    if (typeof document !== 'undefined') {
      setLocaleCookie(selectedLanguage.code);
    }
  }, [selectedLanguage.code]);

  return (
    <LanguageContext.Provider
      value={{
        selectedLanguage,
        setSelectedLanguage,
        supportedLanguages: languages,
        isLoading,
        direction,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
