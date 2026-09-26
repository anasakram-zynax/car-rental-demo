import { Injectable, Logger } from '@nestjs/common';
import { PrismaNotificationRepository, NotificationFilters } from '../infrastructure/prisma-notification.repository';
import { NotificationRecipientResolverService } from './notification-recipient-resolver.service';
import { NotificationGateway } from '../api/notification.gateway';
import { NOTIFICATION_EVENT_MAP } from '../domain/notification-types';
import type { NotificationItem, NotificationListResult, UnreadCountResult } from '../domain/notification-types';
import { PrismaService } from '../../../shared/database/prisma.service';
import { CurrencyService } from '../../currency/application/services/currency.service';

/** Short human-friendly booking reference for toast/list bodies. */
function shortRef(bookingId: unknown): string {
  const id = typeof bookingId === 'string' ? bookingId : '';
  if (!id) return '';
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  // In-memory cache for notification rules — avoids DB query on every outbox event
  private rulesCache: { data: any[]; expiresAt: number } | null = null;
  private readonly RULES_CACHE_TTL_MS = 60_000; // 60s

  constructor(
    private readonly repo: PrismaNotificationRepository,
    private readonly recipientResolver: NotificationRecipientResolverService,
    private readonly gateway: NotificationGateway,
    private readonly prisma: PrismaService,
    private readonly currencyService: CurrencyService,
  ) {}

  async list(filters: NotificationFilters): Promise<NotificationListResult> {
    return this.repo.list(filters);
  }

  async getUnreadCount(userId: string): Promise<UnreadCountResult> {
    return this.repo.getUnreadCount(userId);
  }

  /** Push a coalesced unread-count update to all of a user's connected clients. */
  pushUnreadCount(userId: string): void {
    this.gateway.emitCountToUsers([userId]);
  }

  async getCriticalNotifications(userId: string, limit = 5): Promise<NotificationItem[]> {
    return this.repo.getCriticalNotifications(userId, limit);
  }

  async markRead(userId: string, notificationIds: string[]): Promise<number> {
    return this.repo.markRead(userId, notificationIds);
  }

  async markAllRead(
    userId: string,
    filters?: { severity?: string; category?: string; type?: string },
  ): Promise<number> {
    return this.repo.markAllRead(userId, filters);
  }

  async dismiss(userId: string, notificationId: string): Promise<boolean> {
    return this.repo.dismiss(userId, notificationId);
  }

  async deleteMany(userId: string, notificationIds: string[]): Promise<number> {
    return this.repo.deleteMany(userId, notificationIds);
  }

  async getPreferences(userId: string) {
    return this.repo.getPreferences(userId);
  }

  async updatePreference(userId: string, type: string, channel: string, enabled: boolean) {
    return this.repo.updatePreference(userId, type, channel, enabled);
  }

  async getRules() {
    const now = Date.now();
    if (this.rulesCache && now < this.rulesCache.expiresAt) {
      return this.rulesCache.data;
    }
    const data = await this.repo.getRules();
    this.rulesCache = { data, expiresAt: now + this.RULES_CACHE_TTL_MS };
    return data;
  }

  async updateRule(
    id: string,
    data: {
      enabled?: boolean;
      severity?: string;
      critical?: boolean;
      roleIds?: string[];
    },
  ) {
    // Invalidate rules cache on update
    this.rulesCache = null;
    return this.repo.updateRule(id, data);
  }

  /**
   * Handles an outbox event: resolves recipients, creates notification, emits via Socket.IO.
   * Uses the event's stored idempotencyKey when available (set by the caller via writeSafe),
   * falling back to a payload-based key for legacy callers.
   */
  async handleOutboxEvent(event: {
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<void> {
    // Prefer the caller-provided key (unique per user action) over the old
    // payload-based key (which silently suppresses repeated identical actions).
    const dedupeKey = event.idempotencyKey
      ?? `direct:${event.eventType}:${event.aggregateId}:${JSON.stringify(event.payload)}`;
    await this.processNotification({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      idempotencyKey: dedupeKey,
    });
  }

  /**
   * Direct synchronous notification — creates notification + emits via socket
   * in the same request. Use this for user-initiated actions that need instant
   * UI feedback (provider toggles, booking events, payment events, etc.).
   *
   * The outbox still handles email dispatch separately.
   * Returns the NotificationItem if created, null if deduped or no recipients.
   *
   * @param idempotencyKey - Optional caller-provided key (e.g. randomUUID()).
   *   When provided, this key is used as the DB idempotency key instead of
   *   the payload-based key. This allows the same action to produce multiple
   *   notifications over time (e.g. user toggles provider on/off/on).
   *   The same key MUST also be passed to outboxWriter.writeSafe() so the
   *   direct and outbox paths share one dedup identity.
   */
  async notifyDirect(input: {
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<NotificationItem | null> {
    // Prefer caller-provided key (unique per action) over payload-based key
    const dedupeKey = input.idempotencyKey
      ?? `direct:${input.eventType}:${input.aggregateId}:${JSON.stringify(input.payload)}`;
    return this.processNotification({
      ...input,
      idempotencyKey: dedupeKey,
    });
  }

  /**
   * Core notification logic shared by handleOutboxEvent and notifyDirect.
   * Resolves recipients, creates notification record, emits via Socket.IO.
   */
  private async processNotification(event: {
    eventType: string;
    aggregateType?: string;
    aggregateId?: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<NotificationItem | null> {
    const mapping = NOTIFICATION_EVENT_MAP[event.eventType];
    if (!mapping) {
      // Unmapped internal workflow events (e.g. booking.supplier_confirmed)
      // have no user-facing notification — skip silently instead of running
      // recipient resolution + dedup writes for nothing.
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug(`[notif] unmapped event skipped: ${event.eventType}`);
      }
      return null;
    }

    const rules = await this.getRules();
    const rule = rules.find((r: any) => r.type === event.eventType);

    if (rule && !rule.enabled) return null;

    const severity = rule?.severity ?? mapping.severity;
    const critical = rule?.critical ?? mapping.critical;

    const recipientUserIds = await this.recipientResolver.resolveRecipients(
      event.eventType,
      critical,
    );

    if (recipientUserIds.length === 0) {
      this.logger.warn(`[notif] No recipients for ${event.eventType} — skipping`);
      return null;
    }

    const { title, message } = await this.buildNotificationContent(event.eventType, event.payload);

    const notifId = await this.repo.createNotification({
      type: event.eventType,
      title,
      message,
      severity,
      category: mapping.category,
      entityType: event.aggregateType ?? undefined,
      entityId: event.aggregateId ?? undefined,
      actorUserId: (event.payload as any)?.userId,
      metadata: event.payload,
      idempotencyKey: event.idempotencyKey,
      recipientUserIds,
    });

    if (!notifId) {
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug(`[notif] Deduped: ${event.eventType} key=${event.idempotencyKey}`);
      }
      return null;
    }

    const notificationItem: NotificationItem = {
      id: notifId,
      type: event.eventType,
      category: mapping.category,
      title,
      message,
      severity: severity as NotificationItem['severity'],
      entityType: event.aggregateType ?? null,
      entityId: event.aggregateId ?? null,
      metadata: event.payload,
      createdAt: new Date().toISOString(),
      readAt: null,
      dismissedAt: null,
    };

    const realtimeRecipients = severity === 'critical'
      ? recipientUserIds
      : await this.filterByPreference(
          recipientUserIds,
          event.eventType,
          'realtime',
        );

    if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
      this.logger.debug(
        `[notif] Created notif ${notifId} for ${event.eventType}: ${recipientUserIds.length} recipients, ${realtimeRecipients.length} realtime`,
      );
    }

    if (realtimeRecipients.length > 0) {
      this.gateway.emitToUsers(realtimeRecipients, notificationItem);
      // Coalesced unread-count push — bursts collapse into one DB read
      // + one `notification:count` emit per user instead of one each.
      this.gateway.emitCountToUsers(realtimeRecipients);
    }

    return notificationItem;
  }

  /**
   * Filters recipient IDs by their notification preference for a given channel.
   */
  private async filterByPreference(
    userIds: string[],
    eventType: string,
    channel: string,
  ): Promise<string[]> {
    if (userIds.length === 0) return [];

    const prefs = await this.prisma.notificationPreference.findMany({
      where: {
        userId: { in: userIds },
        type: eventType,
        channel,
        enabled: false,
      },
      select: { userId: true },
    });

    const disabledSet = new Set(prefs.map((p) => p.userId));
    return userIds.filter((id) => !disabledSet.has(id));
  }

  private async buildNotificationContent(
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<{ title: string; message?: string }> {
    const p = payload as Record<string, any>;
    // Resolved once per call (payload is fixed) — decimals-aware via
    // CurrencyService instead of the old naive `${amount} ${currency ?? 'USD'}`
    // (no rounding, wrong decimals guaranteed, hardcoded USD fallback).
    const formattedAmount =
      p?.amount != null
        ? await this.currencyService.formatWithCode(Number(p.amount), String(p?.currency ?? 'USD'))
        : 'unknown amount';
    const bookingLabel = (bookingId: unknown): string =>
      bookingId ? `booking ${shortRef(bookingId)}` : 'a booking';

    const templates: Record<string, (p: any) => { title: string; message?: string }> = {
      'booking.flight.created': () => ({
        title: 'New Flight Booking',
        message: `Flight booking created for ${formattedAmount}`,
      }),
      'booking.hotel.created': () => ({
        title: 'New Hotel Booking',
        message: `Hotel booking created for ${formattedAmount}`,
      }),
      'booking.confirmed': (p) => ({
        title: 'Booking Confirmed',
        message: `${bookingLabel(p?.bookingId)} has been confirmed`,
      }),
      'booking.issued': (p) => ({
        title: 'Booking Issued',
        message: `${bookingLabel(p?.bookingId)} has been issued${p?.locatorCode ? ` (PNR ${p.locatorCode})` : ''}`,
      }),
      'booking.awaiting_issue': (p) => ({
        title: 'Booking Awaiting Issue',
        message: `${bookingLabel(p?.bookingId)} is paid and waiting for admin issue`,
      }),
      'booking.failed': (p) => ({
        title: 'Booking Failed',
        message: `${bookingLabel(p?.bookingId)} has failed`,
      }),
      'booking.cancelled': (p) => ({
        title: 'Booking Cancelled',
        message: `${bookingLabel(p?.bookingId)} has been cancelled`,
      }),
      'payment.succeeded': () => ({
        title: 'Payment Succeeded',
        message: `Payment of ${formattedAmount} succeeded`,
      }),
      'payment.failed': () => ({
        title: 'Payment Failed',
        message: `Payment of ${formattedAmount} failed`,
      }),
      'refund.requested': () => ({
        title: 'Refund Requested',
        message: `Refund requested for ${formattedAmount}`,
      }),
      'refund.completed': () => ({
        title: 'Refund Completed',
        message: `Refund of ${formattedAmount} completed`,
      }),
      'agent.credit.near_limit': (p) => ({
        title: 'Agent Credit Near Limit',
        message: p?.agentName
          ? `Agent ${p.agentName} is near the credit limit`
          : 'Agent credit is near the limit',
      }),
      'agent.credit.exceeded': (p) => ({
        title: 'Agent Credit Exceeded',
        message: p?.agentName
          ? `Agent ${p.agentName} has exceeded the credit limit`
          : 'Agent credit limit has been exceeded',
      }),
      'user.staff.created': (p) => ({
        title: 'New Staff User Created',
        message: p?.email ? `Staff account created for ${p.email}` : 'A new staff user has been created',
      }),
      'user.staff.deleted': (p) => ({
        title: 'Staff User Deleted',
        message: p?.email ? `Staff account ${p.email} was deleted` : 'A staff user has been deleted',
      }),
      'role.updated': (p) => ({
        title: 'Role Updated',
        message: p?.roleName ? `Role "${p.roleName}" has been updated` : 'A role has been updated',
      }),
      'role.permission_changed': (p) => ({
        title: 'Role Permissions Changed',
        message: p?.roleName
          ? `Permissions of role "${p.roleName}" have been modified`
          : 'Role permissions have been modified',
      }),
      'settings.provider_credentials_updated': (p) => ({
        title: 'Provider Credentials Updated',
        message: p?.provider
          ? `Credentials for ${p.provider} have been updated`
          : 'Provider credentials have been updated',
      }),
      'settings.provider_toggled': (p) => ({
        title: `Provider ${p.enabled ? 'Enabled' : 'Disabled'}`,
        message: `${p.provider ?? 'Provider'} (${p.module ?? 'module'}) has been ${p.enabled ? 'enabled' : 'disabled'}`,
      }),
      'settings.payment_gateway_updated': () => ({
        title: 'Payment Gateway Updated',
        message: 'Payment gateway configuration has been updated',
      }),
      'provider.travelport.failure': (p) => ({
        title: 'Travelport Provider Failure',
        message: p?.error
          ? `Travelport error: ${String(p.error).slice(0, 120)}`
          : 'Travelport provider has encountered an error',
      }),
      'provider.duffel.failure': (p) => ({
        title: 'Duffel Provider Failure',
        message: p?.error
          ? `Duffel error: ${String(p.error).slice(0, 120)}`
          : 'Duffel provider has encountered an error',
      }),
      'provider.hotelbeds.failure': (p) => ({
        title: 'Hotelbeds Provider Failure',
        message: p?.error
          ? `Hotelbeds error: ${String(p.error).slice(0, 120)}`
          : 'Hotelbeds provider has encountered an error',
      }),
    };

    const template = templates[eventType];
    if (template) return template(payload);

    return {
      title: eventType.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      message: undefined,
    };
  }
}
