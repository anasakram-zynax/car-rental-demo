import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as cookie from 'cookie';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import type { NotificationItem } from '../domain/notification-types';

interface AuthenticatedSocket extends Socket {
  data: {
    userId?: string;
    pendingVerification?: boolean;
  };
}

interface UnreadCountPayload {
  total: number;
  critical: number;
  high: number;
  info: number;
}

/** Window during which further count pushes for a user are coalesced. */
const COUNT_COALESCE_MS = 150;

interface JwtPayload {
  sub: string;
  email: string;
  role: string | null;
  userType: string;
  iat: number;
}

/**
 * Socket.IO gateway for realtime notification delivery.
 *
 * Authentication flow:
 * 1. Parse JWT from httpOnly `access_token` cookie (sync, fast).
 * 2. If JWT is invalid → disconnect immediately.
 * 3. If JWT is valid → store userId on socket, fire async DB verification.
 * 4. DB verification: load user, check ACTIVE status + notifications:read.
 *    Only THEN join the room and add to connectedUsers.
 * 5. If verification fails → disconnect.
 *
 * This ensures no user receives notifications before they are fully verified.
 */
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/notifications',
  transports: ['websocket', 'polling'],
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private readonly connectedUsers = new Map<string, Set<string>>();
  /** Pending coalesced count pushes: userId -> timer. */
  private readonly countBuffer = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  handleConnection(client: AuthenticatedSocket): void {
    try {
      // Step 1: Parse JWT synchronously (fast, no DB)
      const userId = this.parseJwtFromCookie(client);
      if (!userId) {
        client.disconnect(true);
        return;
      }

      // Step 2: Store userId but do NOT join room yet — pending async verification
      client.data.userId = userId;
      client.data.pendingVerification = true;

      // Step 3: Async DB verification — joins room only if verified
      this.verifyAndJoin(client, userId).catch(() => {
        // Error handled inside verifyAndJoin
      });
    } catch (err) {
      this.logger.warn(`Socket connection error: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data.userId;
    if (userId && !client.data.pendingVerification) {
      const sockets = this.connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) this.connectedUsers.delete(userId);
      }
      if (!this.connectedUsers.has(userId)) {
        const pending = this.countBuffer.get(userId);
        if (pending) {
          clearTimeout(pending);
          this.countBuffer.delete(userId);
        }
      }
    }
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.emit('pong', { timestamp: Date.now() });
  }

  /**
   * Client-driven catch-up: after a reconnect (or on demand) the client asks
   * for fresh unread counts so events missed while disconnected converge
   * without waiting for the next poll.
   */
  @SubscribeMessage('sync')
  handleSync(@ConnectedSocket() client: AuthenticatedSocket): void {
    const userId = client.data.userId;
    if (!userId || client.data.pendingVerification) return;
    void this.emitFreshCount(userId);
  }

  emitToUsers(userIds: string[], notification: NotificationItem): void {
    if (!this.server) {
      this.logger.warn('emitToUsers called but server is not initialized');
      return;
    }

    try {
      for (const userId of userIds) {
        const room = `user:${userId}`;
        if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
          this.logger.debug(`emitToUsers → ${room} notif=${notification.id} [${notification.type}]`);
        }
        this.server.to(room).emit('notification:new', notification);
      }
    } catch (err) {
      this.logger.error(
        `emitToUsers failed for notif=${notification.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Push an unread-count update to the given users, coalesced per user:
   * bursts (e.g. 50 bookings in seconds) collapse into ONE DB read and ONE
   * `notification:count` emit per user instead of one per notification.
   */
  emitCountToUsers(userIds: string[]): void {
    for (const userId of userIds) {
      if (this.countBuffer.has(userId)) continue; // push already scheduled
      const timer = setTimeout(() => {
        this.countBuffer.delete(userId);
        void this.emitFreshCount(userId);
      }, COUNT_COALESCE_MS);
      this.countBuffer.set(userId, timer);
    }
  }

  /** Compute fresh unread counts for a user and emit `notification:count`. */
  private async emitFreshCount(userId: string): Promise<void> {
    if (!this.server) return;
    try {
      // Same semantics as PrismaNotificationRepository.getUnreadCount —
      // kept local to avoid a service<->gateway circular dependency.
      const recipients = await this.prisma.notificationRecipient.findMany({
        where: { userId, readAt: null, dismissedAt: null },
        include: { notification: { select: { severity: true } } },
      });
      const counts: UnreadCountPayload = {
        total: recipients.length,
        critical: 0,
        high: 0,
        info: 0,
      };
      for (const r of recipients) {
        const sev = r.notification.severity;
        if (sev === 'critical') counts.critical++;
        else if (sev === 'high') counts.high++;
        else counts.info++;
      }
      this.server.to(`user:${userId}`).emit('notification:count', counts);
    } catch (err) {
      this.logger.warn(
        `emitFreshCount failed for user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  getConnectedCount(userId: string): number {
    return this.connectedUsers.get(userId)?.size ?? 0;
  }

  /**
   * Parse access_token from cookie and verify the JWT synchronously.
   * Returns the userId from the JWT sub claim, or null if invalid.
   */
  private parseJwtFromCookie(client: AuthenticatedSocket): string | null {
    const cookieHeader = client.handshake.headers?.cookie;
    if (!cookieHeader) {
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug('Socket rejected: no cookie header');
      }
      return null;
    }

    const cookies = cookie.parse(cookieHeader);
    const token = cookies.access_token;
    if (!token) {
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug('Socket rejected: no access_token cookie');
      }
      return null;
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, this.config.auth.jwtSecret) as JwtPayload;
    } catch {
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug('Socket rejected: invalid JWT');
      }
      return null;
    }

    if (!payload.sub) {
      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug('Socket rejected: JWT missing sub');
      }
      return null;
    }

    return payload.sub;
  }

  /**
   * Verify user in DB, check ACTIVE status and notifications:read permission.
   * Only joins the room and registers in connectedUsers if ALL checks pass.
   */
  private async verifyAndJoin(client: AuthenticatedSocket, userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          deletedAt: true,
          role: {
            select: {
              name: true,
              permissions: {
                select: {
                  permission: { select: { code: true } },
                },
              },
            },
          },
        },
      });

      if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
        if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
          this.logger.debug(`Socket rejected: user ${userId} not found, inactive, or deleted`);
        }
        client.disconnect(true);
        return;
      }

      const hasPermission =
        user.role?.name === 'super_admin' ||
        user.role?.name === 'admin' ||
        user.role?.permissions.some((rp) => rp.permission.code === 'notifications:read');

      if (!hasPermission) {
        if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
          this.logger.debug(`Socket rejected: user ${userId} lacks notifications:read`);
        }
        client.disconnect(true);
        return;
      }

      // All checks passed — now join the room and register
      client.data.pendingVerification = false;
      client.join(`user:${userId}`);

      // Sync unread counts immediately on every (re)connect so a client
      // that missed events while disconnected converges without waiting
      // for its next poll.
      void this.emitFreshCount(userId);

      let sockets = this.connectedUsers.get(userId);
      if (!sockets) {
        sockets = new Set();
        this.connectedUsers.set(userId, sockets);
      }
      sockets.add(client.id);

      if (process.env.ENABLE_NOTIFICATION_DEBUG === 'true') {
        this.logger.debug(`Socket verified and joined: ${client.id} user=${userId}`);
      }
    } catch (err) {
      this.logger.warn(`Socket auth verification failed: ${err instanceof Error ? err.message : String(err)}`);
      client.disconnect(true);
    }
  }
}
