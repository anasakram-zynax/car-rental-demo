import type { CarBooking } from '../../domain/car-booking.entity.js';
import { BookingStatus } from '../../domain/booking-status.js';
import { PaymentStatus } from '../../domain/payment-status.js';

export class CarBookingMapper {
  static toDomain(data: any): CarBooking {
    return {
      id: data.id,
      reference: data.reference,

      carId: data.carId,

      pickupLocation: data.pickupLocation,
      dropoffLocation: data.dropoffLocation,

      pickupAt: data.pickupAt,
      returnAt: data.returnAt,

      rentalDays: data.rentalDays,

      dailyPrice: Number(data.dailyPrice),
      taxAmount: Number(data.taxAmount),
      totalPrice: Number(data.totalPrice),
      currency: data.currency,

      bookingStatus:
        data.bookingStatus === 'CONFIRMED'
          ? BookingStatus.CONFIRMED
          : BookingStatus.CANCELLED,

      paymentStatus:
        data.paymentStatus === 'PAID'
          ? PaymentStatus.PAID
          : data.paymentStatus === 'REFUNDED'
            ? PaymentStatus.REFUNDED
            : PaymentStatus.UNPAID,

      cancelReason: data.cancelReason,

      driverFirstName: data.driverFirstName,
      driverLastName: data.driverLastName,
      driverBirthDate: data.driverBirthDate,
      driverLicenseNumber: data.driverLicenseNumber,

      contactEmail: data.contactEmail,
      contactPhone: data.contactPhone,

      specialRequests: data.specialRequests,

      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }
}
