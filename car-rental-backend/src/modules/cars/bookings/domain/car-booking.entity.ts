import { BookingStatus } from './booking-status.js';
import { PaymentStatus } from './payment-status.js';

export interface CarBooking {
  id: string;
  reference: string;

  carId: string;

  pickupLocation: string;
  dropoffLocation: string;

  pickupAt: Date;
  returnAt: Date;

  rentalDays: number;

  dailyPrice: number;
  taxAmount: number;
  totalPrice: number;
  currency: string;

  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;

  cancelReason: string | null;

  driverFirstName: string;
  driverLastName: string;
  driverBirthDate: Date;
  driverLicenseNumber: string;

  contactEmail: string;
  contactPhone: string;

  specialRequests: string | null;

  createdAt: Date;
  updatedAt: Date;
}
