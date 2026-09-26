'use client';
import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api/client';
import { verifiedHotelPhoto } from '@/lib/utils/pexels-fallback-ids';
import { useCurrency } from '@/context/CurrencyContext';

interface FeaturedHotelItem {
  id: string;
  name: string;
  slug: string;
  location: string;
  destinationCode: string | null;
  destinationName: string | null;
  stars: number | null;
  rating: number | null;
  discount: number | null;
  accommodationType: string | null;
  currency: string;
  amenities?: unknown;
  images: { url: string; isDefault?: boolean }[] | null;
  rooms?: Array<{
    id: string;
    name: string;
    basePrice: number;
    currency: string;
    maxAdults: number;
  }>;
}

/** Local webp twin for a dead local jpg (all local jpgs were removed; the
 *  .webp derivatives remain). Avoids a wasted 404 round trip per image. */
function preferWebpTwin(url: string): string {
  const m = url.match(/^(\/images\/hotels\/\d+)\.jpg$/);
  return m ? `${m[1]}.webp` : url;
}

/** Build ordered candidate URLs for one hotel: default photo → rest of gallery → verified pool. */
function imageCandidates(hotel: FeaturedHotelItem): string[] {
  const imgs = hotel.images ?? [];
  const def = imgs.find((i) => i.isDefault);
  const rest = imgs.filter((i) => i !== def);
  const own = def ? [def.url, ...rest.map((i) => i.url)] : rest.map((i) => i.url);
  const seed = hotel.slug || hotel.id || hotel.name;
  const pool = Array.from({ length: 4 }, (_, n) => verifiedHotelPhoto(seed, n));
  const all = [...own.map(preferWebpTwin), ...pool];
  return all.length ? all : [verifiedHotelPhoto(seed)];
}

