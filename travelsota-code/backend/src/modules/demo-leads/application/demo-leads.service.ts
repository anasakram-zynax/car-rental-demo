import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaDemoLeadsRepository } from '../infrastructure/prisma-demo-leads.repository';
import { EmailService } from '../../email/application/email.service';
import { EmailTemplateKey } from '../../email/domain/email-template-key.enum';
import { EmailDispatcherService } from '../../email/application/email-dispatcher.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { BusinessError } from '../../../shared/errors/business-error';

@Injectable()
export class DemoLeadsService {
  private readonly logger = new Logger(DemoLeadsService.name);

  constructor(
    private readonly repo: PrismaDemoLeadsRepository,
    private readonly emailService: EmailService,
    private readonly emailDispatcher: EmailDispatcherService,
    private readonly config: AppConfigService,
  ) {}

  get demoConfig() {
    return this.config.demo;
  }

  /** Single-step demo request: accepts all form fields, returns credentials instantly. */
  async submitDemoRequest(params: {
    email: string;
    name?: string;
    companyName?: string;
    whatsappNumber?: string;
    ipAddress?: string;
  }) {
    const email = params.email.trim().toLowerCase();
    const requestId = randomUUID();

    // Accept any email format — no disposable check, no verification gate
    await this.repo.createLead({
      requestId,
      email,
      name: params.name,
      companyName: params.companyName,
      whatsappNumber: params.whatsappNumber,
      emailStatus: 'PENDING',
      ipAddress: params.ipAddress,
    });

    const cfg = this.demoConfig;
    // ponytail: config (env) is the source of truth for demo creds — DB row can go stale after a rename
    const creds = {
      admin: {
        email: cfg.adminEmail,
        password: cfg.adminPassword,
        dashboardUrl: '/admin',
      },
      agent: {
        email: cfg.agentEmail,
        password: cfg.agentPassword,
        dashboardUrl: '/agent',
      },
      user: {
        email: cfg.userEmail,
        password: cfg.userPassword,
        dashboardUrl: '/',
      },
    };

    const confirmUrl = `${cfg.frontendBaseUrl}/api/v1/public/demo-request/confirm?token=${requestId}`;

    // Send credentials email to visitor (backup)
    const credsMessage = await this.emailService.createAndQueueEmail({
      type: 'DEMO_CREDENTIALS',
      templateKey: EmailTemplateKey.DEMO_CREDENTIALS,
      idempotencyKey: `demo-creds:${requestId}`,
      data: {
        adminEmail: creds.admin.email,
        adminPassword: creds.admin.password,
        adminUrl: `${cfg.frontendBaseUrl}/admin`,
        agentEmail: creds.agent.email,
        agentPassword: creds.agent.password,
        agentUrl: `${cfg.frontendBaseUrl}/agent`,
        userEmail: creds.user.email,
        userPassword: creds.user.password,
        userUrl: cfg.frontendBaseUrl,
        confirmUrl,
        name: params.name,
      },
      recipients: [{ email, recipientType: 'customer' }],
    });

    if (credsMessage) {
      this.emailDispatcher.dispatchMessage(credsMessage.id).catch((err) => {
        this.logger.error(
          `Failed to dispatch credentials email: ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    // Send admin notification email
    const adminMessage = await this.emailService.createAndQueueEmail({
      type: 'ADMIN_DEMO_LEAD',
      templateKey: EmailTemplateKey.ADMIN_DEMO_LEAD,
      idempotencyKey: `admin-demo-lead:${requestId}`,
      data: {
        name: params.name,
        companyName: params.companyName,
        email,
        whatsappNumber: params.whatsappNumber,
        emailStatus: 'PENDING',
        requestedAt: new Date().toISOString(),
      },
      recipients: [{ email: cfg.notificationEmail, recipientType: 'admin' }],
    });

    if (adminMessage) {
      this.emailDispatcher.dispatchMessage(adminMessage.id).catch((err) => {
        this.logger.error(
          `Failed to dispatch admin notification: ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    this.logger.log(
      `Demo request submitted: ${email} (requestId: ${requestId})`,
    );

    return {
      requestId,
      credentials: creds,
      message: 'Demo credentials ready.',
    };
  }

  /** Recovery endpoint: fetch credentials by requestId for the public credentials page */
  async getCredentialsByRequestId(requestId: string) {
    const lead = await this.repo.findLeadByRequestId(requestId);
    if (!lead) throw new BusinessError('DEMO_LEADS_REQUEST_NOT_FOUND');

    const cfg = this.demoConfig;

    return {
      credentials: {
        admin: {
          email: cfg.adminEmail,
          password: cfg.adminPassword,
          dashboardUrl: '/admin',
        },
        agent: {
          email: cfg.agentEmail,
          password: cfg.agentPassword,
          dashboardUrl: '/agent',
        },
        user: {
          email: cfg.userEmail,
          password: cfg.userPassword,
          dashboardUrl: '/',
        },
      },
    };
  }

  /** Kept for backward compat — redirected to single submit */
  async confirmLeadEmail(requestId: string): Promise<string> {
    const lead = await this.repo.findLeadByRequestId(requestId);
    if (!lead) return 'not_found';
    await this.repo.updateEmailStatus(lead.id, 'VERIFIED');
    return 'confirmed';
  }
}
