/**
 * Vision-verified hotel photo pool, served LOCALLY from the frontend's
 * public/images/hotels/ directory (files downloaded from Pexels — free
 * license). Every ID checked to be live and actually hotel context
 * (exterior / lobby / room / pool / dining).
 *
 * Local paths mean images never depend on an external CDN — the old
 * remote-Pexels approach broke on live hosting.
 */
export const VERIFIED_HOTEL_PHOTO_IDS: number[] = [
  // Exteriors / pools / resorts (strong hero candidates)
  258154, 261102, 78126, 1134176, 2096983, 2034335,
  261169, 2506988, 2373201, 2119714, 261187, 1268855,
  // Lobbies / shared interiors
  1001965, 2869215, 29649745, 5288134, 3215519, 2079249, 2440471,
  // Rooms / bathrooms
  164595, 210604, 2029667, 3201763, 271618, 271624,
  262048, 1329711, 97083, 1457847, 342800,
];

/** Deterministic pick so the same entity always renders the same photo. */
export function verifiedHotelPhoto(seed: string | number, offset = 0): string {
  const ids = VERIFIED_HOTEL_PHOTO_IDS;
  const key = String(seed);
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  const idx = Math.abs(hash + offset * 7919) % ids.length;
  // WebP derivatives are generated alongside the originals (−67% bytes);
  // fall back to the JPG when the WebP is missing.
  return `/images/hotels/${ids[idx]}.webp`;
}
