import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import { EmailMessageStatus, EmailRecipientStatus, EmailDeliveryStatus } from '../domain/email-status.enum';

@Injectable()
export class PrismaEmailRepository {
  private readonly logger = new Logger(PrismaEmailRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createMessage(data: {
    type: string;
    templateKey: string;
    subject: string;
    html: string;
    text?: string;
    status?: string;
    severity?: string;
    aggregateType?: string;
    aggregateId?: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    scheduledAt?: Date;
  }) {
    return this.prisma.emailMessage.create({
      data: {
        type: data.type,
        templateKey: data.templateKey,
        subject: data.subject,
        html: data.html,
        text: data.text ?? null,
        status: data.status ?? EmailMessageStatus.QUEUED,
        severity: data.severity ?? 'info',
        aggregateType: data.aggregateType ?? null,
        aggregateId: data.aggregateId ?? null,
        idempotencyKey: data.idempotencyKey,
        metadata: data.metadata ? (data.metadata as any) : undefined,
        scheduledAt: data.scheduledAt ?? new Date(),
      },
    });
  }

  async createMessageOnce(data: Parameters<PrismaEmailRepository['createMessage']>[0]) {
    try {
      return await this.createMessage(data);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        this.logger.debug(`Duplicate email message skipped: ${data.idempotencyKey}`);
        return null;
      }
      throw err;
    }
  }

  async createRecipient(data: {
    emailMessageId: string;
    email: string;
    recipientType?: string;
    status?: string;
  }) {
    return this.prisma.emailRecipient.create({
      data: {
        emailMessageId: data.emailMessageId,
        email: data.email,
        recipientType: data.recipientType ?? 'customer',
        status: data.status ?? EmailRecipientStatus.QUEUED,
      },
    });
  }

  async createDeliveryAttempt(data: {
    emailMessageId: string;
    recipientEmail: string;
    provider?: string;
    attempt?: number;
    status?: string;
    error?: string;
    response?: Record<string, unknown>;
  }) {
    return this.prisma.emailDeliveryAttempt.create({
      data: {
        emailMessageId: data.emailMessageId,
        recipientEmail: data.recipientEmail,
        provider: data.provider ?? 'resend',
        attempt: data.attempt ?? 1,
        status: data.status ?? EmailDeliveryStatus.PENDING,
        error: data.error ?? null,
        response: data.response ? (data.response as any) : undefined,
      },
    });
  }

  async updateMessageStatus(id: string, status: string, sentAt?: Date, retryCount?: number) {
    return this.prisma.emailMessage.update({
      where: { id },
      data: {
        status,
        ...(sentAt ? { sentAt } : {}),
        ...(retryCount !== undefined ? { retryCount } : {}),
        updatedAt: new Date(),
      },
    });
  }

  async updateRecipientStatus(id: string, status: string, providerMessageId?: string, lastError?: string) {
    return this.prisma.emailRecipient.update({
      where: { id },
      data: {
        status,
        ...(providerMessageId ? { providerMessageId } : {}),
        ...(lastError ? { lastError } : {}),
      },
    });
  }

  async updateDeliveryAttemptStatus(id: string, status: string, error?: string, response?: Record<string, unknown>) {
    return this.prisma.emailDeliveryAttempt.update({
      where: { id },
      data: {
        status,
        ...(error ? { error } : {}),
        ...(response ? { response: response as any } : {}),
      },
    });
  }

  async updateDeliveryAttemptProvider(id: string, provider: string) {
    return this.prisma.emailDeliveryAttempt.update({
      where: { id },
      data: { provider },
    });
  }

  async findById(id: string) {
    return this.prisma.emailMessage.findUnique({
      where: { id },
      include: {
        recipients: { orderBy: { createdAt: 'asc' } },
        deliveryAttempts: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async findMany(params: {
    status?: string;
    type?: string;
    aggregateType?: string;
    aggregateId?: string;
    page?: number;
    limit?: number;
    orderBy?: 'createdAt' | 'scheduledAt';
    order?: 'asc' | 'desc';
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    if (params.aggregateType) where.aggregateType = params.aggregateType;
    if (params.aggregateId) where.aggregateId = params.aggregateId;

    const [items, total] = await Promise.all([
      this.prisma.emailMessage.findMany({
        where,
        include: { recipients: true },
        skip,
        take: limit,
        orderBy: { [params.orderBy ?? 'createdAt']: params.order ?? 'desc' },
      }),
      this.prisma.emailMessage.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getStats() {
    const [total, sent, failed, queued, deadLetter] = await Promise.all([
      this.prisma.emailMessage.count(),
      this.prisma.emailMessage.count({ where: { status: EmailMessageStatus.SENT } }),
      this.prisma.emailMessage.count({ where: { status: EmailMessageStatus.FAILED } }),
      this.prisma.emailMessage.count({ where: { status: EmailMessageStatus.QUEUED } }),
      this.prisma.emailMessage.count({ where: { status: EmailMessageStatus.DEAD_LETTER } }),
    ]);

    return { total, sent, failed, queued, deadLetter };
  }

  async getFailedMessages(limit = 20) {
    return this.prisma.emailMessage.findMany({
      where: {
        status: { in: [EmailMessageStatus.FAILED, EmailMessageStatus.DEAD_LETTER] },
      },
      include: { recipients: true, deliveryAttempts: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getRules() {
    return this.prisma.emailRule.findMany({ orderBy: { type: 'asc' } });
  }

  async getRuleCount() {
    return this.prisma.emailRule.count();
  }

  async updateRule(id: string, data: {
    enabled?: boolean;
    sendToCustomer?: boolean;
    sendToAgent?: boolean;
    sendToAdmin?: boolean;
    critical?: boolean;
    description?: string;
  }) {
    return this.prisma.emailRule.update({ where: { id }, data });
  }

  async seedDefaultRules() {
    const rules = [
      { type: 'booking.flight.created', sendToCustomer: true, sendToAdmin: true, description: 'New flight booking created' },
      { type: 'booking.hotel.created', sendToCustomer: true, sendToAdmin: true, description: 'New hotel booking created' },
      { type: 'booking.confirmed', sendToCustomer: true, sendToAdmin: true, critical: true, description: 'Booking confirmed by supplier' },
      { type: 'booking.failed', sendToCustomer: true, sendToAdmin: true, critical: true, description: 'Booking failed' },
      { type: 'booking.cancelled', sendToCustomer: true, sendToAdmin: true, description: 'Booking cancelled' },
      { type: 'payment.succeeded', sendToAdmin: true, description: 'Payment received' },
      { type: 'payment.failed', sendToCustomer: true, sendToAdmin: true, critical: true, description: 'Payment failed' },
      { type: 'refund.completed', sendToCustomer: true, sendToAdmin: true, description: 'Refund processed' },
      { type: 'INVOICE_EMAIL', sendToCustomer: true, sendToAgent: true, description: 'Invoice ready' },
    ];

    for (const rule of rules) {
      await this.prisma.emailRule.upsert({
        where: { type: rule.type },
        create: {
          type: rule.type,
          enabled: true,
          sendToCustomer: rule.sendToCustomer ?? false,
          sendToAgent: rule.sendToAgent ?? false,
          sendToAdmin: rule.sendToAdmin ?? false,
          critical: rule.critical ?? false,
          description: rule.description,
        },
        update: {},
      });
    }
  }
}
