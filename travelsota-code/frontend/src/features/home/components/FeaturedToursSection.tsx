'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useCurrency } from '@/context/CurrencyContext';
import { featuredTours, cityTabs, type FeaturedTour } from '../data/featured-home';

export function FeaturedToursSection() {
  const [activeCity, setActiveCity] = useState('all');
  const t = useTranslations('Home');
  const tc = useTranslations('Common');

  const availableCities = ['all', ...new Set(featuredTours.map((t) => t.city))];
  const tabs = cityTabs.filter((t) => availableCities.includes(t.value));

  const filtered =
    activeCity === 'all' ? featuredTours : featuredTours.filter((t) => t.city === activeCity);

  return (
    <section className="bg-white py-8 sm:py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">
              {t('featuredToursEyebrow')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-600">
              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              {tc('comingSoon')}
            </span>
          </div>
          <h2 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-bold tracking-tight text-[#0d1b1e] sm:text-4xl">
            {t('featuredToursTitle')}
          </h2>
          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-gray-400">
            {t('featuredToursSubtitle')}
          </p>
        </div>

        {/* City tabs */}
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveCity(tab.value)}
              className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-all duration-200 ${
                activeCity === tab.value
                  ? 'border-brand-teal bg-brand-teal text-white'
                  : 'border-brand-teal/10 bg-white text-slate-600 hover:border-brand-teal/20 hover:bg-brand-teal/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tour cards grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TourCard({ tour }: { tour: FeaturedTour }) {
  const { formatPrice } = useCurrency();
  const t = useTranslations('Home');
  const tc = useTranslations('Common');
  return (
    <div className="group flex h-full cursor-default flex-col overflow-hidden rounded-[22px] border border-brand-teal/10 bg-white shadow-[0_10px_35px_rgba(3,61,74,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-teal/18 hover:shadow-[0_22px_55px_rgba(3,61,74,0.14)]">
      {/* Image */}
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden">
        <Image
          src={tour.image}
          alt={tour.title}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          loading="lazy"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Coming Soon badge — module not bookable yet */}
        <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#3b2f00] shadow-md">
          {tc('comingSoon')}
        </span>

        {/* Rating pill */}
        <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-[#0d1b1e] shadow-sm backdrop-blur-sm">
          <svg className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          {tour.rating.toFixed(1)}
        </span>

        {/* Location overlay — matches hotel cards */}
        <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-1.5 text-white">
          <svg className="h-3.5 w-3.5 shrink-0 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate text-[12px] font-medium drop-shadow-sm">{tour.location}</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-[150px] flex-1 flex-col p-4">
        <h3 className="font-[var(--font-traavellio-display)] text-[15px] font-bold leading-snug text-[#0d1b1e] line-clamp-2">
          {tour.title}
        </h3>

        <div className="mt-2 flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 6v6l4 2" />
            </svg>
            {tour.duration}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            {tour.groupSize}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between border-t border-gray-100 pt-3">
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-medium text-gray-400">{tc('from')}</span>
            <span className="text-lg font-bold text-[#0d1b1e]">{formatPrice(tour.priceFrom, tour.currency)}</span>
            <span className="text-[11px] text-gray-400">{t('perPerson')}</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">{tc('soonBadge')}</span>
        </div>
      </div>
    </div>
  );
}
