'use client';

import { useMemo, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from '@/components/ui/popover';
import { InventorySearch } from '@/components/search/InventorySearch';
import { SearchDateInput } from '@/components/search/SearchDateInput';
import { SearchDateRangeInput } from '@/components/search/SearchDateRangeInput';
import type { TravelSuggestion } from '@/features/autocomplete/types';

const CABIN_CLASSES = ['Economy', 'PremiumEconomy', 'Business', 'First'];
const CABIN_KEYS: Record<string, string> = {
  Economy: 'cabinEconomy', PremiumEconomy: 'cabinPremiumEconomy', Business: 'cabinBusiness', First: 'cabinFirst', PremiumFirst: 'cabinPremiumFirst',
};

export interface FlightSearchFormState {
  origin: string; destination: string; departureDate: string; returnDate: string;
  tripType: 'one_way' | 'round_trip' | 'multi_city'; adults: number; cabinClass: string;
  originSuggestion: TravelSuggestion | null; destinationSuggestion: TravelSuggestion | null;
  legs?: { origin: string; destination: string; departureDate: string }[];
  legSuggestions?: (TravelSuggestion | null)[];
}

export interface FlightSearchFormProps {
  state: FlightSearchFormState; onStateChange: (updates: Partial<FlightSearchFormState>) => void;
  onSearch: () => void; isPending?: boolean; error?: string | null; className?: string;
}

function getTomorrowISO(): string { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }

const FIELD_INPUT_CLASS = '!h-auto !w-full !rounded-none !border-0 !bg-transparent !p-0 !text-[15px] !font-semibold !text-slate-900 !shadow-none placeholder:!font-normal placeholder:!text-slate-400 focus:!outline-none focus:!ring-0';
const DATE_INPUT_CLASS = 'w-full cursor-pointer border-0 bg-transparent p-0 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-0';

export function FlightSearchForm({ state, onStateChange, onSearch, isPending = false, error, className = '' }: FlightSearchFormProps) {
  const t = useTranslations('Flights');
  const tc = useTranslations('Common');
  const [showCabin, setShowCabin] = useState(false);
  const [showTravelers, setShowTravelers] = useState(false);
  const cabinBtnRef = useRef<HTMLButtonElement>(null);
  const travelersBtnRef = useRef<HTMLButtonElement>(null);

  function handleFieldClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('input')) return;
    e.currentTarget.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
  }

  const minDate = useMemo(() => getTomorrowISO(), []);

  function swapAirports(e: React.MouseEvent) {
    e.stopPropagation();
    onStateChange({ origin: state.destination, destination: state.origin, originSuggestion: state.destinationSuggestion, destinationSuggestion: state.originSuggestion });
  }

  return (
    <div className={className}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>}

      {/* Row 1 — trip type */}
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {(['round_trip', 'one_way', 'multi_city'] as const).map((type) => (
            <button key={type} type="button" onClick={() => { onStateChange({ tripType: type }); if (type === 'round_trip' && !state.returnDate) onStateChange({ returnDate: getTomorrowISO() }); }}
              className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200 ${state.tripType === type ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {type === 'round_trip' ? t('tripRoundTrip') : type === 'one_way' ? t('oneWay') : t('multiCity')}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 — input fields */}
      {state.tripType === 'multi_city' ? (
        <div className="mb-3 flex flex-col overflow-visible rounded-2xl border border-slate-200 bg-white">
          {(state.legs ?? []).map((leg: { origin: string; destination: string; departureDate: string }, index: number) => (
            <div key={index} className="flex flex-col border-b border-slate-100 last:border-b-0 sm:flex-row sm:items-stretch">
              <div className="flex items-center px-4 py-2 sm:w-20 sm:shrink-0 sm:justify-center sm:border-r sm:border-slate-100 sm:py-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-teal text-[13px] font-bold text-white shadow-sm">{index + 1}</span>
              </div>
              <div onClick={handleFieldClick} className="group flex min-h-[72px] flex-1 cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 sm:py-3">
                <PinIcon />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('originInput')}</div>
                  <InventorySearch placeholder={t('legOriginPlaceholder')} value={leg.origin ?? ''} selectedSuggestion={(state.legSuggestions ?? [])[index] ?? null} module="flights" allowedTypes={['CITY','METRO_AREA','AIRPORT','AIRLINE']} enableRecentSearches
                    onChange={(v: string) => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, origin: v }; onStateChange({ legs }); }}
                    onSelect={(suggestion: TravelSuggestion) => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, origin: suggestion.code ?? leg.origin }; const ls = [...(state.legSuggestions ?? [])]; ls[index] = suggestion; onStateChange({ legs, legSuggestions: ls }); }}
                    onClear={() => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, origin: '' }; const ls = [...(state.legSuggestions ?? [])]; ls[index] = null; onStateChange({ legs, legSuggestions: ls }); }}
                    inputClassName={FIELD_INPUT_CLASS} />
                </div>
                <button type="button" onClick={(e) => { e.stopPropagation(); const legs = [...(state.legs ?? [])]; const l = legs[index]; legs[index] = { ...l!, origin: l!.destination, destination: l!.origin }; onStateChange({ legs }); }} title={t('swapAirports')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition-colors hover:border-brand-teal/30 hover:text-brand-teal">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>
                </button>
              </div>
              <div onClick={handleFieldClick} className="group flex min-h-[72px] flex-1 cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 sm:border-l sm:border-slate-100 sm:py-3">
                <PinIcon />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('destinationInput')}</div>
                  <InventorySearch placeholder={t('legDestinationPlaceholder')} value={leg.destination ?? ''} selectedSuggestion={(state.legSuggestions ?? [])[index] ?? null} module="flights" allowedTypes={['CITY','METRO_AREA','AIRPORT','AIRLINE']} enableRecentSearches
                    onChange={(v: string) => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, destination: v }; onStateChange({ legs }); }}
                    onSelect={(suggestion: TravelSuggestion) => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, destination: suggestion.code ?? leg.destination }; onStateChange({ legs }); }}
                    onClear={() => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, destination: '' }; onStateChange({ legs }); }}
                    inputClassName={FIELD_INPUT_CLASS} />
                </div>
              </div>
              <div onClick={handleFieldClick} className="group flex min-h-[72px] flex-1 cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 sm:border-l sm:border-slate-100 sm:py-3">
                <CalendarIcon />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('formDateLabel')}</div>
                  <SearchDateInput min={minDate} value={leg.departureDate} onChange={(v: string) => { const legs = [...(state.legs ?? [])]; legs[index] = { ...legs[index]!, departureDate: v }; onStateChange({ legs }); }} ariaLabel={t('flightLegDateLabel', { index: index + 1 })} className={DATE_INPUT_CLASS} />
                </div>
              </div>
              {(state.legs ?? []).length > 2 ? (
                <div className="flex items-center px-2 sm:border-l sm:border-slate-100">
                  <button type="button" onClick={() => { const legs = (state.legs ?? []).filter((_: any, i: number) => i !== index); const ls = (state.legSuggestions ?? []).filter((_: any, i: number) => i !== index); onStateChange({ legs, legSuggestions: ls }); }} title={t('removeLeg')} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {(state.legs ?? []).length < 6 ? (
            <div className="flex items-center border-t border-slate-100 px-4 py-3">
              <button type="button" onClick={() => { const legs = [...(state.legs ?? []), { origin: '', destination: '', departureDate: getTomorrowISO() }]; const ls = [...(state.legSuggestions ?? []), null]; onStateChange({ legs, legSuggestions: ls }); }} className="inline-flex items-center gap-2 text-[13px] font-semibold text-brand-teal/60 transition-colors hover:text-brand-teal">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {t('addAnotherFlight')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
      <div className="mb-3 flex flex-col overflow-visible rounded-2xl border border-slate-200 bg-white lg:flex-row lg:items-stretch">
        <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50">
          <PinIcon />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('origin')}</div>
            <InventorySearch placeholder={t('originPrompt')} value={state.origin} selectedSuggestion={state.originSuggestion} module="flights" allowedTypes={['CITY','METRO_AREA','AIRPORT','AIRLINE']} enableRecentSearches
              onChange={(v) => onStateChange({ origin: v })} onSelect={(s) => onStateChange({ origin: s.label, originSuggestion: s })} onClear={() => onStateChange({ origin: '', originSuggestion: null })} inputClassName={FIELD_INPUT_CLASS} />
          </div>
          <div className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 translate-x-1/2 lg:block">
            <button type="button" onClick={swapAirports} title={t('swapAirports')} aria-label={t('swapAirports')}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-slate-500 shadow-md transition-all duration-300 hover:rotate-180 hover:bg-brand-teal hover:text-white active:scale-90">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>
            </button>
          </div>
        </div>

        <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center gap-3 border-t border-slate-200 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50 lg:border-l lg:border-t-0">
          <PinIcon />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('destination')}</div>
            <InventorySearch placeholder={t('destinationPrompt')} value={state.destination} selectedSuggestion={state.destinationSuggestion} module="flights" allowedTypes={['CITY','METRO_AREA','AIRPORT','AIRLINE']} enableRecentSearches
              onChange={(v) => onStateChange({ destination: v })} onSelect={(s) => onStateChange({ destination: s.label, destinationSuggestion: s })} onClear={() => onStateChange({ destination: '', destinationSuggestion: null })} inputClassName={FIELD_INPUT_CLASS} />
          </div>
        </div>

        {state.tripType === 'round_trip' ? (
          <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center gap-3 border-t border-slate-200 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50 lg:border-l lg:border-t-0">
            <CalendarIcon />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('datesLabel')}</div>
              <SearchDateRangeInput departureDate={state.departureDate} returnDate={state.returnDate} min={minDate}
                onChange={(dates) => onStateChange({ departureDate: dates.departureDate, returnDate: dates.returnDate })} className={DATE_INPUT_CLASS} />
            </div>
          </div>
        ) : (
          <>
            <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center gap-3 border-t border-slate-200 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50 lg:border-l lg:border-t-0">
              <CalendarIcon />
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('departureDate')}</div>
                <SearchDateInput min={minDate} value={state.departureDate} onChange={(v) => onStateChange({ departureDate: v })} required ariaLabel={t('departureDateLabel')} className={DATE_INPUT_CLASS} />
              </div>
            </div>
            <div onClick={() => onStateChange({ tripType: 'round_trip', returnDate: getTomorrowISO() })}
              className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center justify-center border-t border-slate-200 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 lg:border-l lg:border-t-0">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 transition-colors group-hover:text-brand-teal">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                {t('addReturn')}
              </span>
            </div>
          </>
        )}
      </div>
      )}

      {/* Row 3 — cabin, travelers, search as a full-width attached strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <button type="button" ref={cabinBtnRef} onClick={(e) => { e.stopPropagation(); setShowCabin((v) => !v); }} aria-expanded={showCabin}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-all duration-200 hover:border-brand-teal/30 hover:bg-brand-teal/[0.04] hover:text-brand-teal">
            {t(CABIN_KEYS[state.cabinClass] ?? 'cabinEconomy')}
            <Chevron open={showCabin} />
          </button>
          {/* eslint-disable-next-line react-hooks/refs -- anchor resolved at render; Popover only opens after mount */}
          <Popover open={showCabin} onClose={() => setShowCabin(false)} anchorEl={cabinBtnRef.current} align="left">
            <div className="w-48 rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0_16px_48px_rgba(0,0,0,.10)]">
              {CABIN_CLASSES.map((cabin) => (
                <button key={cabin} type="button" onClick={(e) => { e.stopPropagation(); onStateChange({ cabinClass: cabin }); setShowCabin(false); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-colors ${state.cabinClass === cabin ? 'bg-brand-teal/[0.06] text-brand-teal' : 'text-slate-600 hover:bg-slate-50'}`}>
                  {t(CABIN_KEYS[cabin] ?? 'cabinEconomy')}
                  {state.cabinClass === cabin && <CheckIcon />}
                </button>
              ))}
            </div>
          </Popover>

          <div>
          <button type="button" ref={travelersBtnRef} onClick={(e) => { e.stopPropagation(); setShowTravelers((v) => !v); }} aria-expanded={showTravelers}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-all duration-200 hover:border-brand-teal/30 hover:bg-brand-teal/[0.04] hover:text-brand-teal">
            {t('travelersCount', { count: state.adults })}
            <Chevron open={showTravelers} />
          </button>
          {/* eslint-disable-next-line react-hooks/refs -- anchor resolved at render; Popover only opens after mount */}
          <Popover open={showTravelers} onClose={() => setShowTravelers(false)} anchorEl={travelersBtnRef.current} align="left">
            <div className="w-64 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,.10)]">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-semibold text-slate-900">{t('adults')}</p><p className="text-xs text-slate-400">{t('adultsSubtitle')}</p></div>
                <div className="flex items-center gap-3">
                  <button type="button" onClick={() => onStateChange({ adults: Math.max(1, state.adults - 1) })} disabled={state.adults <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-90 disabled:opacity-25">−</button>
                  <span className="w-5 text-center text-sm font-bold text-slate-900 tabular-nums">{state.adults}</span>
                  <button type="button" onClick={() => onStateChange({ adults: Math.min(9, state.adults + 1) })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-90">+</button>
                </div>
              </div>
            </div>
          </Popover>
        </div>
        </div>

        <button type="button" onClick={onSearch} disabled={isPending} aria-label={t('searchButton')}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-teal to-brand-teal-600 px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(3,61,74,.28)] transition-all duration-200 hover:-translate-y-0.5 hover:from-brand-teal-600 hover:to-brand-teal-700 hover:shadow-[0_12px_28px_rgba(3,61,74,.32)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60">
          {isPending ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>{tc('search')}</>
          )}
        </button>
      </div>
    </div>
  );
}

function PinIcon() { return <svg className="h-[18px] w-[18px] shrink-0 text-slate-300 group-focus-within:text-brand-teal/50 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="10" r="3" /><path d="M19.5 10c0 7.142-7.5 11.25-7.5 11.25S4.5 17.142 4.5 10a7.5 7.5 0 1115 0z" /></svg>; }
function CalendarIcon() { return <svg className="h-[18px] w-[18px] shrink-0 text-slate-300 group-focus-within:text-brand-teal/50 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>; }
function Chevron({ open }: { open: boolean }) { return <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>; }
function CheckIcon() { return <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>; }