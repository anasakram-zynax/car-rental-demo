import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EMAIL_PROVIDER_PORT } from '../infrastructure/providers/email-provider.port';
import type { EmailProviderPort } from '../infrastructure/providers/email-provider.port';
import { PrismaEmailRepository } from '../infrastructure/prisma-email.repository';
import { EmailService } from './email.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { EmailMessageStatus, EmailRecipientStatus, EmailDeliveryStatus } from '../domain/email-status.enum';
import type { EmailSendInput } from '../domain/email-event-types';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000];

@Injectable()
export class EmailDispatcherService {
  private readonly logger = new Logger(EmailDispatcherService.name);

  constructor(
    @Inject(EMAIL_PROVIDER_PORT) private readonly provider: EmailProviderPort,
    private readonly repo: PrismaEmailRepository,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  async dispatchMessage(messageId: string) {
    // Read first to check status, retry count, and backoff timing.
    const message = await this.repo.findById(messageId);
    if (!message) {
      this.logger.warn(`Email message not found: ${messageId}`);
      return;
    }

    // Dead letter check
    const retryCount = message.retryCount ?? 0;
    if (retryCount >= MAX_RETRIES) {
      this.logger.warn(`Email ${messageId} exceeded max retries (${MAX_RETRIES}), moving to dead letter`);
      await this.emailService.markDeadLetter(message.id);
      return;
    }

    // Determine which status to atomically claim based on current state
    let claimStatus: EmailMessageStatus;
    if (message.status === EmailMessageStatus.QUEUED) {
      claimStatus = EmailMessageStatus.QUEUED;
    } else if (message.status === EmailMessageStatus.FAILED) {
      // Check backoff before claiming
      const backoffMs = RETRY_BACKOFF_MS[Math.min(retryCount, RETRY_BACKOFF_MS.length - 1)];
      const lastAttempt = message.updatedAt?.getTime?.() ?? 0;
      const elapsed = Date.now() - lastAttempt;
      if (elapsed < backoffMs) {
        return; // Backoff not elapsed — let cron worker retry later
      }
      claimStatus = EmailMessageStatus.FAILED;
    } else {
      return; // Already sending/sent/dead-letter — skip
    }

    // Atomic claim: only transition from the expected status → sending.
    // This prevents double-send when immediate dispatch and cron dispatch race.
    const claimResult = await this.prisma.emailMessage.updateMany({
      where: { id: messageId, status: claimStatus },
      data: { status: EmailMessageStatus.SENDING },
    });

    if (claimResult.count !== 1) {
      return; // Already claimed by another process
    }

    const recipients = message.recipients.filter(
      (r) => r.status !== EmailRecipientStatus.SENT,
    );

    if (recipients.length === 0) {
      await this.emailService.markSent(message.id);
      return;
    }

    const from = process.env.EMAIL_FROM ?? 'TravelsOTA <noreply@travelsota.com>';

    let allSucceeded = true;
    let anyFailed = false;

    for (const recipient of recipients) {
      const attemptCount = message.deliveryAttempts.filter(
        (a) => a.recipientEmail === recipient.email,
      ).length;
      const attemptNumber = attemptCount + 1;

      const attempt = await this.repo.createDeliveryAttempt({
        emailMessageId: message.id,
        recipientEmail: recipient.email,
        provider: 'pending',
        attempt: attemptNumber,
        status: EmailDeliveryStatus.PENDING,
      });

      try {
        const sendInput: EmailSendInput = {
          from,
          to: recipient.email,
          subject: message.subject,
          html: message.html,
          text: message.text ?? undefined,
        };

        const result = await this.provider.send(sendInput);

        await this.repo.updateDeliveryAttemptStatus(
          attempt.id,
          EmailDeliveryStatus.SENT,
          undefined,
          { ...result as unknown as Record<string, unknown>, provider: result.provider },
        );
        await this.repo.updateDeliveryAttemptProvider(attempt.id, result.provider);
        await this.repo.updateRecipientStatus(
          recipient.id,
          EmailRecipientStatus.SENT,
          result.providerMessageId,
        );

        this.logger.log(`Email sent to ${recipient.email} via ${result.provider} (${result.providerMessageId})`);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.repo.updateDeliveryAttemptStatus(attempt.id, EmailDeliveryStatus.FAILED, errorMsg);
        await this.repo.updateRecipientStatus(recipient.id, EmailRecipientStatus.FAILED, undefined, errorMsg);
        allSucceeded = false;
        anyFailed = true;
        this.logger.error(`Email failed for ${recipient.email}: ${errorMsg}`);
      }
    }

    if (allSucceeded) {
      await this.emailService.markSent(message.id);
      await this.onDispatchSuccess(message);
    } else if (anyFailed) {
      const nextRetry = retryCount + 1;
      if (nextRetry >= MAX_RETRIES) {
        await this.emailService.markDeadLetter(message.id);
        this.logger.warn(`Email ${messageId} moved to dead letter after ${nextRetry} retries`);
      } else {
        await this.emailService.markFailed(message.id, nextRetry);
      }
    }
  }

  async dispatchAllPending(limit = 10) {
    const pending = await this.emailService.dispatchPending(limit);

    for (const message of pending) {
      try {
        await this.dispatchMessage(message.id);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to dispatch email ${message.id}: ${errorMsg}`);
        await this.emailService.markFailed(message.id);
      }
    }
  }

  private async onDispatchSuccess(message: { type: string; aggregateId?: string | null }) {
    if (message.type === 'INVOICE_EMAIL' && message.aggregateId) {
      try {
        await this.prisma.bookingDocument.updateMany({
          where: { id: message.aggregateId, status: 'email_pending' },
          data: { status: 'sent', sentAt: new Date() },
        });
        this.logger.log(`Invoice ${message.aggregateId} marked as email sent`);
      } catch (err) {
        this.logger.error(`Failed to mark invoice as sent: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
}
