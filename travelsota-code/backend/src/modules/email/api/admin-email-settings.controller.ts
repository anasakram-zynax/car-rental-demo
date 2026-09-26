import { Body, Controller, Get, Post, Put, Req, Res } from '@nestjs/common';
import { type Request, type Response } from 'express';
import { UserTypes } from '../../../shared/auth/user-types.decorator';
import { RequirePermission } from '../../access-control/decorators/require-permission.decorator';
import { PermissionCode } from '../../access-control/domain/enums/permission-code.enum';
import { ResponseMessage } from '../../../shared/response/response-message.decorator';
import { EmailConfigService } from '../config/email-config.service';
import { PrismaService } from '../../../shared/database/prisma.service';
import { AppConfigService } from '../../../shared/config/app-config.service';
import { DemoConfigOverrideUtil } from '../../../shared/demo/demo-config-override.util';
import {
  UpdateEmailProviderConfigDto,
  TestEmailProviderConfigDto,
} from './dto/email-settings.dto';

@UserTypes('admin')
@Controller('admin/emails/settings')
export class AdminEmailSettingsController {
  constructor(
    private readonly configService: EmailConfigService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  private get demoEmails(): string[] {
    const modeEmails = this.config.demo.demoModeEmails;
    if (modeEmails) return modeEmails.split(',').map((e) => e.trim()).filter(Boolean);
    const c = this.config.demo;
    return [c.adminEmail, c.agentEmail, c.userEmail];
  }

  private isDemoUser(user: any): boolean {
    return !!user?.email && this.demoEmails.includes(user.email);
  }

  @Get()
  @RequirePermission(PermissionCode.EMAILS_READ)
  @ResponseMessage('Email provider configuration retrieved.')
  async getConfig(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.configService.getConfig();
    const user = (req as any).user;
    if (!this.isDemoUser(user)) return raw;

    const util = new DemoConfigOverrideUtil(this.prisma);
    const sessionId = util.ensureSessionId(req, res);

    // Merge smtp overrides into nested config
    const smtpOverrides = await util.getOverrides(sessionId, 'provider', 'smtp');
    const resendOverrides = await util.getOverrides(sessionId, 'provider', 'resend');

    raw.smtp = util.mergeInto(raw.smtp as Record<string, any>, smtpOverrides) as any;
    raw.resend = util.mergeInto(raw.resend as Record<string, any>, resendOverrides) as any;
    return raw;
  }

  @Put()
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Email provider configuration updated.')
  async updateConfig(
    @Body() body: UpdateEmailProviderConfigDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = (req as any).user;
    if (!this.isDemoUser(user)) {
      return this.configService.updateConfig(body.provider, body as unknown as Record<string, unknown>);
    }

    const util = new DemoConfigOverrideUtil(this.prisma);
    const sessionId = util.ensureSessionId(req, res);
    const entityKey = body.provider; // 'smtp' or 'resend'

    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body as any)) {
      if (v !== undefined && v !== null && k !== 'provider' && k !== 'enabled') {
        fields[k] = String(v);
      }
    }

    await util.saveOverrides(sessionId, 'provider', entityKey, fields);
    return { saved: true, message: 'Email settings saved for your session (expires in 4 hours).' };
  }

  @Post('test')
  @RequirePermission(PermissionCode.EMAILS_MANAGE)
  @ResponseMessage('Email provider connection tested.')
  testConnection(@Body() body: TestEmailProviderConfigDto) {
    return this.configService.testConnection(body.provider, body as unknown as Record<string, unknown>);
  }
}
