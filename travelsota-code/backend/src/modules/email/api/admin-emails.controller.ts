import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { EmailService } from '../application/email.service';
import { EmailDispatcherService } from '../application/email-dispatcher.service';
import { EmailTemplateKey } from '../domain/email-template-key.enum';
import {
  ListEmailsDto,
  UpdateEmailRuleDto,
  TestEmailDto,
} from './dto/admin-email.dto';

@UserTypes('admin')
@Controller('admin/emails')
export class AdminEmailsController {
  constructor(
    private readonly emailService: EmailService,
    private readonly dispatcher: EmailDispatcherService,
  ) {}

  @Get()
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Emails retrieved.')
  async listEmails(@Query() query: ListEmailsDto) {
    return this.emailService.getMessages({
      status: query.status,
      type: query.type,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Get('stats')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Email stats retrieved.')
  async getStats() {
    return this.emailService.getStats();
  }

  @Get('rules')
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Email rules retrieved.')
  async getRules() {
    return this.emailService.getRules();
  }

  @Put('rules/:id')
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Email rule updated.')
  async updateRule(
    @Param('id') id: string,
    @Body() body: UpdateEmailRuleDto,
  ) {
    return this.emailService.updateRule(id, body);
  }

  @Get(':id')
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Email detail retrieved.')
  async getEmail(@Param('id') id: string) {
    return this.emailService.getMessageById(id);
  }

  @Post(':id/retry')
  @RequirePermission(PermissionCode.EMAILS_RETRY)
  @ResponseMessage('Email queued for retry.')
  async retryEmail(@Param('id') id: string) {
    await this.emailService.retryMessage(id);
    await this.dispatcher.dispatchMessage(id);
    return { retried: true };
  }

  @Post('test')
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Test email queued.')
  async sendTestEmail(@Body() body: TestEmailDto) {
    const recipients = [{ email: body.email, recipientType: 'admin' as const }];
    const data = {
      testId: `test-${Date.now()}`,
      subject: body.subject ?? 'TravelsOTA Test Email',
      message: body.message ?? 'This is a test email from TravelsOTA admin panel.',
      sentAt: new Date().toISOString(),
    };

    const result = await this.emailService.createAndQueueEmail({
      type: 'admin.test',
      templateKey: EmailTemplateKey.TEST_EMAIL,
      idempotencyKey: `email:admin.test:${Date.now()}`,
      data,
      recipients,
    });

    if (result) {
      await this.dispatcher.dispatchMessage(result.id);
    }

    return { queued: true, messageId: result?.id ?? null };
  }

  @Post('dispatch-pending')
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Pending emails dispatched.')
  async dispatchPending() {
    await this.dispatcher.dispatchAllPending(10);
    return { dispatched: true };
  }
}
