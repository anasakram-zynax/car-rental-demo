'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useCurrency, type CurrencyInfo } from '@/context/CurrencyContext';

const ease = [0.16, 1, 0.3, 1] as const;

export function CurrencySelector({ transparent }: { transparent?: boolean }) {
  const t = useTranslations('Common');
  const { selectedCurrency, setSelectedCurrency, supportedCurrencies } = useCurrency();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return supportedCurrencies;
    const q = search.toLowerCase();
    return supportedCurrencies.filter(
      (c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q),
    );
  }, [supportedCurrencies, search]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-[0.97] ${
          transparent
            ? 'text-white hover:bg-white/20'
            : 'text-zinc-600 hover:text-brand-teal hover:bg-brand-teal/5'
        }`}
      >
        <span
          className={`flex h-[18px] min-w-[22px] shrink-0 items-center justify-center rounded-[4px] px-1 text-[11px] font-bold leading-none ${
            transparent ? 'bg-white/15 text-white' : 'bg-brand-teal/10 text-brand-teal'
          }`}
        >
          {selectedCurrency.symbol}
        </span>
        <span className="font-bold tracking-tight">{selectedCurrency.code}</span>
        <svg
          className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease }}
            role="listbox"
            className="absolute right-0 top-full mt-2 w-64 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_24px_60px_rgba(3,61,74,0.18)]"
          >
            <div className="border-b border-zinc-100 px-4 pb-2.5 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t('currencyTitle')}</p>
            </div>

            <div className="relative p-2 pb-1">
              <svg
                className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder={t('searchCurrencies')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-2.5 text-xs text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-brand-teal/20 focus:bg-white focus:ring-2 focus:ring-brand-teal/5"
              />
            </div>

            <div className="max-h-64 overflow-y-auto overscroll-contain p-1 pt-0">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <svg className="h-5 w-5 mb-1 text-zinc-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <p className="text-xs text-zinc-400">{t('noCurrenciesFound')}</p>
                </div>
              ) : (
                filtered.map((c: CurrencyInfo) => {
                  const isSelected = c.code === selectedCurrency.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedCurrency(c);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                        isSelected
                          ? 'bg-brand-teal/5 font-semibold text-brand-teal'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                      }`}
                    >
                      <span
                        className={`flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg px-1 text-sm font-bold ring-1 transition-all duration-150 ${
                          isSelected
                            ? 'bg-brand-teal/10 text-brand-teal ring-brand-teal/20'
                            : 'bg-zinc-50 text-zinc-600 ring-zinc-200/60 group-hover:bg-white group-hover:ring-zinc-300'
                        }`}
                      >
                        {c.symbol}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-semibold ${isSelected ? 'text-brand-teal' : 'text-zinc-800'}`}>
                            {c.code}
                          </span>
                          <span className="truncate text-[10px] text-zinc-400">{c.name}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-teal text-white">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                          </svg>
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-zinc-100 px-4 py-2.5">
              <span className="text-[11px] font-medium text-zinc-400">
                {t('currenciesAvailable', { count: supportedCurrencies.length })}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
