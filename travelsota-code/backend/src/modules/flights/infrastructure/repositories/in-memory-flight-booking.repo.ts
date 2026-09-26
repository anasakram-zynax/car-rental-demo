import { Injectable } from '@nestjs/common';
import type { FlightBookingRepoPort } from '../../application/ports/flight-booking-repo.port';
import type { FlightBookingEntity, CreateFlightBookingInput, UpdateFlightBookingInput } from '../../domain/entities/flight-booking.entity';
import { assertTransition } from '../../../../shared/booking/booking-state-machine';

@Injectable()
export class InMemoryFlightBookingRepo implements FlightBookingRepoPort {
  private store = new Map<string, FlightBookingEntity>();

  async create(data: CreateFlightBookingInput): Promise<FlightBookingEntity> {
    const entity: FlightBookingEntity = {
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.store.set(entity.id, entity);
    return entity;
  }

  async update(id: string, patch: UpdateFlightBookingInput): Promise<FlightBookingEntity | null> {
    const existing = this.store.get(id);
    if (!existing) return null;
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.store.set(id, next);
    return next;
  }

  async atomicClaimStatus(
    id: string,
    expectedStatus: string,
    newStatus: string,
    message?: string,
  ): Promise<boolean> {
    const existing = this.store.get(id);
    if (!existing || existing.status !== expectedStatus) return false;
    const next = {
      ...existing,
      status: newStatus as any,
      message: message ?? existing.message,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    return true;
  }

  async findById(id: string): Promise<FlightBookingEntity | null> {
    return this.store.get(id) ?? null;
  }

  async findAll(): Promise<FlightBookingEntity[]> {
    return Array.from(this.store.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  async findByUserId(userId: string): Promise<FlightBookingEntity[]> {
    return Array.from(this.store.values())
      .filter((b) => b.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findPendingByUserAndOffer(userId: string, offerId: string): Promise<FlightBookingEntity | null> {
    return Array.from(this.store.values())
      .find((b) => b.userId === userId && b.status === 'pending_payment' && (b.offerSnapshot as any)?.offerId === offerId) ?? null;
  }

  async transitionStatus(
    id: string,
    fromStatus: string,
    toStatus: string,
    message?: string,
  ): Promise<FlightBookingEntity | null> {
    assertTransition(fromStatus, toStatus);
    const existing = this.store.get(id);
    if (!existing || existing.status !== fromStatus) return null;
    const next = {
      ...existing,
      status: toStatus as any,
      message: message ?? existing.message,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(id, next);
    return next;
  }
}
