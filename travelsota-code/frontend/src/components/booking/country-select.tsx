'use client';

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { CountryOption } from '@/features/reference/api/countries';

// ─── Types ────────────────────────────────────────────────

interface CountrySelectProps {
  value: string;
  onChange: (code: string, country?: CountryOption) => void;
  countries: CountryOption[];
  /** Dial mode shows only the flag and calling code; nationality mode shows name, ISO code, and calling code. */
  mode?: 'dial' | 'nationality';
  placeholder?: string;
  error?: string;
  valid?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

// ─── Icons ────────────────────────────────────────────────

function SearchIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function ChevronIcon({ className = 'h-4 w-4', open }: { className?: string; open?: boolean }) {
  return (
    <svg className={`${className} transition-transform duration-150 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function CheckIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function AlertIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}

// ─── Flag ─────────────────────────────────────────────────

function CountryFlag({ code, name }: { code: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const iso = code?.toLowerCase() ?? '';
  if (failed || !iso || iso.length !== 2) {
    return (
      <span className="flex h-5 w-6 shrink-0 items-center justify-center rounded-[4px] bg-zinc-100 text-[9px] font-bold uppercase text-zinc-500">
        {code ?? '—'}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- flagcdn serves tiny flag thumbnails; next/image cannot optimize a dynamic CDN URL
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      srcSet={`https://flagcdn.com/w80/${iso}.png 2x`}
      alt={name}
      width={24}
      height={16}
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-4 w-6 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
    />
  );
}

// ─── Helpers ───────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-bold text-zinc-900">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

// ─── Main Component ────────────────────────────────────────

export function CountrySelect({
  value,
  onChange,
  countries,
  mode = 'dial',
  placeholder,
  error,
  valid,
  disabled,
  className,
  'aria-label': ariaLabel,
}: CountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const tBooking = useTranslations('Booking');
  const tCommon = useTranslations('Common');

  const selected = useMemo(
    () => countries.find((c) => c.code === value),
    [countries, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.includes(q),
    );
  }, [countries, query]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToHighlight = useCallback((idx: number) => {
    const el = listRef.current?.children[idx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleSelect = useCallback(
    (country: CountryOption) => {
      onChange(country.code, country);
      setOpen(false);
      setQuery('');
      setHighlightIdx(-1);
    },
    [onChange],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx((prev) => {
          const next = prev < filtered.length - 1 ? prev + 1 : 0;
          scrollToHighlight(next);
          return next;
        });
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx((prev) => {
          const next = prev > 0 ? prev - 1 : filtered.length - 1;
          scrollToHighlight(next);
          return next;
        });
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && filtered[highlightIdx]) handleSelect(filtered[highlightIdx]);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setQuery('');
        break;
    }
  }

  const isValid = !!valid && !!value && !error;
  const isInvalid = !!error;

  const baseClasses =
    'flex h-11 w-full items-center gap-2 rounded-lg border bg-white px-3 text-sm text-zinc-900 outline-none transition-all duration-150';
  const stateClasses = isInvalid
    ? 'border-red-400 ring-1 ring-red-400/40'
    : isValid
      ? 'border-emerald-400 ring-1 ring-emerald-400/40'
      : 'border-zinc-200 hover:border-zinc-300 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900/10';

  const emptyPlaceholder = placeholder ?? (mode === 'dial' ? tBooking('selectCountryCode') : tBooking('selectNationality'));

  return (
    <div ref={rootRef} className={`relative w-full ${className ?? ''}`}>
      <div className={`${baseClasses} ${stateClasses} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
        <button
          type="button"
          onClick={() => {
            if (disabled) return;
            setOpen((o) => !o);
            setHighlightIdx(-1);
            if (!open) {
              setQuery('');
              requestAnimationFrame(() => inputRef.current?.focus());
            }
          }}
          className="flex w-full items-center gap-2 text-left"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {selected ? (
            <>
              <CountryFlag code={selected.code} name={selected.name} />
              <span className="min-w-0 flex-1 truncate">
                {mode === 'dial' ? (
                  <span className="font-semibold tabular-nums">{selected.dialCode}</span>
                ) : (
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="truncate">{selected.name}</span>
                    <span className="shrink-0 text-xs font-semibold uppercase text-zinc-400">{selected.code}</span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400">{selected.dialCode}</span>
                  </span>
                )}
              </span>
            </>
          ) : (
            <span className="flex-1 text-zinc-400">{emptyPlaceholder}</span>
          )}
          <span className="pointer-events-none">
            <ChevronIcon open={open} />
          </span>
        </button>
      </div>

      {/* Validation indicators */}
      {isInvalid && (
        <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600" role="alert">
          <AlertIcon /> {error}
        </p>
      )}

      {/* Dropdown */}
      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2.5">
            <SearchIcon className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlightIdx(-1); }}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'dial' ? tCommon('countrySearchDialPlaceholder') : tCommon('countrySearchNationalityPlaceholder')}
              className="w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              autoComplete="off"
            />
            {isValid && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
          </div>

          {/* List */}
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto overscroll-contain py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-zinc-400">{tCommon('noCountriesFound')}</div>
            ) : (
              filtered.map((country, idx) => {
                const active = idx === highlightIdx;
                const isSelected = country.code === value;
                return (
                  <button
                    key={country.code}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(country);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors duration-100 ${
                      active ? 'bg-zinc-50' : ''
                    }`}
                  >
                    <CountryFlag code={country.code} name={country.name} />
                    {mode === 'dial' ? (
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-800">{country.dialCode}</span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-zinc-700">
                        {highlightMatch(country.name, query)}
                        <span className="ml-1.5 text-xs font-semibold uppercase text-zinc-400">{country.code}</span>
                        <span className="ml-1.5 text-xs tabular-nums text-zinc-400">{country.dialCode}</span>
                      </span>
                    )}
                    {isSelected && <CheckIcon className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
