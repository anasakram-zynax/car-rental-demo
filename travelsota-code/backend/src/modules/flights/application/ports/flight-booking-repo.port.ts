import type { FlightBookingEntity, CreateFlightBookingInput, UpdateFlightBookingInput } from '../../domain/entities/flight-booking.entity';

export interface FlightBookingRepoPort {
  create(data: CreateFlightBookingInput): Promise<FlightBookingEntity>;
  update(id: string, patch: UpdateFlightBookingInput): Promise<FlightBookingEntity | null>;
  findById(id: string): Promise<FlightBookingEntity | null>;
  findAll(): Promise<FlightBookingEntity[]>;
  findByUserId(userId: string): Promise<FlightBookingEntity[]>;
  
  /**
   * Find a pending payment booking for a specific user and offer.
   * Used for idempotency - prevents duplicate bookings when checkout is called multiple times.
   */
  findPendingByUserAndOffer(userId: string, offerId: string): Promise<FlightBookingEntity | null>;

  /**
   * Atomically claim a booking by updating its status only if it matches
   * the expected current status. Returns true if the claim succeeded.
   *
   * This uses Prisma's updateMany with a WHERE clause for database-level
   * atomicity, preventing race conditions when multiple workers try to
   * process the same booking (e.g. duplicate outbox event deliveries).
   */
  atomicClaimStatus(id: string, expectedStatus: string, newStatus: string, message?: string): Promise<boolean>;

  /**
   * Phase 9: Transition booking status with state machine validation.
   * Validates the transition is allowed, then performs the update.
   * Logs warnings for invalid transitions but does NOT throw — callers
   * can decide whether to enforce or degrade gracefully.
   * Returns the updated booking, or null if the transition was skipped.
   */
  transitionStatus(id: string, fromStatus: string, toStatus: string, message?: string): Promise<FlightBookingEntity | null>;
}

export const FlightBookingRepoPortToken = Symbol('FlightBookingRepoPort');
