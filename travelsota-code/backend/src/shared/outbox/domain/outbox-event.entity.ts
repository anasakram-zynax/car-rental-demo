import type { OutboxEventStatus } from './outbox-event-status.enum';

export interface OutboxEventEntity {
  id: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: any;
  idempotencyKey: string;
  status: OutboxEventStatus;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  scheduledAt: Date;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOutboxEventInput {
  id?: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: any;
  idempotencyKey?: string;
  status?: OutboxEventStatus;
  retryCount?: number;
  maxRetries?: number;
  scheduledAt?: Date;
}
