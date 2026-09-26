import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { OutboxRepoPort } from './outbox-repo.port';
import { OutboxRepoPortToken } from './outbox-repo.port';
import type { OutboxEventEntity } from '../domain/outbox-event.entity';
import { EventDispatcherService } from './event-dispatcher.service';

export interface OutboxRelayConfig {
  pollIntervalMs: number;
  batchSize: number;
  visibilityTimeoutSeconds: number;
  maxBackoffSeconds: number;
}

export const OUTBOX_RELAY_CONFIG = Symbol('OUTBOX_RELAY_CONFIG');

export const DEFAULT_RELAY_CONFIG: OutboxRelayConfig = {
  pollIntervalMs: 500,
  batchSize: 3,
  visibilityTimeoutSeconds: 180,
  maxBackoffSeconds: 60,
};

@Injectable()
export class OutboxRelayService implements OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelayService.name);
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = new Set<Promise<void>>();
  private pollCount = 0;
  private totalClaimed = 0;
  private lastHeartbeatAt = 0;
  private consecutiveErrors = 0;
  private readonly maxBackoffMs = 30_000;

  constructor(
    @Inject(OutboxRepoPortToken)
    private readonly repo: OutboxRepoPort,
    private readonly dispatcher: EventDispatcherService,
    @Inject(OUTBOX_RELAY_CONFIG)
    private readonly config: OutboxRelayConfig,
  ) {}

  async start(): Promise<void> {
    if (process.env.ENABLE_OUTBOX_RELAY !== 'true') {
      this.logger.log('Outbox relay disabled for this process (ENABLE_OUTBOX_RELAY != true)');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.lastHeartbeatAt = Date.now();
    this.logger.log(
      `Outbox relay starting (poll: ${this.config.pollIntervalMs}ms, batch: ${this.config.batchSize}, visibilityTimeout: ${this.config.visibilityTimeoutSeconds}s)`,
    );

    // Reset stale 'processing' events FIRST, before checking for active peers.
    // Crashed processes leave events with scheduledAt in the future (within the
    // visibility window), which would falsely appear as an active peer.
    await this.resetStaleEvents();

    // Now check if another relay is genuinely active (only events NOT yet stale).
    const hasActivePeer = await this.checkForActivePeer();
    if (hasActivePeer) {
      this.logger.warn(
        'Another outbox relay appears to be active — this instance will NOT start its own relay. ' +
        'If this is a hot-reload, kill the old process manually.',
      );
      this.running = false;
      return;
    }

    this.logger.log('Outbox relay running — entering poll loop');
    this.pollLoop();
  }

  /**
   * Detect if another relay process is actively claiming events.
   * Looks for events in 'processing' state with scheduledAt in the future
   * (meaning another relay recently claimed them).
   */
  private async checkForActivePeer(): Promise<boolean> {
    try {
      const activeCount = await this.repo.countProcessing();
      if (activeCount > 0) {
        this.logger.warn(
          `Found ${activeCount} event(s) in 'processing' state — another relay may be active`,
        );
        return true;
      }
      return false;
    } catch {
      // If the check fails, proceed anyway (better to have two relays than none)
      return false;
    }
  }

  /**
   * Reset events stuck in 'processing' from crashed/dead-lettered processes.
   * Their scheduledAt was set to NOW + visibilityTimeout by the old relay,
   * which may be far in the future. Reset them to 'pending' so the new relay
   * can pick them up immediately.
   */
  private async resetStaleEvents(): Promise<void> {
    try {
      const staleCount = await this.repo.resetStaleProcessingEvents(
        this.config.visibilityTimeoutSeconds,
      );
      if (staleCount > 0) {
        this.logger.warn(
          `Reset ${staleCount} stale 'processing' event(s) back to 'pending' from previous process`,
        );
      }
    } catch (err) {
      this.logger.error('Failed to reset stale processing events (non-fatal)', err);
    }
  }

  private pollLoop(): void {
    if (!this.running) return;
    // Exponential backoff on consecutive errors to prevent connection pool exhaustion
    const delay = this.consecutiveErrors > 0
      ? Math.min(this.config.pollIntervalMs * Math.pow(2, this.consecutiveErrors), this.maxBackoffMs)
      : this.config.pollIntervalMs;
    this.pollTimer = setTimeout(async () => {
      if (!this.running) return;
      this.pollCount++;
      try {
        const events = await this.repo.claimNextBatch(
          this.config.batchSize,
          this.config.visibilityTimeoutSeconds,
        );
        this.consecutiveErrors = 0;
        if (events.length > 0) {
          this.totalClaimed += events.length;
        }
        for (const event of events) {
          const promise = this.processEvent(event)
            .finally(() => {
              this.inFlight.delete(promise);
            })
            .catch(() => {}); // prevent unhandled rejection from propagating
          this.inFlight.add(promise);
        }
      } catch (err) {
        this.consecutiveErrors++;
        this.logger.error(
          `Error claiming outbox batch (poll #${this.pollCount}, error #${this.consecutiveErrors}): ${err instanceof Error ? err.message : String(err)}`,
          err,
        );
      }
      this.pollLoop();
    }, delay);
  }

  private async processEvent(event: OutboxEventEntity): Promise<void> {
    try {
      await this.dispatcher.dispatch(event);
      await this.repo.markPublished(event.id);
      if (process.env.ENABLE_WORKER_DEBUG_LOGS === 'true') {
        this.logger.debug(`Published outbox event ${event.id} (${event.eventType})`);
      }
    } catch (err: any) {
      const nextRetryCount = event.retryCount + 1;
      if (nextRetryCount >= event.maxRetries) {
        this.logger.warn(
          `Dead-lettering outbox event ${event.id} (${event.eventType}) after ${nextRetryCount} attempt(s)`,
        );
        await this.repo.markDeadLetter(event.id, err?.message ?? String(err));
      } else {
        const backoffSeconds = Math.min(
          Math.pow(2, nextRetryCount),
          this.config.maxBackoffSeconds,
        );
        this.logger.warn(
          `Failed outbox event ${event.id} (${event.eventType}), retry ${nextRetryCount}/${event.maxRetries} in ${backoffSeconds}s: ${err?.message ?? err}`,
        );
        await this.repo.markFailed(event.id, err?.message ?? String(err), backoffSeconds);
      }
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutting down outbox relay (signal: ${signal})`);
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.inFlight.size > 0) {
      this.logger.log(`Waiting for ${this.inFlight.size} in-flight event(s)...`);
      const timeoutMs = 10_000;
      const timeout = new Promise<void>((resolve) => {
        setTimeout(() => {
          this.logger.warn('Timed out waiting for in-flight outbox events');
          resolve();
        }, timeoutMs);
      });
      const drained = Promise.allSettled(Array.from(this.inFlight)).then(() => {});
      await Promise.race([drained, timeout]);
    }
    this.logger.log('Outbox relay shut down');
  }
}
