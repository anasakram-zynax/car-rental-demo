import { Test } from '@nestjs/testing';
import { NotificationEventHandlerService } from './notification-event-handler.service';
import { EventDispatcherService } from '../../../shared/outbox/application/event-dispatcher.service';
import { NotificationService } from './notification.service';

describe('NotificationEventHandlerService', () => {
  let service: NotificationEventHandlerService;
  let dispatcher: jest.Mocked<EventDispatcherService>;
  let notificationService: jest.Mocked<NotificationService>;

  beforeEach(async () => {
    dispatcher = {
      register: jest.fn(),
    } as any;

    notificationService = {
      handleOutboxEvent: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        NotificationEventHandlerService,
        { provide: EventDispatcherService, useValue: dispatcher },
        { provide: NotificationService, useValue: notificationService },
      ],
    }).compile();

    service = module.get<NotificationEventHandlerService>(NotificationEventHandlerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('registers handlers for all 21 notification event types on init', () => {
    service.onModuleInit();

    expect(dispatcher.register).toHaveBeenCalledTimes(21);

    const registeredTypes = dispatcher.register.mock.calls.map((call) => call[0]);
    expect(registeredTypes).toContain('booking.flight.created');
    expect(registeredTypes).toContain('booking.hotel.created');
    expect(registeredTypes).toContain('booking.confirmed');
    expect(registeredTypes).toContain('booking.failed');
    expect(registeredTypes).toContain('booking.cancelled');
    expect(registeredTypes).toContain('payment.succeeded');
    expect(registeredTypes).toContain('payment.failed');
    expect(registeredTypes).toContain('refund.requested');
    expect(registeredTypes).toContain('refund.completed');
    expect(registeredTypes).toContain('agent.credit.near_limit');
    expect(registeredTypes).toContain('agent.credit.exceeded');
    expect(registeredTypes).toContain('user.staff.created');
    expect(registeredTypes).toContain('user.staff.deleted');
    expect(registeredTypes).toContain('role.updated');
    expect(registeredTypes).toContain('role.permission_changed');
    expect(registeredTypes).toContain('settings.provider_credentials_updated');
    expect(registeredTypes).toContain('settings.provider_toggled');
    expect(registeredTypes).toContain('settings.payment_gateway_updated');
    expect(registeredTypes).toContain('provider.travelport.failure');
    expect(registeredTypes).toContain('provider.hotelbeds.failure');
  });

  it('delegates to notificationService.handleOutboxEvent when handler is called', async () => {
    service.onModuleInit();

    // Get the registered handler for 'booking.flight.created'
    const handler = dispatcher.register.mock.calls.find(
      (call) => call[0] === 'booking.flight.created',
    )?.[1];

    expect(handler).toBeDefined();

    const event = {
      eventType: 'booking.flight.created',
      aggregateId: 'booking-1',
      payload: { bookingId: 'booking-1' },
    };

    await handler!(event as any);

    expect(notificationService.handleOutboxEvent).toHaveBeenCalledWith(event);
  });

  it('does not throw if notificationService.handleOutboxEvent throws (non-blocking)', async () => {
    notificationService.handleOutboxEvent.mockRejectedValue(new Error('DB error'));

    service.onModuleInit();

    const handler = dispatcher.register.mock.calls.find(
      (call) => call[0] === 'booking.flight.created',
    )?.[1];

    expect(handler).toBeDefined();

    await expect(
      handler!({ eventType: 'booking.flight.created', payload: {} } as any),
    ).resolves.not.toThrow();
  });
});
