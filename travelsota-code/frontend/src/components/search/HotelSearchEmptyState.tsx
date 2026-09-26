'use client';

// Premium empty state for the hotel search page (first visit, no search yet).
// Replaces the bare icon+line with a destination gallery that starts real
// searches in one click, plus a quiet trust strip. Design rules:
// - Photography carries the section; chrome stays whisper-quiet.
// - Entrance motion is opacity/rise only (no bounces), staggered, subtle.
// - One accent hue (brand teal) — no rainbow chips.

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';
import { ShieldCheck, BadgePercent, Headphones } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1] as const;

// Destinations with real hotel coverage on the demo environment. Copy is
// intentionally factual (no invented claims) — each card performs a genuine
// search for upcoming dates.
const DESTINATIONS = [
  { name: 'Dubai', country: 'United Arab Emirates', code: 'DXB', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=640&q=70' },
  { name: 'Istanbul', country: 'Türkiye', code: 'IST', image: 'https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&w=640&q=70' },
  { name: 'London', country: 'United Kingdom', code: 'LON', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=640&q=70' },
  { name: 'Baku', country: 'Azerbaijan', code: 'GYD', image: 'https://images.unsplash.com/photo-1591608971362-f08b2a75731a?auto=format&fit=crop&w=640&q=70' },
  { name: 'Bangkok', country: 'Thailand', code: 'BKK', image: 'https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=640&q=70' },
  { name: 'Kuala Lumpur', country: 'Malaysia', code: 'KUL', image: 'https://images.unsplash.com/photo-1596422846543-75c6fc197f07?auto=format&fit=crop&w=640&q=70' },
];

function dateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function HotelSearchEmptyState({ onSearch }: { onSearch: (destinationName: string) => void }) {
  const t = useTranslations('Hotels');
  const checkIn = dateFromToday(7);
  const checkOut = dateFromToday(10);

  return (
    <section className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-2 sm:px-6 lg:px-8" aria-label={t('popularDestinationsTitle')}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="text-center"
      >
        <h2 className="text-xl font-bold tracking-tight text-charcoal">{t('popularDestinationsTitle')}</h2>
        <p className="mt-1.5 text-sm text-[#545454]">
          {t('popularDestinationsSubtitle')}
        </p>
      </motion.div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {DESTINATIONS.map((d, i) => (
          <motion.button
            key={d.code}
            type="button"
            onClick={() => onSearch(d.name)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.06 + i * 0.05 }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            className="group relative block aspect-[3/4] overflow-hidden rounded-2xl ring-1 ring-black/[0.06] transition-shadow duration-300 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-teal-500"
            aria-label={t('searchHotelsInAria', { name: d.name })}
          >
            <Image
              src={d.image}
              alt=""
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 17vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
            />
            {/* Legibility gradient — brand hue, kept subtle */}
            <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" aria-hidden="true" />
            <span className="absolute inset-x-0 bottom-0 p-3 text-left">
              <span className="block text-sm font-semibold leading-tight text-white">{d.name}</span>
              <span className="mt-0.5 block text-[11px] leading-tight text-white/70">{d.country}</span>
            </span>
            {/* Arrow affordance on hover/focus */}
            <span
              className="absolute right-3 top-3 flex h-7 w-7 translate-y-1 items-center justify-center rounded-full bg-white/95 opacity-0 shadow-sm transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 text-charcoal">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </motion.button>
        ))}
      </div>

      {/* Trust strip — quiet, factual, no invented numbers */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 rounded-2xl bg-zinc-50 px-6 py-4 ring-1 ring-black/[0.04]"
      >
        {[
          { icon: ShieldCheck, label: t('trustSecure') },
          { icon: BadgePercent, label: t('trustRates') },
          { icon: Headphones, label: t('trustSupport') },
        ].map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-2 text-[13px] font-medium text-[#545454]">
            <Icon className="h-4 w-4 text-brand-teal-500" aria-hidden="true" />
            {label}
          </span>
        ))}
      </motion.div>
    </section>
  );
}
