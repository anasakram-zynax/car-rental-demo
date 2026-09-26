import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { ScheduleModule, Cron, CronExpression } from "@nestjs/schedule";
import { PaymentOrchestratorService } from "./application/services/payment-orchestrator.service";
import { CreatePaymentIntentUseCase } from "./application/use-cases/create-payment-intent.use-case";
import { PaymentRepository } from "./domain/repositories/payment.repository";
import { StripeGateway } from "./infrastructure/stripe/stripe.gateway";
import { PaymentsController } from "./api/controllers/payments.controller";
import { GetPaymentUseCase } from "./application/use-cases/get-payment.use-case";
import { ConfirmPaymentUseCase } from "./application/use-cases/confirm-payment.use-case";
import { HandleWebhookUseCase } from "./application/use-cases/handle-webhook.use-case";
import { StripeWebhookHandler } from "./infrastructure/stripe/stripe-webhook.handler";
import { PrismaPaymentRepository } from "./infrastructure/persistence/prisma-payment.repository";
import { PaypalGateway } from "./infrastructure/paypal/paypal-gateway";
import { PaypalWebhookHandler } from "./infrastructure/paypal/paypal-webhook.handler";
import { HandlePaypalWebhookUseCase } from "./application/use-cases/handle-paypal-webhook.use-case";
import { PAYMENT_GATEWAY_REGISTRY } from "./domain/constants/payment-gateway-registry.constant";
import { PaymentGateway } from "./domain/enums/payment-gateway.enum";
import { PaymentGatewayInterface } from "./domain/interfaces/payment-gateway.interface";
import { ListPaymentsUseCase } from "./application/use-cases/list-payments.use-case";
import { CancelPaymentUseCase } from "./application/use-cases/cancel-payment.use-case";
import { SettingsModule } from "../settings/settings.module";
import { PrismaModule } from "../../shared/database/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { CurrencyModule } from "../currency/currency.module";
import { PrismaService } from "../../shared/database/prisma.service";
import { PostgresAdvisoryLockService } from "../../shared/locks/postgres-advisory-lock.service";


@Module({
    imports: [SettingsModule, PrismaModule, NotificationsModule, CurrencyModule],
    controllers: [
        PaymentsController,
    ],
    providers: [
        StripeGateway,
        PaypalGateway,
        PaymentOrchestratorService,
        CreatePaymentIntentUseCase,
        GetPaymentUseCase,
        ConfirmPaymentUseCase,
        HandleWebhookUseCase,
        StripeWebhookHandler,
        PaypalWebhookHandler,
        HandlePaypalWebhookUseCase,
        ListPaymentsUseCase,
        CancelPaymentUseCase,
        {
            provide: PAYMENT_GATEWAY_REGISTRY,
            useFactory: (
                stripeGateway: StripeGateway,
                paypalGateway: PaypalGateway,
            ) => {
                return new Map<
                    PaymentGateway,
                    PaymentGatewayInterface
                >([
                    [
                        PaymentGateway.STRIPE,
                        stripeGateway,
                    ],
                    [
                        PaymentGateway.PAYPAL,
                        paypalGateway,
                    ],
                ]);
            },
            inject: [
                StripeGateway,
                PaypalGateway,
            ],
        },
        {
            provide: PaymentRepository,
            useClass: PrismaPaymentRepository,
        },
    ],
    exports: [
        CreatePaymentIntentUseCase,
        PaymentRepository,
        PaymentOrchestratorService,
    ],
})
export class PaymentsModule implements OnModuleInit {
  private readonly logger = new Logger(PaymentsModule.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lockService: PostgresAdvisoryLockService,
  ) {}

  onModuleInit(): void {
    this.logger.log('PaymentsModule initialized — payment expiry cron registered');
  }

  /**
   * Runs every hour — expires payments that have been PENDING for more than 24 hours.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStalePayments(): Promise<void> {
    if (process.env.ENABLE_PAYMENT_SCHEDULER !== 'true') return;
    await this.lockService.withLock('payment-expire-stale', async () => {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const result = await this.prisma.payment.updateMany({
        where: {
          status: 'PENDING',
          createdAt: { lte: cutoff },
        },
        data: { status: 'CANCELLED' },
      });
      if (result.count > 0) {
        this.logger.log(`Expired ${result.count} stale payment(s) older than 24h`);
      }
    }, { ttlMs: 120_000 });
  }
}