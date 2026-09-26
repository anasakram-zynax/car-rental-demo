import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../../shared/database/prisma.module';
import { OutboxModule } from '../../shared/outbox/outbox.module';
import { SettingsModule } from '../settings/settings.module';

import { AdminEmailsController } from './api/admin-emails.controller';
import { AdminEmailSettingsController } from './api/admin-email-settings.controller';
import { EmailConfigService } from './config/email-config.service';
import { EmailService } from './application/email.service';
import { EmailDispatcherService } from './application/email-dispatcher.service';
import { EmailEventHandlerService } from './application/email-event-handler.service';
import { EmailWorkerService } from './application/email-worker.service';
import { EmailRecipientResolver } from './application/email-recipient-resolver.service';
import { EmailTemplateRenderer } from './application/email-template-renderer.service';
import { PrismaEmailRepository } from './infrastructure/prisma-email.repository';
import { EMAIL_PROVIDER_PORT } from './infrastructure/providers/email-provider.port';
import { ResendEmailProvider } from './infrastructure/providers/resend-email.provider';
import { SmtpEmailProvider } from './infrastructure/providers/smtp-email.provider';
import { MockEmailProvider } from './infrastructure/providers/mock-email.provider';
import { FallbackEmailProvider } from './infrastructure/providers/fallback-email.provider';

function createEmailProvider() {
  const provider = (process.env.EMAIL_PROVIDER ?? 'mock').toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';

  switch (provider) {
    case 'resend':
      return new ResendEmailProvider();
    case 'smtp':
      return new SmtpEmailProvider();
    case 'mock':
      return new MockEmailProvider();
    case 'auto':
      return new FallbackEmailProvider();
    default:
      if (isProduction) {
        throw new Error(`Unknown EMAIL_PROVIDER="${provider}" in production. Use resend, smtp, or auto.`);
      }
      console.warn(`Unknown EMAIL_PROVIDER="${provider}", falling back to mock (dev only)`);
      return new MockEmailProvider();
  }
}

@Module({
  imports: [PrismaModule, OutboxModule, ScheduleModule, SettingsModule],
  controllers: [AdminEmailsController, AdminEmailSettingsController],
  providers: [
    { provide: EMAIL_PROVIDER_PORT, useFactory: createEmailProvider },
    PrismaEmailRepository,
    EmailConfigService,
    EmailService,
    EmailDispatcherService,
    EmailEventHandlerService,
    EmailWorkerService,
    EmailRecipientResolver,
    EmailTemplateRenderer,
  ],
  exports: [EmailService, EmailDispatcherService, EMAIL_PROVIDER_PORT],
})
export class EmailModule {}
