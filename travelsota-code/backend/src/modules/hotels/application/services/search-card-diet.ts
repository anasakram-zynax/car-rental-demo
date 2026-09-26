import type { CombinedHotelCard } from '../../domain/types/hotel-provider.types';

/**
 * WS3 (SEARCH_PERFORMANCE_PLAN.md): search-card payload diet.
 *
 * Measured on demo: 33% of the 423KB /result JSON was image URL arrays
 * (avg 7.1 images/hotel) and serialization alone took ~6s server-side.
 * Search cards need at most a hero image (carousel uses 1–2), so we cap
 * images and strip fields the search card never renders.
 *
 * IMPORTANT: this is for SEARCH results only. Hotel details pages build
 * their own payloads and keep full image lists.
 */

/** Max images per hotel in search payloads (hero + 1 carousel slide). */
export const SEARCH_CARD_IMAGE_CAP = 2;

/** Fields a search card never reads — dropped to cut serialization time. */
const STRIP_KEYS = ['description', 'rooms', 'ratePlans', 'allRates', 'rawRates'] as const;

export type SearchCardDietOptions = {
  imageCap?: number;
  stripHeavyFields?: boolean;
};

export function applySearchCardDiet<T extends CombinedHotelCard>(
  card: T,
  options: SearchCardDietOptions = {},
): T {
  const imageCap = options.imageCap ?? SEARCH_CARD_IMAGE_CAP;
  const strip = options.stripHeavyFields ?? true;

  const dieted: Record<string, unknown> = { ...(card as unknown as Record<string, unknown>) };

  if (Array.isArray(dieted.images) && dieted.images.length > imageCap) {
    dieted.images = (dieted.images as string[]).slice(0, imageCap);
  }

  if (strip) {
    for (const key of STRIP_KEYS) {
      if (key in dieted) delete dieted[key];
    }
  }

  return dieted as T;
}

export function applySearchCardDietToList<T extends CombinedHotelCard>(
  cards: T[],
  options: SearchCardDietOptions = {},
): T[] {
  return cards.map((card) => applySearchCardDiet(card, options));
}
