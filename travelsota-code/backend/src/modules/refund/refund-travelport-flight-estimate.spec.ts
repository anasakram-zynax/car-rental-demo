import { RefundService } from './refund.service';

describe('RefundService.getRefundEstimate (Travelport flights, stored fare rules)', () => {
  let service: any;
  let currencyService: { convert: jest.Mock; formatWithCode: jest.Mock };

  const booking = (over: Record<string, unknown> = {}) => ({
    id: 'fb-1',
    type: 'flight' as const,
    status: 'held',
    userId: 'u1',
    amount: 200,
    currency: 'USD',
    agentProfileId: '',
    createdAt: new Date(),
    provider: 'travelport',
    workflowSummary: {},
    ...over,
  });

  const withPolicy = (refundPolicy: Record<string, unknown>, extra = {}) =>
    booking({ offerSnapshot: { display: { refundPolicy } }, ...extra });

  beforeEach(() => {
    service = Object.create(RefundService.prototype);
    currencyService = {
      convert: jest.fn().mockImplementation(async (amount: number) => ({
        amount: amount / 4, // 4 units of the airline currency per USD
        currency: 'USD',
      })),
      formatWithCode: jest.fn().mockResolvedValue(''),
    };
    service.currencyService = currencyService;
    service.logger = { warn: jest.fn(), log: jest.fn() };
  });

  const estimate = (b: unknown) => {
    jest.spyOn(service, 'findBooking').mockResolvedValue(b);
    return service.getRefundEstimate('fb-1');
  };

  it('charges the full fare for a non-refundable stored policy', async () => {
    const r = await estimate(
      withPolicy({ allowed: false, label: 'Non-refundable', penaltyPercent: 100 }),
    );
    expect(r.cancellationFee).toBe(200);
    expect(r.netRefund).toBe(0);
    expect(r.policiesKnown).toBe(true);
  });

  it('applies a partial percent penalty to the booking total', async () => {
    const r = await estimate(
      withPolicy({ allowed: true, penaltyPercent: 25, free: false, label: 'x' }),
    );
    expect(r.cancellationFee).toBe(50);
    expect(r.netRefund).toBe(150);
    expect(r.feeDescription).toContain('25%');
  });

  it('converts an airline-currency amount into the booking currency', async () => {
    const r = await estimate(
      withPolicy({
        allowed: true,
        penaltyAmount: 400,
        penaltyCurrency: 'INR',
        free: false,
        label: 'x',
      }),
    );
    expect(currencyService.convert).toHaveBeenCalledWith(400, 'INR', 'USD');
    expect(r.cancellationFee).toBe(100);
    expect(r.netRefund).toBe(100);
  });

  it('never invents a fee: unknown rules fall through to policiesKnown:false', async () => {
    const r = await estimate(
      withPolicy({ allowed: true, free: false, label: 'Refund permitted' }),
    );
    expect(r.policiesKnown).toBe(false);
  });

  it('a fake-PNR booking is estimated from the stored policy without a supplier call', async () => {
    const r = await estimate(
      withPolicy(
        { allowed: true, penaltyPercent: 10, free: false, label: 'x' },
        { locatorCode: 'TP-DEV/AB12CD', workflowSummary: { demoMode: true } },
      ),
    );
    expect(r.cancellationFee).toBe(20);
    expect(r.policySource).toBe('snapshot');
  });
});
