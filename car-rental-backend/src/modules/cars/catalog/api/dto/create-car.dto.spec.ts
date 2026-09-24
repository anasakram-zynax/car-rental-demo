import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ServiceType } from '../../domain/service-type.js';
import { CreateCarDto } from './create-car.dto.js';
import { UpdateCarDto } from './update-car.dto.js';

const validCar = {
  name: 'Transfer Sedan',
  slug: 'transfer-sedan',
  brand: 'Test',
  model: 'Sedan',
  year: 2026,
  carTypeId: '8d783863-38a0-4ca1-adc4-09a8f80b7e0c',
  transmission: 'Automatic',
  fuelType: 'Petrol',
  doors: 4,
  passengers: 4,
  baggage: 2,
  amenities: [],
  city: 'Lahore',
  dailyPrice: 100,
  currency: 'USD',
  isRefundable: true,
  featured: false,
  images: [],
};

describe('CreateCarDto service fields', () => {
  it('keeps new fields optional so existing rental payloads remain valid', async () => {
    const dto = plainToInstance(CreateCarDto, validCar);

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('requires at least one package for a transfer car', async () => {
    const dto = plainToInstance(CreateCarDto, {
      ...validCar,
      serviceType: ServiceType.TRANSFER,
      transferPackages: [],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'serviceType')).toBe(true);
  });

  it('accepts a valid positive-money transfer package', async () => {
    const dto = plainToInstance(CreateCarDto, {
      ...validCar,
      serviceType: ServiceType.TRANSFER,
      withDriver: true,
      availableQuantity: 2,
      transferPackages: [
        {
          fromLocation: 'Lahore Airport',
          toLocation: 'Gulberg',
          price: 45.5,
          currency: 'USD',
        },
      ],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects blank routes, non-positive money and quantity below one', async () => {
    const dto = plainToInstance(CreateCarDto, {
      ...validCar,
      serviceType: ServiceType.TRANSFER,
      availableQuantity: 0,
      transferPackages: [
        {
          fromLocation: '   ',
          toLocation: '',
          price: 0,
          currency: 'USD',
        },
      ],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'availableQuantity')).toBe(
      true,
    );
    expect(errors.some((error) => error.property === 'transferPackages')).toBe(
      true,
    );
  });

  it('requires packages when an update explicitly changes serviceType to transfer', async () => {
    const dto = plainToInstance(UpdateCarDto, {
      serviceType: ServiceType.TRANSFER,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'serviceType')).toBe(true);
  });

  it('accepts 2000 through the current year and rejects years outside that range', async () => {
    const currentYear = new Date().getFullYear();
    const minimum = plainToInstance(CreateCarDto, {
      ...validCar,
      year: 2000,
    });
    const current = plainToInstance(CreateCarDto, {
      ...validCar,
      year: currentYear,
    });
    const tooOld = plainToInstance(CreateCarDto, { ...validCar, year: 1999 });
    const future = plainToInstance(CreateCarDto, {
      ...validCar,
      year: currentYear + 1,
    });

    await expect(validate(minimum)).resolves.toHaveLength(0);
    await expect(validate(current)).resolves.toHaveLength(0);
    expect(
      (await validate(tooOld)).some((error) => error.property === 'year'),
    ).toBe(true);
    expect(
      (await validate(future)).some((error) => error.property === 'year'),
    ).toBe(true);
  });

  it('applies the same year range to updates', async () => {
    const currentYear = new Date().getFullYear();

    await expect(
      validate(plainToInstance(UpdateCarDto, { year: 2000 })),
    ).resolves.toHaveLength(0);
    await expect(
      validate(plainToInstance(UpdateCarDto, { year: currentYear })),
    ).resolves.toHaveLength(0);
    expect(
      (await validate(plainToInstance(UpdateCarDto, { year: 1999 }))).some(
        (error) => error.property === 'year',
      ),
    ).toBe(true);
    expect(
      (
        await validate(
          plainToInstance(UpdateCarDto, { year: currentYear + 1 }),
        )
      ).some((error) => error.property === 'year'),
    ).toBe(true);
  });
});
