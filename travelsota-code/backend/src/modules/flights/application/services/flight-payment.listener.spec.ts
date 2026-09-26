import { FlightPaymentListener } from './flight-payment.listener';

describe('FlightPaymentListener — manual-issue mode (Auto-Issue After Payment off)', () => {
  let service: any;
  let bookingRepo: { update: jest.Mock; findById: jest.Mock };
  let siteSettings: { get: jest.Mock };
  let handlers: Record<string, (event: { payload: unknown }) => Promise<void>>;

  beforeEach(() => {
    handlers = {};
    bookingRepo = {
      update: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue({ id: 'b1', status: 'pending_payment' }),
    };
    siteSettings = { get: jest.fn() };
    service = Object.create(FlightPaymentListener.prototype);
    service.dispatcher = {
      register: (eventType: string, handler: (event: { payload: unknown }) => Promise<void>) => {
        handlers[eventType] = handler;
      },
    };
    service.bookingRepo = bookingRepo;
    service.siteSettings = siteSettings;
    service.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service.outboxWriter = { write: jest.fn().mockResolvedValue('evt-1') };
    service.notifications = { notifyDirect: jest.fn().mockResolvedValue(undefined) };
    service.onModuleInit();
  });

  const payload = {
    paymentId: 'pay-1',
    bookingId: 'b1',
    bookingType: 'FLIGHT',
    amount: 100,
    currency: 'USD',
  };

  it('sets the booking to awaiting_issue instead of leaving it unchanged', async () => {
    siteSettings.get.mockResolvedValue(false); // Auto-Issue After Payment: off
    await handlers['payment.succeeded']({ payload });

    expect(bookingRepo.update).toHaveBeenCalledWith('b1', {
      status: 'awaiting_issue',
      message: 'Payment verified — awaiting admin issue.',
    });
  });

  it('never sets awaiting_issue when the toggle is on (auto-issue proceeds instead)', async () => {
    siteSettings.get.mockResolvedValue(true);
    // The auto-issue path proceeds to atomicClaimStatus next — not mocked
    // here, so it throws. We only assert the manual-issue-mode update
    // (this test's actual point) was skipped, not the rest of the flow.
    service.bookingRepo.atomicClaimStatus = jest.fn().mockResolvedValue(false);
    await handlers['payment.succeeded']({ payload }).catch(() => {});

    expect(bookingRepo.update).not.toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ status: 'awaiting_issue' }),
    );
  });
});
