'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api/client';
import { useCurrency } from '@/context/CurrencyContext';

interface FeaturedFlightItem {
  id: string;
  originId: string;
  originCity: string | null;
  destinationId: string;
  destinationCity: string | null;
  airlineName: string | null;
  airlineId: string | null;
  flightNumber: string | null;
  departureDate: string;
  departureTime: string;
  arrivalTime?: string | null;
  duration?: string | null;
  basePrice: number;
  currency: string;
  cabinClass: string;
  refundable?: boolean;
  hasWifi?: boolean;
  hasMeal?: boolean;
}

export function FeaturedFlightsSection() {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const t = useTranslations('Home');
  const tc = useTranslations('Common');
  const tf = useTranslations('Flights');
  const [activeCity, setActiveCity] = useState('all');

  const { data: flights = [], isLoading: loading } = useQuery<FeaturedFlightItem[]>({
    queryKey: ['flights', 'featured'],
    queryFn: async () => {
      // Timed client (60s) instead of bare fetch — a hung supplier must not
      // hang the home page (Bug-009 class). Failure still yields [].
      try {
        return await apiRequest<FeaturedFlightItem[]>('/flights/featured', { timeoutMs: 15000 });
      } catch {
        return [];
      }
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const allCities = useMemo(() => {
    const cities = new Set<string>();
    flights.forEach((f) => { const c = f.originCity || f.originId; if (c) cities.add(c); });
    return ['all', ...Array.from(cities)];
  }, [flights]);

  const filtered = activeCity === 'all' ? flights : flights.filter((f) => (f.originCity || f.originId) === activeCity);

  const searchUrl = (f: FeaturedFlightItem) =>
    `/flights/search?origin=${f.originId}&destination=${f.destinationId}&departureDate=${f.departureDate?.split('T')[0]}&tripType=one_way&cabinClass=${f.cabinClass}&adults=1`;

  if (loading) {
    return (
      <section className="bg-white py-8 sm:py-10 lg:py-14"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6"><span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{t('featuredFlightsEyebrow')}</span><h2 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-bold tracking-tight text-[#0d1b1e] sm:text-4xl">{t('featuredFlightsTitle')}</h2></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-[22px] bg-gray-100" />)}</div>
      </div></section>
    );
  }

  if (flights.length === 0) return null;

  return (
    <section className="bg-white py-8 sm:py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{t('featuredFlightsEyebrow')}</span>
          <h2 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-bold tracking-tight text-[#0d1b1e] sm:text-4xl">{t('featuredFlightsTitle')}</h2>
          <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-gray-400">{t('featuredFlightsSubtitle')}</p>
        </div>
        {allCities.length > 1 && (
          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {allCities.map((city) => (
              <button key={city} type="button" onClick={() => setActiveCity(city)} className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-all duration-200 ${activeCity === city ? 'border-brand-teal bg-brand-teal text-white' : 'border-brand-teal/10 bg-white text-slate-600 hover:border-brand-teal/20 hover:bg-brand-teal/5'}`}>{city === 'all' ? tc('all') : city}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((f) => {
            const from = f.originCity || f.originId;
            const to = f.destinationCity || f.destinationId;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => router.push(searchUrl(f))}
                className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-brand-teal/10 bg-white p-5 text-left shadow-[0_10px_35px_rgba(3,61,74,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-teal/18 hover:shadow-[0_22px_55px_rgba(3,61,74,0.14)]"
              >
                {/* Airline row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-teal/10">
                      <svg className="h-4 w-4 text-brand-teal" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></svg>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold leading-tight text-[#0d1b1e]">{f.airlineName || f.airlineId || '—'}</p>
                      <p className="text-[11px] text-gray-400">{f.flightNumber}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-brand-teal">{f.cabinClass.replace('_', ' ')}</span>
                </div>

                {/* Route row */}
                <div className="mt-4 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold leading-none text-[#0d1b1e]">{f.departureTime}</p>
                    <p className="mt-1 truncate text-[12px] text-gray-400">{from}</p>
                  </div>

                  <div className="flex flex-1 flex-col items-center px-1 pt-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{f.duration ?? ''}</span>
                    <div className="relative mt-1 flex w-full items-center">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-brand-teal/50" />
                      <span className="h-px flex-1 bg-gradient-to-r from-brand-teal/50 to-brand-teal/20" />
                      <svg className="h-3.5 w-3.5 shrink-0 rotate-90 text-brand-teal" viewBox="0 0 24 24" fill="currentColor"><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></svg>
                    </div>
                    {f.refundable && (
                      <span className="mt-1.5 flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-600">
                        <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {tf('refundable')}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 text-right">
                    <p className="text-lg font-bold leading-none text-[#0d1b1e]">{f.arrivalTime ?? '—'}</p>
                    <p className="mt-1 truncate text-[12px] text-gray-400">{to}</p>
                  </div>
                </div>

                {/* Price footer */}
                <div className="mt-auto flex items-end justify-between pt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-[11px] font-medium text-gray-400">{tc('from')}</span>
                    <span className="text-xl font-bold text-[#0d1b1e]">{formatPrice(f.basePrice, f.currency)}</span>
                  </div>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal transition-colors group-hover:bg-brand-teal group-hover:text-white">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