export function FeaturedHotelsSection() {
  const router = useRouter();
  const { formatPrice } = useCurrency();
  const t = useTranslations('Home');
  const tc = useTranslations('Common');
  const th = useTranslations('Hotels');
  const [activeCity, setActiveCity] = useState('all');

  const { data: hotels = [], isLoading: loading } = useQuery<FeaturedHotelItem[]>({
    queryKey: ['hotels', 'featured'],
    queryFn: async () => {
      try {
        return await apiRequest<FeaturedHotelItem[]>('/hotels/featured', { timeoutMs: 15000 });
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
    hotels.forEach((h) => {
      const city = h.destinationName || h.location;
      if (city) cities.add(city);
    });
    return ['all', ...Array.from(cities)];
  }, [hotels]);

  const filtered = activeCity === 'all'
    ? hotels
    : hotels.filter((h) => (h.destinationName || h.location) === activeCity);

  // Per-card fallback attempt counter — each error advances to the next candidate URL
  const [attempts, setAttempts] = useState<Record<string, number>>({});
  const bumpAttempt = useCallback((id: string) => {
    setAttempts((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  function handleClick(hotel: FeaturedHotelItem) {
    router.push(`/hotels/${hotel.id}`);
  }

  function getPrice(hotel: FeaturedHotelItem): { amount: number; currency: string } | null {
    const room = hotel.rooms?.[0];
    if (!room) return null;
    return { amount: room.basePrice, currency: room.currency };
  }

  if (loading) {
    return (
      <section className="bg-white py-8 sm:py-10 lg:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">{t('featuredHotelsEyebrow')}</span>
            <h2 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-bold tracking-tight text-[#0d1b1e] sm:text-4xl">{t('featuredHotelsTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[16/11] animate-pulse rounded-[22px] bg-gray-100" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (hotels.length === 0) return null;

  return (
    <section className="bg-white py-8 sm:py-10 lg:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-teal">
              {t('featuredHotelsEyebrow')}
            </span>
            <h2 className="mt-2 font-[var(--font-traavellio-display)] text-3xl font-bold tracking-tight text-[#0d1b1e] sm:text-4xl">
              {t('featuredHotelsTitle')}
            </h2>
            <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-gray-400">
              {t('featuredHotelsSubtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-gray-500">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-brand-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 2l7 4v5c0 5.25-3.5 10-7 11-3.5-1-7-5.75-7-11V6l7-4z" /></svg>
              {t('bestPriceGuarantee')}
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-brand-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" d="M9 12l2 2 4-4" /></svg>
              {th('freeCancellation')}
            </span>
          </div>
        </div>

        {allCities.length > 1 && (
          <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {allCities.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => setActiveCity(city)}
                className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-all duration-200 ${
                  activeCity === city
                    ? 'border-brand-teal bg-brand-teal text-white'
                    : 'border-brand-teal/10 bg-white text-slate-600 hover:border-brand-teal/20 hover:bg-brand-teal/5'
                }`}
              >
                {city === 'all' ? tc('all') : city}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((hotel) => {
            const price = getPrice(hotel);
            const candidates = imageCandidates(hotel);
            const attempt = Math.min(attempts[hotel.id] ?? 0, candidates.length - 1);
            const src = candidates[attempt];
            const amenityList = Array.isArray(hotel.amenities) ? (hotel.amenities as string[]) : [];
            return (
              <button
                key={hotel.id}
                type="button"
                onClick={() => handleClick(hotel)}
                className="group flex h-full cursor-pointer flex-col overflow-hidden rounded-[22px] border border-brand-teal/10 bg-white text-left shadow-[0_10px_35px_rgba(3,61,74,0.07)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-teal/18 hover:shadow-[0_22px_55px_rgba(3,61,74,0.14)]"
              >
                <div className="relative aspect-[16/11] shrink-0 overflow-hidden">
                  <Image
                    src={src}
                    alt={hotel.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    loading="lazy"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    onError={() => bumpAttempt(hotel.id)}
                  />
                  <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
                  {hotel.discount ? (
                    <span className="absolute left-3 top-3 rounded-full bg-brand-teal px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
                      {t('saveDiscount', { discount: hotel.discount })}
                    </span>
                  ) : (
                    hotel.accommodationType === 'resort' && (
                      <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#0d1b1e] shadow-sm backdrop-blur-sm">
                        Resort
                      </span>
                    )
                  )}
                  {hotel.rating != null && (
                    <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-[#0d1b1e] shadow-sm backdrop-blur-sm">
                      <svg className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      {hotel.rating.toFixed(1)}
                    </span>
                  )}
                  <div className="absolute inset-x-3 bottom-2.5 flex items-center gap-1.5 text-white">
                    <svg className="h-3.5 w-3.5 shrink-0 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="truncate text-[12px] font-medium drop-shadow-sm">
                      {hotel.destinationName || hotel.location}
                    </span>
                  </div>
                </div>

                <div className="flex min-h-[150px] flex-1 flex-col p-4">
                  {hotel.stars != null && (
                    <div className="flex items-center gap-0.5" aria-label={t('starHotelAria', { count: hotel.stars })}>
                      {Array.from({ length: Math.min(hotel.stars, 5) }).map((_, i) => (
                        <svg key={i} className="h-3 w-3 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      ))}
                    </div>
                  )}
                  <h3 className={`font-[var(--font-traavellio-display)] text-[15px] font-bold leading-snug text-[#0d1b1e] line-clamp-2 ${hotel.stars != null ? 'mt-1' : ''}`}>
                    {hotel.name}
                  </h3>

                  {amenityList.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {amenityList.slice(0, 2).map((a) => (
                        <span key={a} className="rounded-full bg-brand-teal/[0.07] px-2 py-0.5 text-[10px] font-medium text-brand-teal">
                          {a}
                        </span>
                      ))}
                      {amenityList.length > 2 && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
                          +{amenityList.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {price && (
                    <div className="mt-auto flex items-end justify-between border-t border-gray-100 pt-3">
                      <div className="flex items-baseline gap-1">
                        <span className="text-[11px] font-medium text-gray-400">{tc('from')}</span>
                        <span className="text-lg font-bold text-[#0d1b1e]">
                          {formatPrice(price.amount, price.currency)}
                        </span>
                        <span className="text-[11px] text-gray-400">{t('perNight')}</span>
                      </div>
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal transition-colors group-hover:bg-brand-teal group-hover:text-white">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
