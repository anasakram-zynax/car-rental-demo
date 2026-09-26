import { HotelPaymentListener } from './hotel-payment.listener';

describe('HotelPaymentListener — manual-issue mode (Auto-Issue After Payment off)', () => {
  let service: any;
  let bookingRepo: { update: jest.Mock };
  let siteSettings: { get: jest.Mock };
  let handlers: Record<string, (event: { payload: unknown }) => Promise<void>>;

  beforeEach(() => {
    handlers = {};
    bookingRepo = { update: jest.fn().mockResolvedValue(null) };
    siteSettings = { get: jest.fn() };
    service = Object.create(HotelPaymentListener.prototype);
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
    bookingId: 'hb-1',
    bookingType: 'HOTEL',
    amount: 200,
    currency: 'AED',
  };

  it('sets the booking to awaiting_issue instead of leaving it unchanged', async () => {
    siteSettings.get.mockResolvedValue(false); // Auto-Issue After Payment: off
    await handlers['payment.succeeded']({ payload });

    expect(bookingRepo.update).toHaveBeenCalledWith('hb-1', {
      status: 'awaiting_issue',
      message: 'Payment verified — awaiting admin issue.',
    });
  });

  it('never sets awaiting_issue when the toggle is on (auto-issue proceeds instead)', async () => {
    siteSettings.get.mockResolvedValue(true);
    service.bookingService = { confirm: jest.fn().mockResolvedValue({ status: 'booked', fresh: false }) };
    service.promoRedemptionService = { redeemByBookingId: jest.fn().mockResolvedValue(undefined) };
    service.immediateDispatcher = { dispatch: jest.fn() };
    await handlers['payment.succeeded']({ payload });

    expect(bookingRepo.update).not.toHaveBeenCalledWith(
      'hb-1',
      expect.objectContaining({ status: 'awaiting_issue' }),
    );
  });
});
