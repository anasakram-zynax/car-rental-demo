import { describe, it, expect } from 'vitest';
import {
  decodeSeat,
  decodeBaggage,
  decodeMeal,
  encodeSeat,
  encodeMeal,
  parsePriceText,
  sumAncillaryPrices,
  formatCurrency,
} from '../ancillary-utils';

describe('decodeSeat', () => {
  const validSeatPayload = { seat: '12A', flightLabel: 'EK001', brand: 'Economy', priceText: '25.00 USD' };

  it('decodes a valid seat ID', () => {
    const encoded = 'seat:' + encodeURIComponent(JSON.stringify(validSeatPayload));
    expect(decodeSeat(encoded)).toEqual(validSeatPayload);
  });

  it('returns undefined for non-seat prefix', () => {
    expect(decodeSeat('baggage:{}')).toBeUndefined();
    expect(decodeSeat('random-string')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(decodeSeat('seat:{bad-json}')).toBeUndefined();
  });

  it('returns undefined for empty seat payload', () => {
    expect(decodeSeat('seat:')).toBeUndefined();
  });

  it('decodes a seat with ancillaryProductId', () => {
    const seatWithProductId = { seat: '14C', flightLabel: 'BA178', brand: 'Economy', priceText: '30.00 USD', ancillaryProductId: 'p0' };
    const encoded = encodeSeat(seatWithProductId);
    const decoded = decodeSeat(encoded);
    expect(decoded).toEqual(seatWithProductId);
    expect(decoded?.ancillaryProductId).toBe('p0');
  });

  it('round-trips through encodeSeat and decodeSeat', () => {
    const original = { seat: '1A', flightLabel: 'EK001', brand: 'First', priceText: '150.00 USD', ancillaryProductId: 'p5' };
    const encoded = encodeSeat(original);
    expect(encoded).toContain('seat:');
    expect(decodeSeat(encoded)).toEqual(original);
  });
});

describe('decodeBaggage', () => {
  const validBaggagePayload = { productId: 'BG-1', label: 'Extra Baggage 23kg', priceText: '50.00 USD' };

  it('decodes a valid baggage ID', () => {
    const encoded = 'baggage:' + encodeURIComponent(JSON.stringify(validBaggagePayload));
    expect(decodeBaggage(encoded)).toEqual(validBaggagePayload);
  });

  it('returns undefined for non-baggage prefix', () => {
    expect(decodeBaggage('seat:{}')).toBeUndefined();
    expect(decodeBaggage('random-string')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(decodeBaggage('baggage:{bad}')).toBeUndefined();
  });

  it('handles baggage without priceText', () => {
    const noPrice = { productId: 'BG-2', label: 'Free Baggage' };
    const encoded = 'baggage:' + encodeURIComponent(JSON.stringify(noPrice));
    expect(decodeBaggage(encoded)).toEqual(noPrice);
  });
});

describe('parsePriceText', () => {
  it('parses amount and currency', () => {
    expect(parsePriceText('25.00 USD')).toEqual({ amount: 25, currency: 'USD' });
    expect(parsePriceText('350.50 EUR')).toEqual({ amount: 350.5, currency: 'EUR' });
  });

  it('returns zero for unparseable text', () => {
    expect(parsePriceText('free')).toEqual({ amount: 0, currency: '' });
    expect(parsePriceText('')).toEqual({ amount: 0, currency: '' });
  });

  it('handles amounts with more decimals', () => {
    expect(parsePriceText('123.4567 GBP')).toEqual({ amount: 123.4567, currency: 'GBP' });
  });
});

describe('sumAncillaryPrices', () => {
  it('sums prices from decoded IDs', () => {
    const ids = [
      'seat:' + encodeURIComponent(JSON.stringify({ seat: '12A', flightLabel: 'EK001', brand: 'Econ', priceText: '25.00 USD' })),
      'seat:' + encodeURIComponent(JSON.stringify({ seat: '12B', flightLabel: 'EK001', brand: 'Econ', priceText: '30.00 USD' })),
    ];
    expect(sumAncillaryPrices(ids, decodeSeat)).toBe(55);
  });

  it('skips IDs that fail to decode', () => {
    const ids = ['invalid', 'seat:' + encodeURIComponent(JSON.stringify({ seat: '12A', flightLabel: 'EK001', brand: 'Econ', priceText: '25.00 USD' }))];
    expect(sumAncillaryPrices(ids, decodeSeat)).toBe(25);
  });

  it('returns 0 for empty array', () => {
    expect(sumAncillaryPrices([], decodeSeat)).toBe(0);
  });

  it('skips IDs with no priceText', () => {
    const ids = ['baggage:' + encodeURIComponent(JSON.stringify({ productId: 'BG-1', label: 'Free' }))];
    expect(sumAncillaryPrices(ids, decodeBaggage)).toBe(0);
  });

  it('sums baggage prices', () => {
    const ids = [
      'baggage:' + encodeURIComponent(JSON.stringify({ productId: 'BG-1', label: 'Extra 23kg', priceText: '50.00 USD' })),
      'baggage:' + encodeURIComponent(JSON.stringify({ productId: 'BG-2', label: 'Extra 32kg', priceText: '80.00 USD' })),
    ];
    expect(sumAncillaryPrices(ids, decodeBaggage)).toBe(130);
  });
});

describe('decodeMeal', () => {
  const validMealPayload = { productId: 'p0', mealName: 'Chicken Rice', mealCode: 'MLCL', dietaryType: 'Regular', priceText: '15.00 USD' };

  it('decodes a valid meal ID', () => {
    const encoded = 'meal:' + encodeURIComponent(JSON.stringify(validMealPayload));
    expect(decodeMeal(encoded)).toEqual(validMealPayload);
  });

  it('returns undefined for non-meal prefix', () => {
    expect(decodeMeal('seat:{}')).toBeUndefined();
    expect(decodeMeal('random-string')).toBeUndefined();
  });

  it('returns undefined for malformed JSON', () => {
    expect(decodeMeal('meal:{bad-json}')).toBeUndefined();
  });

  it('returns undefined for empty meal payload', () => {
    expect(decodeMeal('meal:')).toBeUndefined();
  });

  it('handles meal without priceText', () => {
    const noPrice = { productId: 'p1', mealName: 'Complimentary Snack', mealCode: 'MLSN', dietaryType: 'Vegetarian' };
    const encoded = 'meal:' + encodeURIComponent(JSON.stringify(noPrice));
    expect(decodeMeal(encoded)).toEqual(noPrice);
  });

  it('round-trips through encodeMeal and decodeMeal', () => {
    const original = { productId: 'p2', mealName: 'Halal Meal', mealCode: 'MLHL', dietaryType: 'Halal', priceText: '20.00 USD' };
    const encoded = encodeMeal(original);
    expect(encoded).toContain('meal:');
    expect(decodeMeal(encoded)).toEqual(original);
  });

  it('sums meal prices using sumAncillaryPrices', () => {
    const ids = [
      'meal:' + encodeURIComponent(JSON.stringify({ productId: 'p0', mealName: 'Chicken', mealCode: 'MLCL', dietaryType: 'Regular', priceText: '15.00 USD' })),
      'meal:' + encodeURIComponent(JSON.stringify({ productId: 'p1', mealName: 'Vegetable', mealCode: 'MLVG', dietaryType: 'Vegan', priceText: '12.00 USD' })),
    ];
    expect(sumAncillaryPrices(ids, decodeMeal)).toBe(27);
  });

  it('skips meals without priceText in sum', () => {
    const ids = [
      'meal:' + encodeURIComponent(JSON.stringify({ productId: 'p0', mealName: 'Free Snack', mealCode: 'MLSN', dietaryType: 'Regular' })),
      'meal:' + encodeURIComponent(JSON.stringify({ productId: 'p1', mealName: 'Chicken', mealCode: 'MLCL', dietaryType: 'Regular', priceText: '15.00 USD' })),
    ];
    expect(sumAncillaryPrices(ids, decodeMeal)).toBe(15);
  });
});

describe('formatCurrency', () => {
  it('formats amount with currency', () => {
    expect(formatCurrency(25, 'USD')).toBe('25.00 USD');
    expect(formatCurrency(350.5, 'EUR')).toBe('350.50 EUR');
  });
});
