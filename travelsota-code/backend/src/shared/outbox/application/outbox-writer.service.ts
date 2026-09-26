import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { OutboxRepoPort } from './outbox-repo.port';
import { OutboxRepoPortToken } from './outbox-repo.port';
import { OutboxEventStatus } from '../domain/outbox-event-status.enum';

export interface WriteOutboxEventInput {
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}

@Injectable()
export class OutboxWriterService {
  private readonly logger = new Logger(OutboxWriterService.name);

  constructor(
    @Inject(OutboxRepoPortToken)
    private readonly repo: OutboxRepoPort,
    private readonly prisma: PrismaService,
  ) {}

  async write(event: WriteOutboxEventInput): Promise<string> {
    const entity = await this.repo.create({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload as any,
      idempotencyKey: event.idempotencyKey ?? randomUUID(),
    });
    return entity.id;
  }

  async writeOnce(
    event: WriteOutboxEventInput & { idempotencyKey: string },
  ): Promise<string | null> {
    const id = randomUUID();
    const result = await this.prisma.outboxEvent.createMany({
      data: [{
        id,
        eventType: event.eventType,
        aggregateType: event.aggregateType ?? null,
        aggregateId: event.aggregateId ?? null,
        payload: event.payload as any,
        idempotencyKey: event.idempotencyKey,
        status: OutboxEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 5,
        scheduledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      skipDuplicates: true,
    });
    return result.count > 0 ? id : null;
  }

  async writeInTransaction(
    tx: any,
    event: WriteOutboxEventInput,
  ): Promise<string> {
    const entity = await tx.outboxEvent.create({
      data: {
        id: randomUUID(),
        eventType: event.eventType,
        aggregateType: event.aggregateType ?? null,
        aggregateId: event.aggregateId ?? null,
        payload: event.payload as any,
        idempotencyKey: event.idempotencyKey ?? randomUUID(),
        status: OutboxEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 5,
        scheduledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return entity.id;
  }

  async writeInTransactionOnce(
    tx: any,
    event: WriteOutboxEventInput & { idempotencyKey: string },
  ): Promise<string | null> {
    const id = randomUUID();
    const result = await tx.outboxEvent.createMany({
      data: [{
        id,
        eventType: event.eventType,
        aggregateType: event.aggregateType ?? null,
        aggregateId: event.aggregateId ?? null,
        payload: event.payload as any,
        idempotencyKey: event.idempotencyKey,
        status: OutboxEventStatus.PENDING,
        retryCount: 0,
        maxRetries: 5,
        scheduledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }],
      skipDuplicates: true,
    });
    return result.count > 0 ? id : null;
  }

  /**
   * Write an outbox event with one retry on failure.
   * Use this instead of `write().catch(() => {})` for non-critical fire-and-forget
   * notifications where losing the event is acceptable but silent failures are not.
   */
  async writeSafe(event: WriteOutboxEventInput): Promise<void> {
    try {
      const id = await this.write(event);
      this.logger.log(`Outbox write OK: ${event.eventType} (id=${id})`);
    } catch (err) {
      this.logger.warn(`Outbox write failed (attempt 1), retrying: ${event.eventType} — ${err instanceof Error ? err.message : String(err)}`);
      try {
        const id = await this.write(event);
        this.logger.debug(`Outbox write OK (retry): ${event.eventType} (id=${id})`);
      } catch (retryErr) {
        this.logger.error(
          `Outbox write FAILED (attempt 2, giving up): ${event.eventType} — ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`,
        );
      }
    }
  }
}
