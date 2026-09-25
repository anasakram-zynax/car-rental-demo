import { BookingStatus } from './booking-status.js';
import { PaymentStatus } from './payment-status.js';

export interface BookingTransferPackage {
  id: string;
  fromLocation: string;
  toLocation: string;
  price: number;
  currency: string;
}

export interface CarBooking {
  id: string;
  reference: string;

  carId: string;
  transferPackageId: string | null;
  transferPackage: BookingTransferPackage | null;

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
  driverBirthDate: Date | null;
  driverLicenseNumber: string | null;

  contactEmail: string;
  contactPhone: string;

  specialRequests: string | null;

  createdAt: Date;
  updatedAt: Date;
}
