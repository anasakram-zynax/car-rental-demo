"use client";
import { useTranslations } from 'next-intl';


import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import Image from "next/image";
import { upgradeHotelbedsImage } from "@/lib/utils/hotel-image-url";
import { handleHotelImageError } from "@/lib/utils/hotel-image-fallback";
import type { DetailImage } from "@/features/hotels/api/get-hotel-details";

interface HotelGalleryProps {
  images: DetailImage[];
  hotelName: string;
}

const ease = [0.16, 1, 0.3, 1] as const;

const slideVariants = {
  enter: (d: number) => ({ opacity: 0, x: d * 60, scale: 0.98 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (d: number) => ({ opacity: 0, x: d * -60, scale: 0.98 }),
};

export function HotelGallery({ images, hotelName }: HotelGalleryProps) {
  const t = useTranslations('Hotels');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);

  const upgradedImages = images.map((img) => ({
    ...img,
    url: upgradeHotelbedsImage(img.url),
    thumbnailUrl: upgradeHotelbedsImage(img.thumbnailUrl),
  }));
  const displayImages = upgradedImages.slice(0, 3);
  const remaining = upgradedImages.length - 3;

  const openViewer = useCallback((idx: number) => {
    setViewerIdx(idx);
    setViewerOpen(true);
  }, []);

  if (images.length === 0) return null;

  const hoverOverlay =
    "after:absolute after:inset-0 after:bg-black/0 after:transition-colors after:duration-500 group-hover:after:bg-black/15";

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-6 sm:pt-6">
      {/* Desktop: 1 large + 2 small stacked */}
      <div className="relative hidden overflow-hidden rounded-[24px] md:block">
        <div className="grid h-[420px] grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => openViewer(0)}
            className={`group relative col-span-2 overflow-hidden ${hoverOverlay}`}
            aria-label="Open photo 1"
          >
            <Image
              src={displayImages[0]?.url}
              alt={displayImages[0]?.caption || hotelName}
              fill
              sizes="(max-width: 768px) 100vw, 66vw"
              className="object-cover transition duration-700 group-hover:scale-105"
              priority
              onError={handleHotelImageError}
            />
          </button>

          <div className="col-span-1 grid grid-rows-2 gap-2">
            {displayImages[1] && (
              <button
                type="button"
                onClick={() => openViewer(1)}
                className={`group relative overflow-hidden ${hoverOverlay}`}
                aria-label="Open photo 2"
              >
                <Image
                  src={displayImages[1].url}
                  alt={displayImages[1]?.caption || `${hotelName} photo 2`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                  onError={handleHotelImageError}
                />
              </button>
            )}
            {displayImages[2] && (
              <button
                type="button"
                onClick={() => openViewer(2)}
                className={`group relative overflow-hidden ${hoverOverlay}`}
                aria-label="Open photo 3"
              >
                <Image
                  src={displayImages[2].url}
                  alt={displayImages[2]?.caption || `${hotelName} photo 3`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                  onError={handleHotelImageError}
                />
                {remaining > 0 && (
                  <span className="absolute inset-0 z-[1] flex items-center justify-center bg-black/45 text-lg font-bold text-white backdrop-blur-[1px] transition group-hover:bg-black/55">
                    +{remaining}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Show-all pill */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={() => openViewer(0)}
            className="absolute bottom-4 right-4 z-[2] inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs font-bold text-charcoal shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
            Show all {images.length} photos
          </button>
        )}
      </div>

      {/* Mobile: 1 large + 2 small in a row */}
      <div className="overflow-hidden rounded-[20px] md:hidden">
        <button
          type="button"
          onClick={() => openViewer(0)}
          className="group relative block h-60 w-full overflow-hidden"
          aria-label="Open photo 1"
        >
          <Image
            src={displayImages[0]?.url}
            alt={displayImages[0]?.caption || hotelName}
            fill
            sizes="100vw"
            className="object-cover"
            onError={handleHotelImageError}
            priority
          />
          {images.length > 1 && (
            <span className="absolute bottom-3 right-3 z-[1] inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
              </svg>
              {images.length}
            </span>
          )}
        </button>
        {displayImages[1] && (
          <div className="mt-2 flex h-28 gap-2">
            <button type="button" onClick={() => openViewer(1)} className="relative flex-1 overflow-hidden rounded-xl" aria-label="Open photo 2">
              <Image src={displayImages[1].url} alt={displayImages[1]?.caption || `${hotelName} photo 2`} fill sizes="50vw" className="object-cover" onError={handleHotelImageError} />
            </button>
            {displayImages[2] && (
              <button type="button" onClick={() => openViewer(2)} className="relative flex-1 overflow-hidden rounded-xl" aria-label="Open photo 3">
                <Image src={displayImages[2].url} alt={displayImages[2]?.caption || `${hotelName} photo 3`} fill sizes="50vw" className="object-cover" onError={handleHotelImageError} />
                {remaining > 0 && (
                  <span className="absolute inset-0 z-[1] flex items-center justify-center bg-black/45 text-sm font-bold text-white">+{remaining}</span>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <Lightbox
        images={upgradedImages}
        idx={viewerIdx}
        onIndex={setViewerIdx}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        hotelName={hotelName}
      />
    </div>
  );
}

interface LightboxProps {
  images: DetailImage[];
  idx: number;
  onIndex: (i: number) => void;
  open: boolean;
  onClose: () => void;
  hotelName: string;
}

function Lightbox({ images, idx, onIndex, open, onClose, hotelName }: LightboxProps) {
  const [dir, setDir] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (next: number) => {
      setDir(next > 0 ? 1 : -1);
      onIndex((idx + next + images.length) % images.length);
    },
    [images.length, idx, onIndex],
  );

  // Keyboard navigation + body scroll lock while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, go, onClose]);

  // Preload neighbours for instant next/prev.
  useEffect(() => {
    if (!open || images.length < 2) return;
    [idx + 1, idx - 1].forEach((n) => {
      const src = images[(n + images.length) % images.length]?.url;
      if (src) {
        const img = new window.Image();
        img.src = src;
      }
    });
  }, [idx, open, images]);

  const current = images[idx];
  if (!current) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={containerRef}
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease }}
          className="fixed inset-0 z-[99999] flex flex-col bg-[#05070f]/97 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
        >
          {/* Top bar */}
          <div className="relative z-20 flex items-center justify-between px-4 py-4 sm:px-6" onClick={(e) => e.stopPropagation()}>
            <span className="rounded-full bg-white/8 px-3 py-1.5 text-xs font-medium tabular-nums text-white/70">
              <span className="font-bold text-white">{idx + 1}</span>
              <span className="text-white/40"> / {images.length}</span>
              {current.caption && <span className="ml-3 hidden font-normal text-white/45 sm:inline">{current.caption}</span>}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8 text-white/70 transition-all hover:rotate-90 hover:bg-white/15 hover:text-white"
              aria-label="Close viewer"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Stage */}
          <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 sm:px-16" onClick={(e) => e.stopPropagation()}>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-white/70 backdrop-blur transition-all hover:bg-white/15 hover:text-white sm:flex"
                  aria-label="Previous image"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/8 text-white/70 backdrop-blur transition-all hover:bg-white/15 hover:text-white sm:flex"
                  aria-label="Next image"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.6} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              </>
            )}

            <AnimatePresence mode="popLayout" custom={dir} initial={false}>
              <motion.img
                key={current.url}
                src={current.url}
                alt={current.caption || `${hotelName} photo ${idx + 1}`}
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.32, ease }}
                className="max-h-full max-w-full rounded-xl object-contain shadow-2xl"
                draggable={false}
              />
            </AnimatePresence>
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="no-scrollbar flex justify-start gap-2 overflow-x-auto px-4 py-4 sm:justify-center sm:px-6" onClick={(e) => e.stopPropagation()}>
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setDir(i > idx ? 1 : -1);
                    onIndex(i);
                  }}
                  className={`h-12 w-16 shrink-0 overflow-hidden rounded-lg transition-all duration-300 sm:h-14 sm:w-20 ${
                    i === idx ? "ring-2 ring-white" : "opacity-45 hover:opacity-80"
                  }`}
                  aria-label={`Go to photo ${i + 1}`}
                >
                  <img src={img.thumbnailUrl || img.url} alt="" className="h-full w-full object-cover" loading="lazy" onError={handleHotelImageError} />
                </button>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
