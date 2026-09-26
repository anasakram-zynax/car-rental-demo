import { Test } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { PrismaNotificationRepository } from '../infrastructure/prisma-notification.repository';
import { NotificationRecipientResolverService } from './notification-recipient-resolver.service';
import { NotificationGateway } from '../api/notification.gateway';
import { PrismaService } from '../../../shared/database/prisma.service';

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: jest.Mocked<PrismaNotificationRepository>;
  let resolver: jest.Mocked<NotificationRecipientResolverService>;
  let gateway: jest.Mocked<NotificationGateway>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    repo = {
      list: jest.fn(),
      getUnreadCount: jest.fn(),
      getCriticalNotifications: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
      dismiss: jest.fn(),
      getPreferences: jest.fn(),
      updatePreference: jest.fn(),
      getRules: jest.fn(),
      updateRule: jest.fn(),
      createNotification: jest.fn(),
    } as any;

    resolver = {
      resolveRecipients: jest.fn(),
    } as any;

    gateway = {
      emitToUsers: jest.fn(),
      emitCountToUsers: jest.fn(),
    } as any;

    prisma = {
      notificationPreference: {
        findMany: jest.fn(),
      },
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaNotificationRepository, useValue: repo },
        { provide: NotificationRecipientResolverService, useValue: resolver },
        { provide: NotificationGateway, useValue: gateway },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);

    // Default: all rules enabled
    repo.getRules.mockResolvedValue([
      { id: 'r1', type: 'booking.flight.created', enabled: true, severity: 'info', critical: false, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r2', type: 'booking.confirmed', enabled: true, severity: 'high', critical: false, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r3', type: 'booking.failed', enabled: true, severity: 'critical', critical: true, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r4', type: 'booking.cancelled', enabled: true, severity: 'high', critical: false, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r5', type: 'user.staff.created', enabled: true, severity: 'info', critical: false, category: 'user', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r6', type: 'booking.hotel.created', enabled: true, severity: 'info', critical: false, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r7', type: 'payment.succeeded', enabled: true, severity: 'high', critical: false, category: 'payment', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r8', type: 'payment.failed', enabled: true, severity: 'critical', critical: true, category: 'payment', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r9', type: 'refund.requested', enabled: true, severity: 'critical', critical: true, category: 'refund', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r10', type: 'refund.completed', enabled: true, severity: 'high', critical: false, category: 'refund', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r11', type: 'agent.credit.near_limit', enabled: true, severity: 'high', critical: false, category: 'agent_credit', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r12', type: 'agent.credit.exceeded', enabled: true, severity: 'high', critical: false, category: 'agent_credit', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r13', type: 'user.staff.deleted', enabled: true, severity: 'critical', critical: true, category: 'user', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r14', type: 'role.updated', enabled: true, severity: 'critical', critical: true, category: 'role', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r15', type: 'role.permission_changed', enabled: true, severity: 'critical', critical: true, category: 'role', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r16', type: 'settings.provider_credentials_updated', enabled: true, severity: 'critical', critical: true, category: 'settings', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r17', type: 'settings.payment_gateway_updated', enabled: true, severity: 'high', critical: false, category: 'settings', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r18', type: 'provider.travelport.failure', enabled: true, severity: 'critical', critical: true, category: 'provider', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      { id: 'r19', type: 'provider.hotelbeds.failure', enabled: true, severity: 'critical', critical: true, category: 'provider', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
    ] as any);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleOutboxEvent', () => {
    const baseEvent = {
      eventType: 'booking.flight.created',
      aggregateType: 'Booking',
      aggregateId: 'booking-1',
      idempotencyKey: 'booking-1',
      payload: { bookingId: 'booking-1', amount: 100, currency: 'USD' },
    };

    it('creates notification and emits realtime for high severity events', async () => {
      resolver.resolveRecipients.mockResolvedValue(['user-1', 'user-2']);
      repo.createNotification.mockResolvedValue('notif-1');
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      await service.handleOutboxEvent(baseEvent as any);

      expect(resolver.resolveRecipients).toHaveBeenCalledWith('booking.flight.created', false);
      expect(repo.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'booking.flight.created',
          recipientUserIds: ['user-1', 'user-2'],
        }),
      );
    });

    it('skips notification if event type not in NOTIFICATION_EVENT_MAP', async () => {
      const unknownEvent = { ...baseEvent, eventType: 'unknown.event.type' };

      await service.handleOutboxEvent(unknownEvent as any);

      expect(resolver.resolveRecipients).not.toHaveBeenCalled();
      expect(repo.createNotification).not.toHaveBeenCalled();
    });

    it('skips notification if rule is disabled', async () => {
      repo.getRules.mockResolvedValue([
        { id: 'r1', type: 'booking.flight.created', enabled: false, severity: 'info', critical: false, category: 'booking', description: null, createdAt: new Date(), updatedAt: new Date(), roles: [] },
      ] as any);
      resolver.resolveRecipients.mockResolvedValue(['user-1']);

      await service.handleOutboxEvent(baseEvent as any);

      expect(resolver.resolveRecipients).not.toHaveBeenCalled();
      expect(repo.createNotification).not.toHaveBeenCalled();
    });

    it('propagates createNotification errors (handler catches them)', async () => {
      resolver.resolveRecipients.mockResolvedValue(['user-1']);
      repo.createNotification.mockRejectedValue(new Error('DB error'));

      await expect(
        service.handleOutboxEvent(baseEvent as any),
      ).rejects.toThrow('DB error');
    });

    it('critical notifications bypass preference checks', async () => {
      const criticalEvent = {
        ...baseEvent,
        eventType: 'booking.failed',
        payload: { bookingId: 'booking-1', reason: 'supplier timeout' },
      };
      resolver.resolveRecipients.mockResolvedValue(['user-1']);
      repo.createNotification.mockResolvedValue('notif-1');
      prisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'booking.failed', channel: 'realtime', enabled: false },
      ]);

      await service.handleOutboxEvent(criticalEvent as any);

      expect(gateway.emitToUsers).toHaveBeenCalledWith(
        ['user-1'],
        expect.objectContaining({ id: 'notif-1' }),
      );
    });

    it('non-critical high notifications respect preference opt-out', async () => {
      const highEvent = {
        ...baseEvent,
        eventType: 'booking.confirmed',
        payload: { bookingId: 'booking-1' },
      };
      resolver.resolveRecipients.mockResolvedValue(['user-1']);
      repo.createNotification.mockResolvedValue('notif-1');
      prisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 'user-1', type: 'booking.confirmed', channel: 'realtime', enabled: false },
      ]);

      await service.handleOutboxEvent(highEvent as any);

      expect(gateway.emitToUsers).not.toHaveBeenCalled();
    });

    it('info severity events still emit realtime for cache invalidation', async () => {
      const infoEvent = {
        ...baseEvent,
        eventType: 'user.staff.created',
        payload: { userId: 'user-1' },
      };
      resolver.resolveRecipients.mockResolvedValue(['user-1']);
      repo.createNotification.mockResolvedValue('notif-1');
      prisma.notificationPreference.findMany.mockResolvedValue([]);

      await service.handleOutboxEvent(infoEvent as any);

      expect(repo.createNotification).toHaveBeenCalled();
      expect(gateway.emitToUsers).toHaveBeenCalledWith(
        ['user-1'],
        expect.objectContaining({ type: 'user.staff.created', severity: 'info' }),
      );
    });
  });

  describe('list', () => {
    it('delegates to repository', async () => {
      repo.list.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });

      const result = await service.list({ page: 1 } as any);

      expect(repo.list).toHaveBeenCalledWith({ page: 1 });
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
    });
  });

  describe('getUnreadCount', () => {
    it('delegates to repository', async () => {
      repo.getUnreadCount.mockResolvedValue({ total: 5, critical: 1, high: 2, info: 2 });

      const result = await service.getUnreadCount('user-1');

      expect(result).toEqual({ total: 5, critical: 1, high: 2, info: 2 });
    });
  });
});
