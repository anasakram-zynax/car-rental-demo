import type { CarBooking } from '../../domain/car-booking.entity.js';
import { PaymentStatus } from '../../domain/payment-status.js';

export interface CreateBookingData {
  reference: string;

  carId: string;
  transferPackageId?: string;

  pickupLocation: string;
  dropoffLocation: string;

  pickupAt: Date;
  returnAt: Date;

  rentalDays: number;

  dailyPrice: number;
  taxAmount: number;
  totalPrice: number;
  currency: string;

  driverFirstName: string;
  driverLastName: string;
  driverBirthDate?: Date;
  driverLicenseNumber?: string;

  contactEmail: string;
  contactPhone: string;

  specialRequests?: string;
}

export interface CarBookingRepositoryPort {
  create(data: CreateBookingData): Promise<CarBooking>;

  findByReference(reference: string): Promise<CarBooking | null>;

  countOverlappingConfirmed(
    carId: string,
    pickupAt: Date,
    returnAt: Date,
  ): Promise<number>;

  findAll(): Promise<CarBooking[]>;

  cancel(reference: string, reason?: string): Promise<CarBooking>;

  updatePaymentStatus(
    reference: string,
    paymentStatus: PaymentStatus,
  ): Promise<CarBooking>;
}
