import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OutboxEventStatus } from '../domain/outbox-event-status.enum';
import { EventDispatcherService } from './event-dispatcher.service';

@Injectable()
export class ImmediateOutboxDispatcherService {
  private readonly logger = new Logger(ImmediateOutboxDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: EventDispatcherService,
  ) {}

  dispatch(event: {
    id: string;
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }): void {
    void (async () => {
      try {
        const claimed = await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, status: OutboxEventStatus.PENDING },
          data: {
            status: OutboxEventStatus.PROCESSING,
            scheduledAt: new Date(Date.now() + 180_000),
            updatedAt: new Date(),
          },
        });
        if (claimed.count === 0) {
          this.logger.debug(
            `Immediate dispatch skipped for ${event.eventType} (${event.id}); event already claimed`,
          );
          return;
        }

        this.logger.log(
          `Immediate dispatch claimed ${event.eventType} (${event.id})`,
        );
        await this.dispatcher.dispatch({
          ...event,
          status: OutboxEventStatus.PROCESSING,
          retryCount: 0,
          maxRetries: 5,
          scheduledAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: OutboxEventStatus.PUBLISHED,
            publishedAt: new Date(),
            updatedAt: new Date(),
          },
        });
      } catch (err) {
        await this.prisma.outboxEvent
          .update({
            where: { id: event.id },
            data: {
              status: OutboxEventStatus.PENDING,
              scheduledAt: new Date(),
              lastError: err instanceof Error ? err.message : String(err),
              updatedAt: new Date(),
            },
          })
          .catch(() => undefined);
        this.logger.warn(
          `Immediate dispatch failed for ${event.eventType} (${event.id}); outbox relay will retry: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();
  }
}
