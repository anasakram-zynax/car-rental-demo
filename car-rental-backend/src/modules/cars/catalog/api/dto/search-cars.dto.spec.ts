import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SearchCarsDto } from './search-cars.dto.js';

describe('SearchCarsDto', () => {
  it('accepts and transforms supported query parameters', async () => {
    const dto = plainToInstance(SearchCarsDto, {
      serviceType: 'transfer',
      pickupLocation: 'Airport',
      dropoffLocation: 'DHA',
      minBaggage: '2',
      minPrice: '20',
      maxPrice: '80',
      sort: 'price_asc',
      page: '2',
      limit: '5',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      minBaggage: 2,
      minPrice: 20,
      maxPrice: 80,
      page: 2,
      limit: 5,
    });
  });

  it('rejects invalid enums, negative baggage and non-positive prices', async () => {
    const dto = plainToInstance(SearchCarsDto, {
      serviceType: 'chauffeur',
      minBaggage: '-1',
      minPrice: '0',
      sort: 'popular',
    });
    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['serviceType', 'minBaggage', 'minPrice', 'sort']),
    );
  });
});
