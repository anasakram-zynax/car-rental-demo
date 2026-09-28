import type { BookingStatus } from '../../../../shared/booking/booking-state-machine';
import type {
  CarBookingEntity,
  CreateCarBookingInput,
  UpdateCarBookingInput,
} from '../../domain/entities/car-booking.entity';

export interface CarBookingPageCriteria {
  page: number;
  pageSize: number;
}

export interface CarBookingPageResult {
  items: CarBookingEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OverlappingRentalCriteria {
  fleetId: string;
  pickupAt: Date;
  dropoffAt: Date;
  statuses: readonly BookingStatus[];
  excludeBookingId?: string;
}

export interface CarBookingRepositoryPort {
  create(data: CreateCarBookingInput): Promise<CarBookingEntity>;
  update(id: string, patch: UpdateCarBookingInput): Promise<CarBookingEntity>;
  findById(id: string): Promise<CarBookingEntity | null>;
  findByPublicRef(publicRef: string): Promise<CarBookingEntity | null>;
  findByUserId(
    userId: string,
    criteria: CarBookingPageCriteria,
  ): Promise<CarBookingPageResult>;
  findOverlappingRentals(
    criteria: OverlappingRentalCriteria,
  ): Promise<CarBookingEntity[]>;
  atomicClaimStatus(
    id: string,
    expectedStatus: BookingStatus,
    newStatus: BookingStatus,
  ): Promise<boolean>;
}

export const CarBookingRepositoryPortToken = Symbol('CarBookingRepositoryPort');
