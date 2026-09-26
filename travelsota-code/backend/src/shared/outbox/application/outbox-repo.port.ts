import type { OutboxEventEntity, CreateOutboxEventInput } from '../domain/outbox-event.entity';

export interface OutboxRepoPort {
  create(data: CreateOutboxEventInput): Promise<OutboxEventEntity>;
  claimNextBatch(batchSize: number, visibilityTimeoutSeconds: number): Promise<OutboxEventEntity[]>;
  markPublished(id: string): Promise<void>;
  markFailed(id: string, error: string, backoffSeconds: number): Promise<void>;
  markDeadLetter(id: string, error: string): Promise<void>;
  findById(id: string): Promise<OutboxEventEntity | null>;
  resetStaleProcessingEvents(visibilityTimeoutSeconds: number): Promise<number>;
  countProcessing(): Promise<number>;
}

export const OutboxRepoPortToken = Symbol('OutboxRepoPort');
