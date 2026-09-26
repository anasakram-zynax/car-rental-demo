import { Injectable, Logger } from '@nestjs/common';
import type { OutboxEventEntity } from '../domain/outbox-event.entity';

export type EventHandler = (event: OutboxEventEntity) => Promise<void>;

@Injectable()
export class EventDispatcherService {
  private readonly logger = new Logger(EventDispatcherService.name);
  private readonly handlers = new Map<string, Set<EventHandler>>();

  register(eventType: string, handler: EventHandler): void {
    const set = this.handlers.get(eventType) ?? new Set();
    set.add(handler);
    this.handlers.set(eventType, set);
    this.logger.log(
      `Handler registered for '${eventType}' (${set.size} handler(s) total for this type)`,
    );
  }

  async dispatch(event: OutboxEventEntity): Promise<void> {
    const handlers = this.handlers.get(event.eventType);
    if (!handlers || handlers.size === 0) {
      this.logger.warn(
        `No handlers registered for event type: ${event.eventType} (event ${event.id}) — marking as published`,
      );
      return;
    }

    this.logger.log(
      `Dispatching ${event.eventType} (id: ${event.id}) to ${handlers.size} handler(s)`,
    );

    const results = await Promise.allSettled(
      Array.from(handlers).map((h) => h(event)),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Handler failed for ${event.eventType} (${event.id}): ${result.reason}`,
        );
      }
    }

    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(
        `${failures.length}/${handlers.size} handler(s) failed for ${event.eventType}`,
      );
    }

    this.logger.log(
      `Successfully dispatched ${event.eventType} (id: ${event.id})`,
    );
  }
}
