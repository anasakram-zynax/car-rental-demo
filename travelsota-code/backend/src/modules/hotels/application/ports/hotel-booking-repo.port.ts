import type { HotelBookingEntity, CreateHotelBookingInput, UpdateHotelBookingInput } from '../../domain/entities/hotel-booking.entity';

export interface HotelBookingRepoPort {
  create(data: CreateHotelBookingInput): Promise<HotelBookingEntity>;
  update(id: string, patch: UpdateHotelBookingInput): Promise<HotelBookingEntity>;
  findById(id: string): Promise<HotelBookingEntity | null>;
  findAll(): Promise<HotelBookingEntity[]>;
  findByUserId(userId: string): Promise<HotelBookingEntity[]>;
  findPendingHotelConfirmation(now: Date, limit?: number): Promise<HotelBookingEntity[]>;
  findByPartnerOrderId(partnerOrderId: string): Promise<HotelBookingEntity | null>;
  findRatehawkWebhookTimeouts(cutoff: Date, limit?: number): Promise<HotelBookingEntity[]>;
  
  /**
   * Find a pending payment booking for a specific user and rateKey.
   * Used for idempotency - prevents duplicate bookings when checkout is called multiple times.
   */
  findPendingByUserAndRateKey(userId: string, rateKey: string): Promise<HotelBookingEntity | null>;

  /**
   * Atomically claim a booking by updating its status only if it matches
   * the expected current status. Returns true if the claim succeeded.
   *
   * Uses Prisma's updateMany with a WHERE clause for database-level
   * atomicity, preventing race conditions when multiple workers try to
   * process the same booking (e.g. duplicate outbox event deliveries).
   */
  atomicClaimStatus(id: string, expectedStatus: string, newStatus: string, message?: string): Promise<boolean>;
}

export const HotelBookingRepoPortToken = Symbol('HotelBookingRepoPort');
