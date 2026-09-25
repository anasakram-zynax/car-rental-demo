import { describe, expect, it } from 'vitest';
import { CarBookingMapper } from './car-booking.mapper.js';

const rawBooking = {
  id: 'booking-1',
  reference: 'CR-TEST',
  carId: 'car-1',
  pickupLocation: 'Airport',
  dropoffLocation: 'Hotel',
  pickupAt: new Date('2030-10-10T10:00:00.000Z'),
  returnAt: new Date('2030-10-10T13:00:00.000Z'),
  rentalDays: 1,
  dailyPrice: 50,
  taxAmount: 5,
  totalPrice: 55,
  currency: 'USD',
  bookingStatus: 'CONFIRMED',
  paymentStatus: 'UNPAID',
  cancelReason: null,
  driverFirstName: 'Test',
  driverLastName: 'Passenger',
  driverBirthDate: null,
  driverLicenseNumber: null,
  contactEmail: 'test@example.com',
  contactPhone: '+923001234567',
  specialRequests: null,
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  updatedAt: new Date('2030-01-01T00:00:00.000Z'),
};

describe('CarBookingMapper', () => {
  it('maps the selected transfer package and nullable driver fields', () => {
    const booking = CarBookingMapper.toDomain({
      ...rawBooking,
      transferPackageId: 'package-1',
      transferPackage: {
        id: 'package-1',
        fromLocation: 'Airport',
        toLocation: 'Hotel',
        price: '42.50',
        currency: 'USD',
      },
    });

    expect(booking.transferPackageId).toBe('package-1');
    expect(booking.transferPackage).toEqual({
      id: 'package-1',
      fromLocation: 'Airport',
      toLocation: 'Hotel',
      price: 42.5,
      currency: 'USD',
    });
    expect(booking.driverBirthDate).toBeNull();
    expect(booking.driverLicenseNumber).toBeNull();
  });

  it('maps existing rental bookings with no transfer package', () => {
    const booking = CarBookingMapper.toDomain({
      ...rawBooking,
      transferPackageId: null,
      transferPackage: null,
      driverBirthDate: new Date('2000-01-01T00:00:00.000Z'),
      driverLicenseNumber: 'TEST-001',
    });

    expect(booking.transferPackageId).toBeNull();
    expect(booking.transferPackage).toBeNull();
    expect(booking.driverLicenseNumber).toBe('TEST-001');
  });
});
