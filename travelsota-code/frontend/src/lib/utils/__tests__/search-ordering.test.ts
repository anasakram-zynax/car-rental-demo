import { describe, it, expect } from 'vitest';

import {
  upsertMerge,
  upsertMergeLocked,
  sortOnce,
  hotelCardKey,
  flightOfferKey,
} from '../search-ordering';

interface Hotel {
  hotelGroupId: string;
  displayName: string;
  minPrice?: { amount: number; currency: string };
  starRating?: number;
  images?: string[];
}

const h = (id: string, amount: number, extra: Partial<Hotel> = {}): Hotel => ({
  hotelGroupId: id,
  displayName: `Hotel ${id}`,
  minPrice: { amount, currency: 'USD' },
  ...extra,
});

describe('upsertMerge', () => {
  it('appends new items in arrival order', () => {
    const prev = [h('A', 100), h('B', 200)];
    const incoming = [h('C', 50), h('D', 300)];
    const next = upsertMerge(prev, incoming, (x) => x.hotelGroupId);
    expect(next.map((x) => x.hotelGroupId)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('replaces existing items in place without moving them', () => {
    const prev = [h('A', 100), h('B', 200), h('C', 300)];
    const incoming = [h('C', 999), h('A', 888)];
    const next = upsertMerge(prev, incoming, (x) => x.hotelGroupId);
    // Positions unchanged, values updated
    expect(next.map((x) => x.hotelGroupId)).toEqual(['A', 'B', 'C']);
    expect(next[0].minPrice?.amount).toBe(888);
    expect(next[2].minPrice?.amount).toBe(999);
  });

  it('never re-orders when a later supplier is cheaper', () => {
    // The core WS1 regression: supplier 2 returns a cheaper hotel later.
    const prev = [h('expensive', 500)];
    const incoming = [h('cheap-late', 50)];
    const next = upsertMerge(prev, incoming, (x) => x.hotelGroupId);
    expect(next[0].hotelGroupId).toBe('expensive');
    expect(next[1].hotelGroupId).toBe('cheap-late');
  });

  it('returns a copy even when incoming is empty', () => {
    const prev = [h('A', 100)];
    const next = upsertMerge(prev, [], (x) => x.hotelGroupId);
    expect(next).toEqual(prev);
    expect(next).not.toBe(prev);
  });
});

describe('upsertMergeLocked', () => {
  it('fills missing fields but never overwrites an existing price', () => {
    const prev = [h('A', 100, { images: undefined })];
    const enriched = [h('A', 77, { images: ['img1.jpg', 'img2.jpg'] })];
    const next = upsertMergeLocked(prev, enriched, (x) => x.hotelGroupId);
    // WS1.4: first-painted price is immutable
    expect(next[0].minPrice?.amount).toBe(100);
    // Missing content is filled
    expect(next[0].images).toEqual(['img1.jpg', 'img2.jpg']);
  });

  it('appends brand-new items untouched', () => {
    const prev: Hotel[] = [];
    const incoming = [h('A', 77)];
    const next = upsertMergeLocked(prev, incoming, (x) => x.hotelGroupId);
    expect(next[0].minPrice?.amount).toBe(77);
  });

  it('overwrites identity keys listed in alwaysOverwrite', () => {
    interface Offer {
      key: string;
      provider?: string;
      price?: number;
    }
    const prev: Offer[] = [{ key: 'x', provider: 'old', price: 100 }];
    const incoming: Offer[] = [{ key: 'x', provider: 'new', price: 55 }];
    const next = upsertMergeLocked(
      prev,
      incoming,
      (o) => o.key,
      ['provider'],
    );
    expect(next[0].provider).toBe('new'); // alwaysOverwrite
    expect(next[0].price).toBe(100); // price locked
  });

  it('keeps array length and positions stable on repeated merges', () => {
    let list: Hotel[] = [h('A', 100)];
    list = upsertMergeLocked(list, [h('B', 200)], (x) => x.hotelGroupId);
    list = upsertMergeLocked(list, [h('A', 100, { starRating: 5 }), h('B', 200, { starRating: 4 })], (x) => x.hotelGroupId);
    list = upsertMergeLocked(list, [h('C', 300)], (x) => x.hotelGroupId);
    expect(list.map((x) => x.hotelGroupId)).toEqual(['A', 'B', 'C']);
    expect(list[0].starRating).toBe(5);
  });
});

describe('sortOnce', () => {
  const priceOf = (x: Hotel) => x.minPrice?.amount ?? Infinity;
  const ratingOf = (x: Hotel) => x.starRating ?? 0;
  const nameOf = (x: Hotel) => x.displayName.toLowerCase();

  it('sorts by price ascending', () => {
    const items = [h('B', 200), h('A', 100), h('C', 300)];
    expect(sortOnce(items, 'price_asc', priceOf, ratingOf, nameOf).map((x) => x.hotelGroupId)).toEqual(['A', 'B', 'C']);
  });

  it('sorts by price descending', () => {
    const items = [h('B', 200), h('A', 100), h('C', 300)];
    expect(sortOnce(items, 'price_desc', priceOf, ratingOf, nameOf).map((x) => x.hotelGroupId)).toEqual(['C', 'B', 'A']);
  });

  it('sorts by rating descending', () => {
    const items = [h('A', 100, { starRating: 3 }), h('B', 200, { starRating: 5 }), h('C', 300, { starRating: 4 })];
    expect(sortOnce(items, 'rating', priceOf, ratingOf, nameOf).map((x) => x.hotelGroupId)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by name', () => {
    const items = [h('C', 300), h('A', 100), h('B', 200)];
    expect(sortOnce(items, 'name', priceOf, ratingOf, nameOf).map((x) => x.hotelGroupId)).toEqual(['A', 'B', 'C']);
  });

  it('arrival returns input order unchanged', () => {
    const items = [h('C', 300), h('A', 100)];
    expect(sortOnce(items, 'arrival', priceOf, ratingOf, nameOf)).toEqual(items);
  });

  it('does not mutate the input array', () => {
    const items = [h('B', 200), h('A', 100)];
    const copy = [...items];
    sortOnce(items, 'price_asc', priceOf, ratingOf, nameOf);
    expect(items).toEqual(copy);
  });
});

describe('stable keys', () => {
  it('builds scoped hotel keys', () => {
    expect(hotelCardKey('abc')).toBe('hotel:abc');
  });

  it('builds offer keys with and without productId', () => {
    expect(flightOfferKey('o1')).toBe('flight:o1');
    expect(flightOfferKey('o1', 'p1')).toBe('flight:o1:p1');
  });
});
