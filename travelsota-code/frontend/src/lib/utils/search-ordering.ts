/**
 * Ordering & merge primitives for progressive search results.
 *
 * Problem this solves (see SEARCH_PERFORMANCE_PLAN.md, C1):
 * The result list used to re-sort by price on every state change, so every
 * SSE chunk or enrichment patch re-shuffled all visible cards and late,
 * cheap suppliers jumped to the top mid-stream ("order scrambling").
 *
 * Contract:
 * - While a search is streaming, results render in ARRIVAL ORDER (append-only).
 * - The first-painted price for an offer is immutable: enrichment patches and
 *   the final `/result` merge may only fill content fields, never move price.
 * - On completion (or an explicit user sort), the list sorts once inside a
 *   `startTransition` so the in-flight UI stays interactive.
 * - Merges are upsert-only, keyed by a stable offer key.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Stable keys
// ─────────────────────────────────────────────────────────────────────────────

/** Stable key for a hotel card: provider-scoped groupId. */
export function hotelCardKey(hotelGroupId: string): string {
  return `hotel:${hotelGroupId}`;
}

/** Stable key for a flight offer. */
export function flightOfferKey(offerId: string, productId?: string): string {
  return productId ? `flight:${offerId}:${productId}` : `flight:${offerId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Upsert-only merge
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert-merge `incoming` into `previous`, keyed by `keyOf`.
 *
 * - New offers are APPENDED in arrival order (never re-ordered).
 * - Existing offers are replaced in place at their current index.
 *
 * This keeps card positions stable while suppliers stream in.
 */
export function upsertMerge<T>(previous: readonly T[], incoming: readonly T[], keyOf: (item: T) => string): T[] {
  if (incoming.length === 0) return [...previous];
  const indexByKey = new Map<string, number>();
  for (let i = 0; i < previous.length; i++) indexByKey.set(keyOf(previous[i]), i);

  const next = [...previous];
  for (const item of incoming) {
    const key = keyOf(item);
    const existingIdx = indexByKey.get(key);
    if (existingIdx != null) {
      next[existingIdx] = item;
    } else {
      indexByKey.set(key, next.length);
      next.push(item);
    }
  }
  return next;
}

/**
 * Upsert-merge that only fills fields the previous item is missing.
 * Existing field values (notably `minPrice`) win — the first-painted price
 * must not move when enrichment or the final `/result` blob arrives.
 *
 * Pass `alwaysOverwrite` for keys whose honest updates must always apply
 * (e.g. `pricing` currency snapshot), while keeping `minPrice` locked.
 */
export function upsertMergeLocked<T extends object>(
  previous: readonly T[],
  incoming: readonly T[],
  keyOf: (item: T) => string,
  alwaysOverwrite: ReadonlyArray<keyof T & string> = [],
): T[] {
  if (incoming.length === 0) return [...previous];
  const indexByKey = new Map<string, number>();
  for (let i = 0; i < previous.length; i++) indexByKey.set(keyOf(previous[i]), i);

  const overwriteSet = new Set(alwaysOverwrite);
  const next = [...previous];
  for (const item of incoming) {
    const key = keyOf(item);
    const existingIdx = indexByKey.get(key);
    if (existingIdx == null) {
      indexByKey.set(key, next.length);
      next.push(item);
      continue;
    }
    const existing = next[existingIdx];
    // Missing-field fill: only take keys the existing item doesn't have yet.
    const filled: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
    for (const [k, v] of Object.entries(item)) {
      if (overwriteSet.has(k as keyof T & string)) {
        filled[k] = v;
      } else if (filled[k] == null && v != null) {
        filled[k] = v;
      }
    }
    next[existingIdx] = filled as T;
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// One-shot sort (completion or explicit user action)
// ─────────────────────────────────────────────────────────────────────────────

export type SearchSortKey = 'price_asc' | 'price_desc' | 'rating' | 'name' | 'arrival';

/**
 * Sort once, explicitly — never implicitly on every state change.
 * `arrival` (or unknown) returns the input order unchanged.
 * Ties keep arrival order (stable sort).
 */
export function sortOnce<T>(items: readonly T[], sort: SearchSortKey, priceOf: (item: T) => number, ratingOf: (item: T) => number, nameOf: (item: T) => string): T[] {
  if (sort === 'arrival') return [...items];
  const sorted = [...items];
  switch (sort) {
    case 'price_asc':
      sorted.sort((a, b) => priceOf(a) - priceOf(b));
      break;
    case 'price_desc':
      sorted.sort((a, b) => priceOf(b) - priceOf(a));
      break;
    case 'rating':
      sorted.sort((a, b) => ratingOf(b) - ratingOf(a));
      break;
    case 'name':
      sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
      break;
    default:
      break;
  }
  return sorted;
}
