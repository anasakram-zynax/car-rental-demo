'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useLanguage, type LanguageInfo } from '@/context/LanguageContext';

const ease = [0.16, 1, 0.3, 1] as const;

// language code → ISO country code (for real flag images via flagcdn)
const LANG_COUNTRY: Record<string, string> = {
  en: 'gb', ar: 'sa', fr: 'fr', tr: 'tr', ur: 'pk', de: 'de', ru: 'ru',
  zh: 'cn', es: 'es', it: 'it', pt: 'pt', nl: 'nl', ja: 'jp', ko: 'kr',
  hi: 'in', id: 'id', ms: 'my', th: 'th', vi: 'vn', bn: 'bd', fa: 'ir',
  he: 'il', pl: 'pl', uk: 'ua', sv: 'se', no: 'no', da: 'dk', fi: 'fi',
  el: 'gr', cs: 'cz', hu: 'hu', ro: 'ro', sw: 'ke', am: 'et', ha: 'ng',
};

function Flag({ country, className }: { country?: string; className?: string }) {
  if (!country) {
    return (
      <span className={`flex items-center justify-center bg-zinc-100 text-zinc-400 ${className}`}>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <circle cx="12" cy="12" r="9" /><path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 000 18M12 3a15 15 0 010 18" />
        </svg>
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/w40/${country}.png`}
      alt=""
      width={20}
      height={14}
      loading="eager"
      className={`${className} object-cover`}
    />
  );
}

export function LanguageSelector({ transparent }: { transparent?: boolean }) {
  const t = useTranslations('Common');
  const tNav = useTranslations('Nav');
  const { selectedLanguage, setSelectedLanguage, supportedLanguages } = useLanguage();
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
    if (!search.trim()) return supportedLanguages;
    const q = search.toLowerCase();
    return supportedLanguages.filter(
      (l) => l.code.toLowerCase().includes(q) || l.name.toLowerCase().includes(q),
    );
  }, [supportedLanguages, search]);

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
        <Flag
          country={LANG_COUNTRY[selectedLanguage.code]}
          className="h-[14px] w-5 shrink-0 rounded-[3px] ring-1 ring-black/10"
        />
        <span className="font-bold tracking-tight">{selectedLanguage.code.toUpperCase()}</span>
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
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{tNav('language')}</p>
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
                placeholder={t('searchLanguages')}
                aria-label={t('searchLanguages')}
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
                  <p className="text-xs text-zinc-400">{t('noLanguagesFound')}</p>
                </div>
              ) : (
                filtered.map((l: LanguageInfo) => {
                  const isSelected = l.code === selectedLanguage.code;
                  return (
                    <button
                      key={l.code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSelectedLanguage(l);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-all duration-150 ${
                        isSelected
                          ? 'bg-brand-teal/5 font-semibold text-brand-teal'
                          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                      }`}
                    >
                      <Flag
                        country={LANG_COUNTRY[l.code]}
                        className="h-[15px] w-[22px] shrink-0 rounded-[3px] ring-1 ring-black/10"
                      />
                      <div className="min-w-0 flex-1">
                        <span className={`font-semibold ${isSelected ? 'text-brand-teal' : 'text-zinc-800'}`}>
                          {l.name}
                        </span>
                        <p className="truncate text-[10px] text-zinc-400">
                          {l.code.toUpperCase()} &middot; {l.direction === 'RTL' ? t('rtlLabel') : t('ltrLabel')}
                        </p>
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
                {t('languagesAvailable', { count: supportedLanguages.length })}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
