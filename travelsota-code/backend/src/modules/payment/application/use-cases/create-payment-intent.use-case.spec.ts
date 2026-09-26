import { Test } from '@nestjs/testing';
import { CreatePaymentIntentUseCase } from './create-payment-intent.use-case';
import { PaymentRepository } from '../../domain/repositories/payment.repository';
import { PaymentOrchestratorService } from '../services/payment-orchestrator.service';
import { PaymentGatewayConfigService } from '../../../settings/application/services/payment-gateway-config.service';
import { BusinessError } from '../../../../shared/errors/business-error';
import { PaymentGateway } from '../../domain/enums/payment-gateway.enum';
import { PaymentStatus } from '../../domain/enums/payment-status.enum';
import { BookingType } from '../../domain/enums/booking-type.enum';

describe('CreatePaymentIntentUseCase', () => {
  let useCase: CreatePaymentIntentUseCase;
  let paymentRepo: jest.Mocked<PaymentRepository>;
  let orchestrator: jest.Mocked<PaymentOrchestratorService>;
  let gatewayConfig: jest.Mocked<PaymentGatewayConfigService>;

  beforeEach(async () => {
    paymentRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByReference: jest.fn(),
      findByProviderPaymentId: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    } as any;

    orchestrator = {
      getGateway: jest.fn(),
    } as any;

    gatewayConfig = {
      getGatewaysSummary: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        CreatePaymentIntentUseCase,
        { provide: PaymentRepository, useValue: paymentRepo },
        { provide: PaymentOrchestratorService, useValue: orchestrator },
        { provide: PaymentGatewayConfigService, useValue: gatewayConfig },
      ],
    }).compile();

    useCase = module.get<CreatePaymentIntentUseCase>(CreatePaymentIntentUseCase);
  });

  afterEach(() => jest.clearAllMocks());

  const validDto = {
    bookingId: 'booking-1',
    bookingType: BookingType.FLIGHT,
    gateway: PaymentGateway.STRIPE,
    amount: 450.00,
    currency: 'USD',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    customerId: 'cus_xxx',
  };

  it('creates payment intent successfully', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'stripe', enabled: true },
    ] as any);
    const mockGateway = {
      createPayment: jest.fn().mockResolvedValue({
        providerPaymentId: 'pi_xxx',
        clientSecret: 'secret_xxx',
        checkoutUrl: null,
      }),
    };
    orchestrator.getGateway.mockReturnValue(mockGateway as any);

    const result = await useCase.execute(validDto);

    expect(result.paymentId).toBeDefined();
    expect(result.clientSecret).toBe('secret_xxx');
    expect(paymentRepo.create).toHaveBeenCalled();
    expect(mockGateway.createPayment).toHaveBeenCalled();
  });

  it('throws PAYMENT_GATEWAY_DISABLED when gateway not enabled', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'stripe', enabled: false },
    ] as any);

    await expect(useCase.execute(validDto)).rejects.toThrow(BusinessError);
  });

  it('throws PAYMENT_CONFLICT when booking already has completed payment', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'stripe', enabled: true },
    ] as any);
    paymentRepo.findMany.mockResolvedValue([
      { id: 'existing-pay', bookingId: 'booking-1', status: PaymentStatus.PAID },
    ] as any);

    await expect(useCase.execute(validDto)).rejects.toThrow(BusinessError);
  });

  it('returns existing pending payment for idempotency', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'stripe', enabled: true },
    ] as any);
    paymentRepo.findMany.mockResolvedValue([
      {
        id: 'existing-pay',
        bookingId: 'booking-1',
        status: PaymentStatus.PENDING,
        reference: 'PAY-ABC',
        providerClientSecret: 'existing_secret',
        providerCheckoutUrl: null,
      },
    ] as any);

    const result = await useCase.execute(validDto);

    expect(result.paymentId).toBe('existing-pay');
    expect(result.clientSecret).toBe('existing_secret');
    expect(paymentRepo.create).not.toHaveBeenCalled();
  });

  it('throws when gateway provider is not registered', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'stripe', enabled: true },
    ] as any);
    orchestrator.getGateway.mockImplementation(() => { throw new Error('Unsupported gateway'); });

    await expect(useCase.execute(validDto)).rejects.toThrow();
  });

  it('handles PayPal gateway correctly', async () => {
    gatewayConfig.getGatewaysSummary.mockResolvedValue([
      { gateway: 'paypal', enabled: true },
    ] as any);
    const mockGateway = {
      createPayment: jest.fn().mockResolvedValue({
        providerPaymentId: 'PAYPAL-123',
        clientSecret: null,
        checkoutUrl: 'https://paypal.com/checkout/123',
      }),
    };
    orchestrator.getGateway.mockReturnValue(mockGateway as any);

    const result = await useCase.execute({
      ...validDto,
      gateway: PaymentGateway.PAYPAL,
    });

    expect(result.checkoutUrl).toBe('https://paypal.com/checkout/123');
    expect(result.clientSecret).toBeNull();
  });
});
