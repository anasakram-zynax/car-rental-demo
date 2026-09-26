import { verifiedHotelPhoto } from "./pexels-fallback-ids";

/**
 * Shared onError handler for any <img> or next/image that may fail.
 * Swaps the broken URL to a vision-verified Pexels hotel photo (never an
 * SVG/icon/placeholder). Keeps cycling the pool on repeated failures so a
 * transient network error still resolves to a real photo.
 */
export function handleHotelImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const prev = Number(img.dataset.fallbackAttempt ?? "-1");
  const next = prev + 1;
  img.dataset.fallbackAttempt = String(next);
  const seed = img.alt || img.src;
  img.src = verifiedHotelPhoto(seed, next);
}
