'use client';

import { type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'motion/react';
import { FlightSearchForm, type FlightSearchFormState } from '@/components/search/FlightSearchForm';
import { HotelSearchForm } from '@/features/hotels/components/hotel-search-form';
import type { FormState, RoomForm } from '@/features/hotels/types/search-form';
import { useState } from 'react';
import { ComingSoonModal, COMING_SOON_MODULES } from '@/features/coming-soon/ComingSoonModal';

const ease = [0.16, 1, 0.3, 1] as const;

type SearchMode = 'flights' | 'hotels';

const planeIcon = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
const hotelIcon = 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-4a3 3 0 0 1 6 0v4M9 11h.01M15 11h.01M12 11h.01';

export interface SearchSectionProps {
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  flightForm: FlightSearchFormState;
  onFlightFormChange: (updates: Partial<FlightSearchFormState>) => void;
  onFlightSearch: () => void;
  flightPending?: boolean;
  flightError?: string | null;
  hotelForm: FormState;
  onHotelFieldChange: <K extends keyof FormState>(key: K, value: string) => void;
  onHotelRoomChange: (index: number, key: keyof RoomForm, value: string) => void;
  onHotelSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onHotelFormSet: React.Dispatch<React.SetStateAction<FormState>>;
  hotelMinDate: string;
  hotelPending?: boolean;
  hotelError?: string | null;
  isAgent?: boolean;
  className?: string;
  showInternalSwitcher?: boolean;
}

export function SearchSection({
  searchMode,
  onSearchModeChange,
  flightForm,
  onFlightFormChange,
  onFlightSearch,
  flightPending,
  flightError,
  hotelForm,
  onHotelFieldChange,
  onHotelRoomChange,
  onHotelSubmit,
  onHotelFormSet,
  hotelMinDate,
  hotelPending,
  hotelError,
  isAgent,
  className = '',
  showInternalSwitcher = true,
}: SearchSectionProps) {
  const [comingSoonModule, setComingSoonModule] = useState<string | null>(null);
  const t = useTranslations('Home');
  const tc = useTranslations('Common');
  return (
    <div className={`w-full ${className}`}>
      <div className="relative z-10 overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_60px_rgba(3,61,74,0.14),0_4px_14px_rgba(3,61,74,0.05)] ring-1 ring-slate-900/[0.03]">
        {/* Premium gradient hairline along the top edge */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[2px] rounded-t-2xl bg-gradient-to-r from-transparent via-brand-teal/50 to-transparent"
          aria-hidden="true"
        />
        {isAgent ? (
          <p className="mx-5 mt-5 rounded-lg border border-brand-teal/10 bg-brand-teal/[0.04] px-4 py-2.5 text-xs font-semibold text-brand-teal">
            {tc('agentPricingActive')}
          </p>
        ) : null}

        {/* Tab switcher — underline-style like reference */}
        {showInternalSwitcher && (
          <div className="flex items-stretch gap-0 border-b border-slate-100 px-6" role="tablist" aria-label={tc('chooseProduct')}>
            {([
              { mode: 'flights' as const, label: t('flightsTab'), icon: planeIcon, comingSoon: false },
              { mode: 'hotels' as const, label: t('hotelsTab'), icon: hotelIcon, comingSoon: false },
              ...COMING_SOON_MODULES.map((m) => ({ mode: m.key, label: m.label, icon: m.icon, comingSoon: true })),
            ]).map(({ mode, label, icon, comingSoon }) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={searchMode === mode}
                onClick={() => {
                  if (comingSoon) {
                    setComingSoonModule(mode);
                  } else {
                    onSearchModeChange(mode as SearchMode);
                  }
                }}
                className={`relative inline-flex min-h-[56px] items-center gap-2 px-1 text-[13px] font-semibold transition-colors duration-200 mr-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/30 ${
                  comingSoon
                    ? 'text-slate-400 hover:text-brand-teal'
                    : searchMode === mode
                      ? 'text-brand-teal after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:rounded-t after:bg-gradient-to-r after:from-brand-teal after:to-brand-teal-400'
                      : 'text-slate-500 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px] after:rounded-t after:bg-transparent hover:text-brand-teal'
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                {label}
                {comingSoon && (
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-600">
                    {tc('soonBadge')}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Form — isolated stacking context for popovers */}
        <div className="relative z-20 isolate p-4">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={searchMode}
              initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
              transition={{ duration: 0.18, ease }}
            >
              {searchMode === 'flights' ? (
                <FlightSearchForm
                  state={flightForm}
                  onStateChange={onFlightFormChange}
                  onSearch={onFlightSearch}
                  isPending={flightPending}
                  error={flightError}
                />
              ) : (
                <HotelSearchForm
                  form={hotelForm}
                  loading={hotelPending ?? false}
                  minDate={hotelMinDate}
                  onSubmit={onHotelSubmit}
                  updateField={onHotelFieldChange}
                  updateRoomField={onHotelRoomChange}
                  setForm={onHotelFormSet}
                  error={hotelError}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <ComingSoonModal moduleKey={comingSoonModule} onClose={() => setComingSoonModule(null)} />
    </div>
  );
}
