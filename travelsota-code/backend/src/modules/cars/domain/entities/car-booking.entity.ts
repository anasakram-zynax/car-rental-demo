import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';
import type { CarServiceType } from '../types/car-service-type';

export interface CarBookingEntity {
  id: string;
  publicRef: string;
  userId: string | null;
  fleetId: string;
  serviceType: CarServiceType;
  status: BookingStatus;
  quantity: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupAt: Date;
  dropoffAt: Date | null;
  rentalDays: number | null;
  customerSnapshot: Record<string, unknown>;
  fleetSnapshot: Record<string, unknown>;
  pricingSnapshot: Record<string, unknown>;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  currency: string;
  promoCode: string | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  cancellationFeeMinor: number;
  workflowTrace: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCarBookingInput = Omit<
  CarBookingEntity,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};

export type UpdateCarBookingInput = Partial<
  Omit<CarBookingEntity, 'id' | 'publicRef' | 'createdAt' | 'updatedAt'>
>;
