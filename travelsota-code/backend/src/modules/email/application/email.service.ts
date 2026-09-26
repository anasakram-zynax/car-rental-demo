import { Injectable, Logger } from '@nestjs/common';
import { PrismaEmailRepository } from '../infrastructure/prisma-email.repository';
import { EmailTemplateRenderer } from './email-template-renderer.service';
import { EmailRecipientResolver } from './email-recipient-resolver.service';
import { EmailMessageStatus } from '../domain/email-status.enum';
import type { EmailRecipientInfo } from '../domain/email-event-types';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly repo: PrismaEmailRepository,
    private readonly renderer: EmailTemplateRenderer,
    private readonly recipientResolver: EmailRecipientResolver,
  ) {}

  async createAndQueueEmail(params: {
    type: string;
    templateKey: string;
    idempotencyKey: string;
    data: Record<string, unknown>;
    aggregateType?: string;
    aggregateId?: string;
    severity?: string;
    recipients?: EmailRecipientInfo[];
  }) {
    const template = this.renderer.render(params.templateKey, params.data);

    const message = await this.repo.createMessageOnce({
      type: params.type,
      templateKey: params.templateKey,
      subject: template.subject,
      html: template.html,
      text: template.text,
      severity: params.severity,
      aggregateType: params.aggregateType,
      aggregateId: params.aggregateId,
      idempotencyKey: params.idempotencyKey,
      metadata: params.data as Record<string, unknown>,
    });

    if (!message) {
      this.logger.debug(`Email already exists: ${params.idempotencyKey}`);
      return null;
    }

    const recipients = params.recipients ?? [];
    for (const recipient of recipients) {
      await this.repo.createRecipient({
        emailMessageId: message.id,
        email: recipient.email,
        recipientType: recipient.recipientType,
      });
    }

    this.logger.log(
      `Email queued: id=${message.id.slice(0, 8)} type=${params.type} recipients=${recipients.length}`,
    );

    return message;
  }

  async dispatchPending(limit = 10) {
    const queued = await this.repo.findMany({
      status: EmailMessageStatus.QUEUED,
      limit,
      orderBy: 'scheduledAt',
      order: 'asc',
    });

    const remaining = limit - queued.items.length;
    if (remaining > 0) {
      const retryable = await this.repo.findMany({
        status: EmailMessageStatus.FAILED,
        limit: remaining,
        orderBy: 'scheduledAt',
        order: 'asc',
      });
      return [...queued.items, ...retryable.items];
    }

    return queued.items;
  }

  async markSent(id: string) {
    return this.repo.updateMessageStatus(id, EmailMessageStatus.SENT, new Date());
  }

  async markFailed(id: string, retryCount?: number) {
    return this.repo.updateMessageStatus(id, EmailMessageStatus.FAILED, undefined, retryCount);
  }

  async markDeadLetter(id: string) {
    return this.repo.updateMessageStatus(id, EmailMessageStatus.DEAD_LETTER);
  }

  async markSending(id: string) {
    return this.repo.updateMessageStatus(id, EmailMessageStatus.SENDING);
  }

  async getMessages(params: {
    status?: string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    return this.repo.findMany(params);
  }

  async getMessageById(id: string) {
    return this.repo.findById(id);
  }

  async getStats() {
    return this.repo.getStats();
  }

  async getFailedMessages(limit?: number) {
    return this.repo.getFailedMessages(limit);
  }

  async retryMessage(id: string) {
    return this.repo.updateMessageStatus(id, EmailMessageStatus.QUEUED, undefined, 0);
  }

  async getRules() {
    return this.repo.getRules();
  }

  async updateRule(id: string, data: Parameters<PrismaEmailRepository['updateRule']>[1]) {
    return this.repo.updateRule(id, data);
  }

  async seedRules() {
    return this.repo.seedDefaultRules();
  }
}
