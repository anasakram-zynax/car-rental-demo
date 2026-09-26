import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { OutboxRepoPort } from '../application/outbox-repo.port';
import type { OutboxEventEntity, CreateOutboxEventInput } from '../domain/outbox-event.entity';
import { OutboxEventStatus } from '../domain/outbox-event-status.enum';

@Injectable()
export class PrismaOutboxRepository implements OutboxRepoPort {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateOutboxEventInput): Promise<OutboxEventEntity> {
    return this.prisma.outboxEvent.create({
      data: {
        id: data.id ?? randomUUID(),
        eventType: data.eventType,
        aggregateType: data.aggregateType ?? null,
        aggregateId: data.aggregateId ?? null,
        payload: data.payload as any,
        idempotencyKey: data.idempotencyKey ?? randomUUID(),
        status: data.status ?? OutboxEventStatus.PENDING,
        retryCount: data.retryCount ?? 0,
        maxRetries: data.maxRetries ?? 5,
        scheduledAt: data.scheduledAt ?? new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    }) as unknown as OutboxEventEntity;
  }

  async claimNextBatch(batchSize: number, visibilityTimeoutSeconds: number): Promise<OutboxEventEntity[]> {
    const sql = `
      WITH claimed AS (
        SELECT id FROM "OutboxEvent"
        WHERE status IN ('pending', 'failed', 'processing')
          AND "scheduledAt" <= NOW()
        ORDER BY "createdAt" ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "OutboxEvent"
      SET status = 'processing',
          "scheduledAt" = NOW() + ($2 * INTERVAL '1 second'),
          "updatedAt" = NOW()
      WHERE id IN (SELECT id FROM claimed)
      RETURNING *
      `;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const rows: any[] = await this.prisma.$queryRawUnsafe(sql, batchSize, visibilityTimeoutSeconds);
        return rows.map(this.mapToEntity);
      } catch (err: any) {
        const isPoolExhausted =
          String(err?.message ?? '').includes('EMAXCONNSESSION') ||
          String(err?.message ?? '').includes('timeout exceeded when trying to connect');
        if (isPoolExhausted && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    return [];
  }

  async markPublished(id: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "OutboxEvent" SET status = 'published', "publishedAt" = NOW(), "updatedAt" = NOW() WHERE id = $1`,
          id,
        );
        return;
      } catch (err: any) {
        const isPoolExhausted = String(err?.message ?? '').includes('EMAXCONNSESSION') ||
          String(err?.message ?? '').includes('timeout exceeded when trying to connect');
        if (isPoolExhausted && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }

  async markFailed(id: string, error: string, backoffSeconds: number): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "OutboxEvent" SET status = 'failed', "retryCount" = "retryCount" + 1, "scheduledAt" = NOW() + ($2 * INTERVAL '1 second'), "lastError" = $3, "updatedAt" = NOW() WHERE id = $1`,
          id,
          backoffSeconds,
          error,
        );
        return;
      } catch (err: any) {
        const isPoolExhausted = String(err?.message ?? '').includes('EMAXCONNSESSION') ||
          String(err?.message ?? '').includes('timeout exceeded when trying to connect');
        if (isPoolExhausted && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }

  async markDeadLetter(id: string, error: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.prisma.$executeRawUnsafe(
          `UPDATE "OutboxEvent" SET status = 'dead_letter', "lastError" = $2, "updatedAt" = NOW() WHERE id = $1`,
          id,
          error,
        );
        return;
      } catch (err: any) {
        const isPoolExhausted = String(err?.message ?? '').includes('EMAXCONNSESSION') ||
          String(err?.message ?? '').includes('timeout exceeded when trying to connect');
        if (isPoolExhausted && attempt < 2) {
          await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
  }

  async findById(id: string): Promise<OutboxEventEntity | null> {
    const row: any = await this.prisma.outboxEvent.findUnique({ where: { id } });
    return row ? this.mapToEntity(row) : null;
  }

  /**
   * Reset events stuck in 'processing' from crashed processes.
   * Claimed rows have scheduledAt = NOW() + visibilityTimeout (in the future).
   * After a crash they block new relay startup. Reset any processing row whose
   * scheduledAt has already passed — meaning the visibility window expired and
   * no active process renewed it.
   */
  async resetStaleProcessingEvents(_visibilityTimeoutSeconds: number): Promise<number> {
    const result: any = await this.prisma.$executeRawUnsafe(
      `UPDATE "OutboxEvent"
       SET status = 'pending',
           "scheduledAt" = NOW(),
           "retryCount" = "retryCount" + 1,
           "lastError" = COALESCE("lastError", '') || ' | reset from stale processing by relay startup',
           "updatedAt" = NOW()
       WHERE status = 'processing'
         AND "scheduledAt" < NOW()`,
    );
    return typeof result === 'number' ? result : 0;
  }

  async countProcessing(): Promise<number> {
    const result: any = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt FROM "OutboxEvent" WHERE status = 'processing' AND "scheduledAt" > NOW()`,
    );
    return result?.[0]?.cnt ?? 0;
  }

  private mapToEntity(row: any): OutboxEventEntity {
    return {
      id: row.id,
      eventType: row.eventType,
      aggregateType: row.aggregateType ?? undefined,
      aggregateId: row.aggregateId ?? undefined,
      payload: row.payload as Record<string, unknown>,
      idempotencyKey: row.idempotencyKey,
      status: row.status as OutboxEventStatus,
      retryCount: row.retryCount,
      maxRetries: row.maxRetries,
      lastError: row.lastError ?? undefined,
      scheduledAt: row.scheduledAt,
      publishedAt: row.publishedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
