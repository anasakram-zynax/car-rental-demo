import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { NotificationItem } from '../../modules/notifications/domain/notification-types';

const CHANNEL_PREFIX = 'travelsota:notif:';
const CONNECT_TIMEOUT_MS = 5000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

/**
 * Redis pub/sub for cross-process realtime notification delivery.
 * Worker process publishes → Redis channel → each API process subscribes → local SSE delivery.
 *
 * Uses NOTIFICATION_REDIS_URL (separate from cache Redis).
 * Degrades gracefully when disabled or unavailable — never crashes the app.
 */
@Injectable()
export class RedisPubSubService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private readonly handlers = new Map<string, Set<(notification: NotificationItem) => void>>();
  private connected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (process.env.ENABLE_NOTIFICATION_REDIS_PUBSUB !== 'true') {
      this.logger.log('Notification Redis pub/sub disabled (ENABLE_NOTIFICATION_REDIS_PUBSUB != true)');
      return;
    }

    const redisUrl = process.env.NOTIFICATION_REDIS_URL;
    if (!redisUrl) {
      this.logger.log('Notification Redis pub/sub disabled (NOTIFICATION_REDIS_URL not set) — using in-memory only');
      return;
    }

    // Validate URL format — must be redis:// or rediss://, NOT https://
    if (redisUrl.startsWith('https://') || redisUrl.startsWith('http://')) {
      this.logger.error(
        'NOTIFICATION_REDIS_URL looks like an HTTP/REST URL. ' +
        'ioredis requires Redis protocol: rediss:// (TLS) or redis:// (plain). ' +
        'Notification pub/sub disabled.',
      );
      return;
    }

    try {
      this.publisher = this.createClient(redisUrl, 'pub');
      this.subscriber = this.createClient(redisUrl, 'sub');

      this.subscriber.on('message', (channel: string, message: string) => {
        this.handleMessage(channel, message);
      });

      this.connect();
    } catch (err) {
      this.logger.warn(
        `Redis pub/sub init failed — falling back to in-memory: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.publisher = null;
      this.subscriber = null;
    }
  }

  private createClient(redisUrl: string, label: string): Redis {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Prevent unhandled error crashes
      enableOfflineQueue: false,
    });

    client.on('error', (err) => {
      // Swallow — ioredis will reconnect automatically.
      // Only log periodically to avoid log spam.
      if (this.reconnectAttempt % 10 === 0) {
        this.logger.warn(`Redis ${label} error (attempt ${this.reconnectAttempt}): ${err.message}`);
      }
    });

    client.on('close', () => {
      this.connected = false;
      this.logger.debug(`Redis ${label} connection closed`);
    });

    client.on('reconnecting', (delay: number) => {
      this.reconnectAttempt++;
      if (this.reconnectAttempt <= 3 || this.reconnectAttempt % 10 === 0) {
        this.logger.log(`Redis ${label} reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`);
      }
    });

    return client;
  }

  private async connect(): Promise<void> {
    if (!this.publisher || !this.subscriber) return;
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      this.connected = true;
      this.reconnectAttempt = 0;
      this.logger.log('Notification Redis pub/sub connected');

      // Resubscribe all channels that were registered before connection was ready
      await this.resubscribeAll();
    } catch (err) {
      this.connected = false;
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempt),
        RECONNECT_MAX_DELAY_MS,
      );
      this.reconnectAttempt++;
      this.logger.warn(
        `Redis connect failed — will retry in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }
  }

  /**
   * After connecting (or reconnecting), subscribe to all channels that have
   * local handlers registered. This handles the case where SSE connected
   * before Redis was ready.
   */
  private async resubscribeAll(): Promise<void> {
    if (!this.subscriber) return;
    const channels = Array.from(this.handlers.keys());
    if (channels.length === 0) return;

    this.logger.log(`Redis resubscribing ${channels.length} existing channel(s)`);
    for (const channel of channels) {
      try {
        await this.subscriber.subscribe(channel);
      } catch (err) {
        this.logger.warn(
          `Redis resubscribe failed for ${channel}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Publish a notification to a user's Redis channel.
   * Called by the notification service when emitting a notification.
   */
  publish(userId: string, notification: NotificationItem): void {
    if (!this.publisher || !this.connected) {
      this.logger.debug(`Redis publish skipped for user ${userId} — not connected`);
      return;
    }
    const channel = `${CHANNEL_PREFIX}${userId}`;
    const payload = JSON.stringify(notification);
    this.publisher.publish(channel, payload).catch((err) => {
      this.logger.warn(
        `Redis publish failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Subscribe to a user's notification channel.
   * Called by the API process when an SSE client connects.
   * Returns an unsubscribe function.
   */
  subscribe(userId: string, callback: (notification: NotificationItem) => void): () => void {
    const channel = `${CHANNEL_PREFIX}${userId}`;

    // Register handler first, then subscribe to Redis if connected
    const set = this.handlers.get(channel) ?? new Set();
    set.add(callback);
    this.handlers.set(channel, set);

    // Subscribe to Redis channel if connected (or will be resubscribed on reconnect)
    if (this.subscriber && this.connected) {
      this.subscriber.subscribe(channel).catch((err) => {
        this.logger.warn(`Redis subscribe failed for ${channel}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }

    return () => {
      const s = this.handlers.get(channel);
      if (s) {
        s.delete(callback);
        if (s.size === 0) {
          this.handlers.delete(channel);
          this.subscriber?.unsubscribe(channel).catch(() => {});
        }
      }
    };
  }

  private handleMessage(channel: string, message: string): void {
    const handlers = this.handlers.get(channel);
    if (!handlers || handlers.size === 0) return;

    try {
      const notification = JSON.parse(message) as NotificationItem;
      for (const cb of handlers) {
        try {
          cb(notification);
        } catch (err) {
          this.logger.error(`Redis message delivery error on ${channel}`, err);
        }
      }
    } catch {
      this.logger.warn(`Failed to parse Redis message on ${channel}`);
    }
  }

  get isAvailable(): boolean {
    return this.connected;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await Promise.all([
      this.publisher?.quit().catch(() => {}),
      this.subscriber?.quit().catch(() => {}),
    ]);
  }
}
