'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import { upgradeHotelbedsImage } from '@/lib/utils/hotel-image-url';
import { handleHotelImageError } from '@/lib/utils/hotel-image-fallback';

interface HotelImageCarouselProps {
  images: string[];
  alt: string;
  aspectRatio?: string;
  className?: string;
  fillHeight?: boolean;
}

const ease = [0.16, 1, 0.3, 1] as const;

export function HotelImageCarousel({
  images,
  alt,
  aspectRatio = 'aspect-[16/10]',
  className = '',
  fillHeight = false,
}: HotelImageCarouselProps) {
  const tHotels = useTranslations('Hotels');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();

  const effectiveImages = images.filter(Boolean).map(upgradeHotelbedsImage);
  const hasMultiple = effectiveImages.length > 1;

  const scrollTo = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(index, effectiveImages.length - 1));
    el.scrollTo({ left: target * el.clientWidth, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [effectiveImages.length, reducedMotion]);

  const goNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    scrollTo(currentIndex + 1);
  }, [currentIndex, scrollTo]);

  const goPrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    scrollTo(currentIndex - 1);
  }, [currentIndex, scrollTo]);

  // Sync dot indicator with scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !hasMultiple) return;
    const handleScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      if (idx !== currentIndex) setCurrentIndex(idx);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [currentIndex, hasMultiple]);

  // Single image or empty
  if (!hasMultiple) {
    return (
      <div className={`w-full overflow-hidden ${fillHeight ? 'absolute inset-0' : `relative ${aspectRatio}`} ${className}`}>
        {effectiveImages.length > 0 ? (
          <>
            {/* Loading skeleton */}
            {!loadedImages.has(0) && (
              <div className="absolute inset-0 bg-zinc-200 animate-pulse" />
            )}
            <Image
              src={effectiveImages[0]}
              alt={alt}
              fill
              sizes="(max-width: 640px) 100vw, 288px"
              className={`object-cover transition-opacity duration-300 ${loadedImages.has(0) ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoadedImages((prev) => new Set(prev).add(0))}
              onError={handleHotelImageError}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-zinc-200 flex items-center justify-center">
            <svg className="h-10 w-10 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden ${fillHeight ? 'absolute inset-0' : `relative ${aspectRatio}`} group/carousel ${className}`}
    >
      {/* Scroll container — each slide is exactly the container width */}
      <div
        ref={scrollRef}
        className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {effectiveImages.map((src, i) => (
          <div key={i} className="relative h-full w-full shrink-0 snap-center">
            {/* Loading skeleton per image */}
            {!loadedImages.has(i) && (
              <div className="absolute inset-0 bg-zinc-200 animate-pulse" />
            )}
            <Image
              src={src}
              alt={`${alt} — image ${i + 1}`}
              fill
              sizes="(max-width: 640px) 100vw, 288px"
              className={`object-cover pointer-events-none select-none transition-opacity duration-300 ${loadedImages.has(i) ? 'opacity-100' : 'opacity-0'}`}
              loading={i <= 2 ? 'eager' : 'lazy'}
              draggable={false}
              onLoad={() => setLoadedImages((prev) => new Set(prev).add(i))}
              onError={handleHotelImageError}
            />
          </div>
        ))}
      </div>

      {/* Counter badge — only meaningful on large sets; dots cover small ones */}
      <div className={'absolute top-3 right-3 z-20 inline-flex items-center gap-1 rounded-lg bg-black/50 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm ' + (effectiveImages.length > 4 ? '' : 'hidden')}>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        </svg>
        {currentIndex + 1}/{effectiveImages.length}
      </div>

      {/* Left Arrow — z-30 sits above gradient (z-0) */}
      <motion.button
        onClick={goPrev}
        initial={false}
        animate={{ opacity: currentIndex > 0 ? 1 : 0, scale: currentIndex > 0 ? 1 : 0.8 }}
        transition={{ duration: 0.15, ease }}
        disabled={currentIndex <= 0}
        className="absolute left-2.5 top-1/2 z-30 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-lg backdrop-blur-sm hover:bg-white hover:text-zinc-900 active:scale-95 transition-all duration-150 disabled:pointer-events-none"
        aria-label={tHotels('galleryPrevImage')}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </motion.button>

      {/* Right Arrow — z-30 */}
      <motion.button
        onClick={goNext}
        initial={false}
        animate={{ opacity: currentIndex < effectiveImages.length - 1 ? 1 : 0, scale: currentIndex < effectiveImages.length - 1 ? 1 : 0.8 }}
        transition={{ duration: 0.15, ease }}
        disabled={currentIndex >= effectiveImages.length - 1}
        className="absolute right-2.5 top-1/2 z-30 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-zinc-700 shadow-lg backdrop-blur-sm hover:bg-white hover:text-zinc-900 active:scale-95 transition-all duration-150 disabled:pointer-events-none"
        aria-label={tHotels('galleryNextImage')}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </motion.button>

      {/* Image count indicator — dots for small sets, a slim progress bar
          for large sets (30-50 images) so nothing overflows the card */}
      {effectiveImages.length <= 12 ? (
        <div className="absolute bottom-2.5 left-1/2 z-20 -translate-x-1/2 flex items-center gap-1.5">
          {effectiveImages.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollTo(i); }}
              className={`rounded-full transition-all duration-200 ${
                i === currentIndex
                  ? 'w-5 h-1.5 bg-white shadow-md'
                  : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'
              }`}
              aria-label={tHotels('galleryGoToImage', { index: i + 1 })}
            />
          ))}
        </div>
      ) : (
        <div className="absolute bottom-2.5 left-1/2 z-20 w-3/5 -translate-x-1/2 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-1 rounded-full bg-white shadow-md transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / effectiveImages.length) * 100}%` }}
          />
        </div>
      )}

      {/* Bottom gradient for dot readability */}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
    </div>
  );
}
