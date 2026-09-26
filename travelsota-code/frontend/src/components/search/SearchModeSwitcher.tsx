'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { ComingSoonModal, COMING_SOON_MODULES } from '@/features/coming-soon/ComingSoonModal';
import { usePublicModules } from '@/features/home/hooks/usePublicModules';

type SearchMode = 'flights' | 'hotels';

interface SearchModeSwitcherProps {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  className?: string;
}

// Proper airplane (not a paper-plane/send icon) — matches the trip-style reference.
const planeIcon = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
const hotelIcon = 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4a3 3 0 0 1 6 0v4M9 11h.01M15 11h.01M12 11h.01';

export function SearchModeSwitcher({ searchMode, onSearchModeChange, className = '' }: SearchModeSwitcherProps) {
  const t = useTranslations('Nav');
  const tf = useTranslations('Flights');
  const { modules, label, isEnabled, order } = usePublicModules();
  const [comingSoonModule, setComingSoonModule] = useState<string | null>(null);
  // Track which order we already applied as the default — reapply on change
  // (so an admin reorder shows without a page refresh) but never after the
  // visitor has manually picked a module.
  const lastAppliedOrder = useRef<string | null>(null);

  const liveKeys = order
    .filter((k) => k === 'flights' || k === 'hotels')
    .filter((k) => isEnabled(k));

  const modes: Array<{ mode: string; label: string; icon: string; comingSoon: boolean; hidden: boolean }> = [
    ...liveKeys.map((mode) => ({
      mode,
      label: label(mode, t(mode === 'flights' ? 'flights' : 'hotels')),
      icon: mode === 'flights' ? planeIcon : hotelIcon,
      comingSoon: false,
      hidden: false,
    })),
    ...COMING_SOON_MODULES.map((m) => ({ mode: m.key, label: m.shortLabel ?? m.label, icon: m.icon, comingSoon: true, hidden: false })),
  ].filter((m) => !m.hidden);

  // Adopt the admin-configured default module (order[0]) whenever it changes.
  useEffect(() => {
    if (!order.length || order.length === 0) return;
    const signature = order.join(',');
    if (lastAppliedOrder.current === signature) return;
    lastAppliedOrder.current = signature;
    const first = order.find((k) => k === 'flights' || k === 'hotels');
    if (first && first !== searchMode && isEnabled(first)) {
      onSearchModeChange(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, modules]);

  // If the active mode was disabled by the admin, jump to the first enabled one.
  useEffect(() => {
    const firstEnabled = modes.find((m) => !m.comingSoon)?.mode as SearchMode | undefined;
    if (firstEnabled && !modes.some((m) => m.mode === searchMode)) {
      onSearchModeChange(firstEnabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modes, searchMode]);

  return (
    <>
      <div
        className={`flex w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2 ${className}`}
        role="tablist"
        aria-label={tf('searchMode')}
      >
        {modes.map(({ mode, label, icon, comingSoon }) => {
          const active = searchMode === mode;
          // Soon-modules show their name + a "Soon" badge (icon-only chips were unclear).
          if (comingSoon) {
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => setComingSoonModule(mode)}
                className="group relative inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 text-[13px] font-semibold text-brand-teal shadow-[0_6px_18px_rgba(3,61,74,0.09)] transition-[color,transform] duration-200 hover:-translate-y-0.5 hover:text-brand-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40 active:scale-[0.97]"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-teal/[0.08] text-brand-teal">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                </span>
                <span className="whitespace-nowrap">{label}</span>
                <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600 ring-1 ring-amber-200">
                  Soon
                </span>
              </button>
            );
          }

          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSearchModeChange(mode as SearchMode)}
              className={`relative inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold transition-[color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40 active:scale-[0.97] ${
                active ? 'text-white' : 'border border-slate-200/90 bg-white text-brand-teal shadow-[0_6px_18px_rgba(3,61,74,0.09)] hover:-translate-y-0.5 hover:text-brand-teal-700'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="hero-mode-pill"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  className="absolute inset-0 rounded-xl bg-gradient-to-br from-brand-teal to-brand-teal-700 shadow-[0_12px_28px_rgba(3,61,74,0.35)]"
                  aria-hidden="true"
                />
              )}
              <span className="relative z-[1] flex items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 ${
                    active ? 'bg-white/15 text-white' : 'bg-brand-teal/[0.08] text-brand-teal'
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                  </svg>
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <ComingSoonModal moduleKey={comingSoonModule} onClose={() => setComingSoonModule(null)} />
    </>
  );
}
