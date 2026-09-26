'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Popover } from '@/components/ui/popover';
import { FormState, RoomForm } from '../types/search-form';
import { InventorySearch } from '@/components/search/InventorySearch';
import { SearchDateRangeInput } from '@/components/search/SearchDateRangeInput';

const NATIONALITIES = [
  { value: 'AE', label: 'United Arab Emirates' }, { value: 'GB', label: 'United Kingdom' }, { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' }, { value: 'IN', label: 'India' }, { value: 'SA', label: 'Saudi Arabia' },
  { value: 'KW', label: 'Kuwait' }, { value: 'QA', label: 'Qatar' }, { value: 'OM', label: 'Oman' },
  { value: 'BH', label: 'Bahrain' }, { value: 'DE', label: 'Germany' }, { value: 'FR', label: 'France' },
  { value: 'IT', label: 'Italy' }, { value: 'ES', label: 'Spain' }, { value: 'TR', label: 'Turkey' },
  { value: 'CN', label: 'China' }, { value: 'JP', label: 'Japan' }, { value: 'KR', label: 'South Korea' },
  { value: 'SG', label: 'Singapore' }, { value: 'MY', label: 'Malaysia' }, { value: 'TH', label: 'Thailand' },
  { value: 'AU', label: 'Australia' }, { value: 'CA', label: 'Canada' }, { value: 'BR', label: 'Brazil' },
  { value: 'ZA', label: 'South Africa' },
];

const FIELD_INPUT_CLASS = '!h-auto !w-full !rounded-none !border-0 !bg-transparent !p-0 !text-[15px] !font-semibold !text-slate-900 !shadow-none placeholder:!font-normal placeholder:!text-slate-400 focus:!outline-none focus:!ring-0';

interface HotelSearchFormProps {
  form: FormState; loading: boolean; minDate: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  updateField: <K extends keyof FormState>(key: K, value: string) => void;
  updateRoomField: (index: number, key: keyof RoomForm, value: string) => void;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  error?: string | null;
}

export function HotelSearchForm(props: HotelSearchFormProps) {
  const { form, loading, minDate, onSubmit, updateField, updateRoomField, setForm, error } = props;
  const t = useTranslations('Hotels');
  const tc = useTranslations('Common');

  const [showGuestPanel, setShowGuestPanel] = useState(false);
  const [showNationalityPanel, setShowNationalityPanel] = useState(false);
  const [nationalityQuery, setNationalityQuery] = useState('');
  const guestBtnRef = useRef<HTMLButtonElement>(null);
  const nationalityBtnRef = useRef<HTMLButtonElement>(null);

  function handleFieldClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.closest('input')) return;
    e.currentTarget.querySelector<HTMLInputElement>('input:not([type="hidden"])')?.focus();
  }

  const totalGuests = form.roomsList.reduce((acc, room) => acc + Number(room.adults || 1) + Number(room.children || 0), 0);
  const selectedNationality = NATIONALITIES.find((nat) => nat.value === (form.nationality || 'AE')) ?? NATIONALITIES[0];
  const filteredNationalities = NATIONALITIES.filter((nat) => `${nat.label} ${nat.value}`.toLowerCase().includes(nationalityQuery.trim().toLowerCase()));

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">{error}</div>}

      {/* Row 1 — destination + dates */}
      <div className="mb-3 flex flex-col overflow-visible rounded-2xl border border-slate-200 bg-white lg:flex-row lg:items-stretch">
        <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-[2] cursor-pointer items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50">
          <PinIcon />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('destinationOrHotel')}</div>
            <InventorySearch placeholder={t('whereTo')} value={form.destinationName || form.hotelName} selectedSuggestion={form.selectedDestination || form.selectedHotel} module="hotels" allowedTypes={['HOTEL_DESTINATION', 'HOTEL']} enableRecentSearches
              onChange={(value) => { updateField('destinationName', value); updateField('hotelName', ''); updateField('selectedDestinationCode', ''); setForm((prev) => ({ ...prev, selectedDestination: null, selectedHotel: null })); }}
              onSelect={(suggestion) => {
                if (suggestion.type === 'HOTEL') { updateField('hotelName', suggestion.label); setForm((prev) => ({ ...prev, selectedHotel: suggestion, hotelName: suggestion.label })); if (suggestion.destinationCode) updateField('selectedDestinationCode', suggestion.destinationCode); if (suggestion.searchPayload) setForm((prev) => ({ ...prev, selectedDestination: suggestion })); }
                else { updateField('destinationName', suggestion.label); updateField('selectedDestinationCode', suggestion.destinationCode ?? suggestion.code ?? ''); setForm((prev) => ({ ...prev, selectedDestination: suggestion, selectedHotel: null, hotelName: '' })); }
              }}
              onClear={() => { updateField('destinationName', ''); updateField('hotelName', ''); updateField('selectedDestinationCode', ''); setForm((prev) => ({ ...prev, selectedDestination: null, selectedHotel: null })); }}
              inputClassName={FIELD_INPUT_CLASS} />
          </div>
        </div>

        <div onClick={handleFieldClick} className="group relative flex min-h-[84px] flex-1 cursor-pointer items-center gap-3 border-t border-slate-200 px-4 py-3 transition-colors duration-200 hover:bg-slate-50 focus-within:bg-slate-50 lg:border-l lg:border-t-0">
          <CalendarIcon />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-slate-400">{t('checkIn')} · {t('checkOut')}</div>
            <SearchDateRangeInput departureDate={form.checkIn} returnDate={form.checkOut} min={minDate}
              onChange={(dates) => { updateField('checkIn', dates.departureDate); updateField('checkOut', dates.returnDate); }}
              className="w-full cursor-pointer border-0 bg-transparent p-0 text-[15px] font-semibold text-slate-900 outline-none placeholder:font-normal placeholder:text-slate-400 focus:ring-0" />
          </div>
        </div>
      </div>

      {/* Row 2 — rooms/guests, nationality, search as a full-width attached strip */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div>
          <button type="button" ref={guestBtnRef} onClick={() => setShowGuestPanel((v) => !v)} aria-expanded={showGuestPanel}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-all duration-200 hover:border-brand-teal/30 hover:bg-brand-teal/[0.04] hover:text-brand-teal">
            {t('guestsRoomsCount', { guests: totalGuests, rooms: form.roomsList.length })}
            <Chevron open={showGuestPanel} />
          </button>
          {/* eslint-disable-next-line react-hooks/refs -- anchor resolved at render; Popover only opens after mount */}
          <Popover open={showGuestPanel} onClose={() => setShowGuestPanel(false)} anchorEl={guestBtnRef.current} align="left">
            <div className="w-80 rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_16px_48px_rgba(0,0,0,.10)] max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div><p className="text-sm font-semibold text-slate-900">{t('roomsGuestsTitle')}</p></div>
                <button type="button" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
                  onClick={() => setForm((prev) => ({ ...prev, roomsList: [...prev.roomsList, { adults: '1', children: '0', childAges: '' }] }))}>{t('addRoom')}</button>
              </div>
              {form.roomsList.map((room, idx) => (
                <div key={idx} className="mb-3 rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t('roomNumber', { n: idx + 1 })}</p>
                    {form.roomsList.length > 1 && (
                      <button type="button" className="rounded-md px-2 py-0.5 text-[10px] text-slate-400 hover:text-red-500"
                        onClick={() => setForm((prev) => { const next = prev.roomsList.slice(); next.splice(idx, 1); return { ...prev, roomsList: next }; })}>{t('removeRoom')}</button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-500">{t('adults')}
                      <input className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-teal/50" type="number" min={1} max={9} value={room.adults} onChange={(e) => updateRoomField(idx, 'adults', e.target.value)} required />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-500">{t('children')}
                      <input className="h-8 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-teal/50" type="number" min={0} max={9} value={room.children} onChange={(e) => updateRoomField(idx, 'children', e.target.value)} required />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] font-medium text-slate-500">{t('agesLabel')}
                      <input className="h-8 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-800 outline-none focus:border-brand-teal/50 disabled:opacity-40" value={room.childAges} onChange={(e) => updateRoomField(idx, 'childAges', e.target.value)} placeholder={(Number(room.children) || 0) > 0 ? '5, 7' : '-'} disabled={(Number(room.children) || 0) === 0} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </Popover>
        </div>

        <div>
          <button type="button" ref={nationalityBtnRef} onClick={() => setShowNationalityPanel((v) => !v)} aria-expanded={showNationalityPanel}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-all duration-200 hover:border-brand-teal/30 hover:bg-brand-teal/[0.04] hover:text-brand-teal">
            <span className="max-w-[150px] truncate">{selectedNationality.label}</span>
            <Chevron open={showNationalityPanel} />
          </button>
          {/* eslint-disable-next-line react-hooks/refs -- anchor resolved at render; Popover only opens after mount */}
          <Popover open={showNationalityPanel} onClose={() => setShowNationalityPanel(false)} anchorEl={nationalityBtnRef.current} align="left">
            <div className="w-64 rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_16px_48px_rgba(0,0,0,.10)]">
              <input value={nationalityQuery} onChange={(e) => setNationalityQuery(e.target.value)} placeholder={t('searchNationality')}
                className="mb-2 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-brand-teal/50 focus:bg-white" />
              <div className="max-h-56 overflow-y-auto">
                {filteredNationalities.map((nat) => (
                  <button key={nat.value} type="button" onClick={() => { updateField('nationality', nat.value); setNationalityQuery(''); setShowNationalityPanel(false); }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${nat.value === selectedNationality.value ? 'bg-brand-teal/[0.06] text-brand-teal' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <span className="truncate font-medium">{nat.label}</span><span className="ml-3 text-xs text-slate-400">{nat.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </Popover>
        </div>
        </div>

        <button type="submit" disabled={loading} aria-label={t('searchHotels')}
          className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-teal to-brand-teal-600 px-7 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(3,61,74,.28)] transition-all duration-200 hover:-translate-y-0.5 hover:from-brand-teal-600 hover:to-brand-teal-700 hover:shadow-[0_12px_28px_rgba(3,61,74,.32)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60">
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>{tc('search')}</>
          )}
        </button>
      </div>
    </form>
  );
}

function PinIcon() { return <svg className="h-[18px] w-[18px] shrink-0 text-slate-300 group-focus-within:text-brand-teal/50 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="10" r="3" /><path d="M19.5 10c0 7.142-7.5 11.25-7.5 11.25S4.5 17.142 4.5 10a7.5 7.5 0 1115 0z" /></svg>; }
function CalendarIcon() { return <svg className="h-[18px] w-[18px] shrink-0 text-slate-300 group-focus-within:text-brand-teal/50 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>; }
function Chevron({ open }: { open: boolean }) { return <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>; }
