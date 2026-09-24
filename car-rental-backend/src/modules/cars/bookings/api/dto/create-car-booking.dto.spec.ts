import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateCarBookingDto } from './create-car-booking.dto.js';

const baseBooking = {
  carId: '11111111-1111-4111-8111-111111111111',
  pickupLocation: 'Lahore',
  dropoffLocation: 'Lahore',
  pickupAt: '2030-10-10T10:00:00.000Z',
  returnAt: '2030-10-11T10:00:00.000Z',
  driverFirstName: 'Test',
  driverLastName: 'Driver',
  contactEmail: 'test@example.com',
  contactPhone: '+923001234567',
};

describe('CreateCarBookingDto', () => {
  it('allows service-dependent fields to be absent at transport level', async () => {
    const {
      returnAt: _returnAt,
      pickupLocation: _pickupLocation,
      dropoffLocation: _dropoffLocation,
      ...request
    } = baseBooking;
    const dto = plainToInstance(CreateCarBookingDto, request);
    const errors = await validate(dto);

    expect(errors).toEqual([]);
  });

  it('allows transfer requests to omit driver license and birth date', async () => {
    const dto = plainToInstance(CreateCarBookingDto, {
      ...baseBooking,
      transferPackageId: '22222222-2222-4222-8222-222222222222',
    });
    const errors = await validate(dto);

    expect(errors).toEqual([]);
  });

  it('validates optional service-dependent fields when supplied', async () => {
    const dto = plainToInstance(CreateCarBookingDto, {
      ...baseBooking,
      transferPackageId: '22222222-2222-4222-8222-222222222222',
      driverBirthDate: 'not-a-date',
      driverLicenseNumber: 123,
      returnAt: 'not-a-date',
    });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'driverBirthDate')).toBe(
      true,
    );
    expect(
      errors.some((error) => error.property === 'driverLicenseNumber'),
    ).toBe(true);
    expect(errors.some((error) => error.property === 'returnAt')).toBe(true);
  });
});
